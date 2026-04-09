const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// Helper: generate ECR number ER/YY/NNNNN
async function generateEcrNumber() {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `ER/${year}/`;
  const last = await prisma.ecrRecord.findFirst({
    where: { ecrNumber: { startsWith: prefix } },
    orderBy: { ecrNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.ecrNumber.split('/');
    seq = parseInt(parts[2]) + 1;
  }
  return `${prefix}${seq.toString().padStart(5, '0')}`;
}

// Helper: calculate rental using 3-tier system
function calculateRental(holdDays, rateConfig) {
  if (!rateConfig) return 0;

  const safeHoldDays = Math.max(0, Number(holdDays) || 0);
  const freeDays = Math.max(0, Number(rateConfig.rentalFreeDays) || 0);
  if (safeHoldDays <= freeDays) return 0;

  const tierWindow = (fromVal, toVal, defaultFrom, defaultTo) => {
    const from = Math.max(1, Number(fromVal) || defaultFrom);
    const to = Math.max(from, Number(toVal) || defaultTo);
    return to - from + 1;
  };

  let rent = 0;
  let remainingDays = safeHoldDays - freeDays;

  // Tier 1
  if (rateConfig.rentalRate1 && remainingDays > 0) {
    const tier1Days = Math.min(remainingDays, tierWindow(rateConfig.rentalDaysFrom1, rateConfig.rentalDaysTo1, 1, 15));
    rent += tier1Days * parseFloat(rateConfig.rentalRate1);
    remainingDays -= tier1Days;
  }

  // Tier 2
  if (rateConfig.rentalRate2 && remainingDays > 0) {
    const tier2Days = Math.min(remainingDays, tierWindow(rateConfig.rentalDaysFrom2, rateConfig.rentalDaysTo2, 16, 30));
    rent += tier2Days * parseFloat(rateConfig.rentalRate2);
    remainingDays -= tier2Days;
  }

  // Tier 3 (remaining days)
  if (rateConfig.rentalRate3 && remainingDays > 0) {
    rent += remainingDays * parseFloat(rateConfig.rentalRate3);
  }

  return Math.round(rent * 100) / 100;
}

// GET /api/ecr
router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (dateFrom || dateTo) {
      where.ecrDate = {};
      if (dateFrom) where.ecrDate.gte = new Date(dateFrom);
      if (dateTo) where.ecrDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [records, total] = await Promise.all([
      prisma.ecrRecord.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { ecrDate: 'desc' },
        include: { customer: { select: { id: true, code: true, name: true } } },
      }),
      prisma.ecrRecord.count({ where }),
    ]);
    res.json({ data: records, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ecr
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const { customerId, gasCode, cylinderOwner, cylinderNumber, ecrDate, challanNumber, challanDate, vehicleNumber, quantityCum } = req.body;

    if (!customerId || !cylinderNumber) {
      return res.status(400).json({ error: 'Customer and cylinder number required' });
    }

    // Find the holding record
    const cylinder = await prisma.cylinder.findUnique({ where: { cylinderNumber } });
    let holdDays = 0;
    let rentAmount = 0;
    let issueNumber = null;
    let issueDate = null;

    if (cylinder) {
      const holding = await prisma.cylinderHolding.findFirst({
        where: { cylinderId: cylinder.id, customerId: parseInt(customerId), status: 'HOLDING' },
        include: { transaction: true },
        orderBy: { issuedAt: 'desc' },
      });

      if (holding) {
        issueDate = holding.issuedAt;
        issueNumber = holding.transaction?.billNumber || null;
        const returnDate = ecrDate ? new Date(ecrDate) : new Date();
        holdDays = Math.max(0, Math.ceil((returnDate - new Date(issueDate)) / (1000 * 60 * 60 * 24)));

        // Get rate config
        const rateConfig = await prisma.rateList.findFirst({
          where: { gasCode: gasCode || cylinder.gasCode, ownerCode: cylinderOwner || cylinder.ownerCode },
        });
        rentAmount = calculateRental(holdDays, rateConfig);

        // Update holding
        await prisma.cylinderHolding.update({
          where: { id: holding.id },
          data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' },
        });
      }

      // Update cylinder status
      await prisma.cylinder.update({ where: { id: cylinder.id }, data: { status: 'IN_STOCK' } });
    }

    const ecrNumber = await generateEcrNumber();
    const ecr = await prisma.ecrRecord.create({
      data: {
        ecrNumber,
        ecrDate: ecrDate ? new Date(ecrDate) : new Date(),
        customerId: parseInt(customerId),
        gasCode: gasCode || cylinder?.gasCode,
        cylinderOwner: cylinderOwner || cylinder?.ownerCode,
        cylinderNumber,
        issueNumber,
        issueDate,
        holdDays,
        rentAmount,
        challanNumber,
        challanDate: challanDate ? new Date(challanDate) : null,
        vehicleNumber,
        operatorId: req.user.sub,
        quantityCum: quantityCum ? parseFloat(quantityCum) : null,
      },
    });

    res.status(201).json(ecr);
  } catch (err) {
    console.error('ECR error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ecr/cylinder-info/:cylinderNumber
router.get('/cylinder-info/:cylinderNumber', authenticate, async (req, res) => {
  try {
    const cylinder = await prisma.cylinder.findUnique({
      where: { cylinderNumber: req.params.cylinderNumber },
      include: { gasType: true },
    });
    if (!cylinder) return res.status(404).json({ error: 'Cylinder not found' });

    const holding = await prisma.cylinderHolding.findFirst({
      where: { cylinderId: cylinder.id, status: 'HOLDING' },
      include: { customer: true, transaction: true },
      orderBy: { issuedAt: 'desc' },
    });

    let holdDays = 0;
    if (holding) {
      holdDays = Math.ceil((new Date() - new Date(holding.issuedAt)) / (1000 * 60 * 60 * 24));
    }

    res.json({
      cylinder,
      holding: holding ? {
        customerId: holding.customerId,
        customerName: holding.customer?.name,
        issuedAt: holding.issuedAt,
        issueNumber: holding.transaction?.billNumber,
        holdDays,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
