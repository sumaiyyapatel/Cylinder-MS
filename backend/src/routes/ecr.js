const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { calculateHoldDays, isPocOwner, normalizeOwnerCode, round2 } = require('../services/businessRules');
const { generateEcrNumber } = require('../services/numberingService');
const { updateCylinderStatus } = require('../services/cylinderStatusService');
const { createAuditLog } = require('../services/auditService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
} = require('../lib/validation');

const router = express.Router();

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
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const where = {};
  if (customerId) where.customerId = parseInt(customerId, 10);
  if (dateFrom || dateTo) {
    where.ecrDate = {};
    if (dateFrom) where.ecrDate.gte = new Date(dateFrom);
    if (dateTo) where.ecrDate.lte = new Date(`${dateTo}T23:59:59Z`);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [records, total] = await Promise.all([
    prisma.ecrRecord.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { ecrDate: 'desc' },
      include: { customer: { select: { id: true, code: true, name: true } } },
    }),
    prisma.ecrRecord.count({ where }),
  ]);

  res.json({ data: records, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

// POST /api/ecr
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const {
    customerId,
    gasCode,
    cylinderOwner,
    cylinderNumber,
    ecrDate,
    challanNumber,
    challanDate,
    vehicleNumber,
    quantityCum,
  } = req.body;

  const customerIdNum = parseRequiredInt(customerId, 'customerId');
  const normalizedCylinderNumber = validateCylinderNumber(cylinderNumber);
  const returnDate = parseDate(ecrDate, 'ecrDate') || new Date();
  const parsedChallanDate = parseDate(challanDate, 'challanDate');
  const parsedQuantity = parseOptionalNonNegativeNumber(quantityCum, 'quantityCum');

  const ecr = await prisma.$transaction(async (tx) => {
    const cylinder = await tx.cylinder.findUnique({
      where: { cylinderNumber: normalizedCylinderNumber },
    });
    if (!cylinder || !cylinder.isActive) {
      throw new AppError(404, 'Cylinder not found');
    }

    const holding = await tx.cylinderHolding.findFirst({
      where: { cylinderId: cylinder.id, customerId: customerIdNum, status: 'HOLDING' },
      include: { transaction: true },
      orderBy: { issuedAt: 'desc' },
    });
    if (!holding) {
      throw new AppError(400, 'No matching issue found for this customer and cylinder');
    }

    const issueDate = holding.issuedAt;
    const issueNumber = holding.transaction?.billNumber || null;
    if (returnDate < new Date(issueDate)) {
      throw new AppError(400, 'Return date cannot be before issue date');
    }

    const holdDays = calculateHoldDays(issueDate, returnDate);
    const effectiveOwner = normalizeOwnerCode(cylinderOwner || cylinder.ownerCode);

    let rentAmount = 0;
    if (!isPocOwner(effectiveOwner)) {
      const rateConfig = await tx.rateList.findFirst({
        where: {
          gasCode: gasCode || cylinder.gasCode,
          ownerCode: { in: [effectiveOwner, cylinderOwner || cylinder.ownerCode] },
        },
      });
      rentAmount = calculateRental(holdDays, rateConfig);
    }
    rentAmount = round2(rentAmount);

    await tx.cylinderHolding.update({
      where: { id: holding.id },
      data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' },
    });

    await updateCylinderStatus(tx, cylinder.id, 'IN_STOCK');

    const ecrNumber = await generateEcrNumber(tx, returnDate);
    const createdEcr = await tx.ecrRecord.create({
      data: {
        ecrNumber,
        ecrDate: returnDate,
        customerId: customerIdNum,
        gasCode: gasCode || cylinder.gasCode,
        cylinderOwner: effectiveOwner,
        cylinderNumber: normalizedCylinderNumber,
        issueNumber,
        issueDate,
        holdDays,
        rentAmount,
        challanNumber,
        challanDate: parsedChallanDate,
        vehicleNumber,
        operatorId: req.user.sub,
        quantityCum: parsedQuantity == null ? null : round2(parsedQuantity),
      },
    });

    await createAuditLog(tx, {
      action: 'RETURN_CYLINDER',
      module: 'ecr',
      userId: req.user.sub,
      entityId: String(createdEcr.id),
      oldValue: { cylinderStatus: cylinder.status, holdingStatus: holding.status },
      newValue: {
        cylinderStatus: 'IN_STOCK',
        holdingStatus: 'RETURNED',
        cylinderNumber: normalizedCylinderNumber,
        ecrNumber,
      },
    });

    return createdEcr;
  });

  res.status(201).json(ecr);
}));

// GET /api/ecr/cylinder-info/:cylinderNumber
router.get('/cylinder-info/:cylinderNumber', authenticate, asyncHandler(async (req, res) => {
  const number = validateCylinderNumber(req.params.cylinderNumber);
  const cylinder = await prisma.cylinder.findUnique({
    where: { cylinderNumber: number },
    include: { gasType: true },
  });
  if (!cylinder) throw new AppError(404, 'Cylinder not found');

  const holding = await prisma.cylinderHolding.findFirst({
    where: { cylinderId: cylinder.id, status: 'HOLDING' },
    include: { customer: true, transaction: true },
    orderBy: { issuedAt: 'desc' },
  });

  let holdDays = 0;
  if (holding) {
    holdDays = calculateHoldDays(holding.issuedAt, new Date());
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
}));

module.exports = router;
