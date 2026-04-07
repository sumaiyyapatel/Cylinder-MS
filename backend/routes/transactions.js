const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// Helper: generate bill number XX/YY/NNNNN
async function generateBillNumber(ownerCode) {
  const series = ownerCode === 'COC' ? 'CA' : 'PA';
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `${series}/${year}/`;
  const last = await prisma.transaction.findFirst({
    where: { billNumber: { startsWith: prefix } },
    orderBy: { billNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.billNumber.split('/');
    seq = parseInt(parts[2]) + 1;
  }
  return `${prefix}${seq.toString().padStart(5, '0')}`;
}

// GET /api/transactions
router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, gasCode, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (gasCode) where.gasCode = gasCode;
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { billDate: 'desc' },
        include: { customer: { select: { id: true, code: true, name: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);
    res.json({ data: transactions, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions (Bill Cum Challan)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const { customerId, gasCode, cylinderOwner, cylinders, billDate, orderNumber, transactionCode } = req.body;
    
    if (!customerId || !cylinders || !cylinders.length) {
      return res.status(400).json({ error: 'Customer and at least one cylinder required' });
    }

    const results = [];
    for (const cyl of cylinders) {
      const billNumber = await generateBillNumber(cylinderOwner || 'COC');
      
      const txn = await prisma.transaction.create({
        data: {
          billNumber,
          billDate: billDate ? new Date(billDate) : new Date(),
          customerId: parseInt(customerId),
          gasCode,
          cylinderOwner: cylinderOwner || 'COC',
          cylinderNumber: cyl.cylinderNumber,
          quantityCum: cyl.quantityCum ? parseFloat(cyl.quantityCum) : null,
          orderNumber,
          transactionCode: transactionCode || 'ISSUE',
          fullOrEmpty: 'F',
          operatorId: req.user.sub,
        },
      });

      // Update cylinder status
      if (cyl.cylinderNumber) {
        await prisma.cylinder.updateMany({
          where: { cylinderNumber: cyl.cylinderNumber },
          data: { status: 'WITH_CUSTOMER' },
        });

        // Create holding record
        const cylinder = await prisma.cylinder.findUnique({ where: { cylinderNumber: cyl.cylinderNumber } });
        if (cylinder) {
          await prisma.cylinderHolding.create({
            data: {
              cylinderId: cylinder.id,
              customerId: parseInt(customerId),
              transactionId: txn.id,
              issuedAt: billDate ? new Date(billDate) : new Date(),
              status: 'HOLDING',
            },
          });
        }
      }

      results.push(txn);
    }

    res.status(201).json({ message: `${results.length} transaction(s) created`, transactions: results });
  } catch (err) {
    console.error('Transaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/next-bill-number
router.get('/next-bill-number', authenticate, async (req, res) => {
  try {
    const { ownerCode = 'COC' } = req.query;
    const billNumber = await generateBillNumber(ownerCode);
    res.json({ billNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
