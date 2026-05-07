const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../services/auditService');
const { calculateHoldDays, round2 } = require('../services/businessRules');
const { getCustomerBalance, getCustomerOutstanding } = require('../services/paymentService');
const { validateGstin } = require('../lib/validation');

const router = express.Router();

function normalizeCustomerPayload(payload) {
  const data = { ...payload };
  if (Object.prototype.hasOwnProperty.call(data, 'gstin')) {
    data.gstin = validateGstin(data.gstin);
  }
  return data;
}

// GET /api/customers
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { search, city, areaCode, page = 1, limit = 50, includeInactive } = req.query;
  const where = {};
  if (includeInactive !== 'true') {
    where.isActive = true;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (areaCode) where.areaCode = areaCode;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take: parseInt(limit, 10), orderBy: { code: 'asc' }, include: { area: true } }),
    prisma.customer.count({ where }),
  ]);
  res.json({ data: customers, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

router.get('/:id/command', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid customer id');

  const thresholdSetting = await prisma.companySetting.findUnique({
    where: { key: 'overdue_threshold_days' },
    select: { value: true },
  });
  const parsedThreshold = parseInt(thresholdSetting?.value, 10);
  const thresholdDays = Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 30;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { area: true },
  });
  if (!customer || !customer.isActive) throw new AppError(404, 'Customer not found');

  const [
    balance,
    outstanding,
    holdings,
    bills,
    payments,
    ledger,
    transactions,
    routeHistory,
    alerts,
  ] = await Promise.all([
    getCustomerBalance(prisma, id),
    getCustomerOutstanding(prisma, id),
    prisma.cylinderHolding.findMany({
      where: { customerId: id, status: { in: ['HOLDING', 'BILLED'] } },
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      include: {
        cylinder: { select: { id: true, cylinderNumber: true, gasCode: true, ownerCode: true, status: true } },
        transaction: { select: { billNumber: true, billDate: true } },
        challan: { select: { challanNumber: true, challanDate: true } },
      },
    }),
    prisma.bill.findMany({
      where: { customerId: id },
      take: 20,
      orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
      select: { id: true, billNumber: true, billDate: true, totalCylinders: true, totalQuantity: true, totalAmount: true },
    }),
    prisma.payment.findMany({
      where: { customerId: id },
      take: 20,
      orderBy: [{ voucherDate: 'desc' }, { id: 'desc' }],
      select: { id: true, voucherNumber: true, voucherDate: true, paymentMode: true, amount: true, reference: true, billId: true, ecrId: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { partyCode: customer.code },
      take: 40,
      orderBy: [{ voucherDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.transaction.findMany({
      where: { customerId: id },
      take: 30,
      orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
      select: { id: true, billNumber: true, billDate: true, cylinderNumber: true, gasCode: true, quantityCum: true, transactionCode: true },
    }),
    prisma.deliveryRouteTrace.findMany({
      where: {
        OR: [
          { bill: { is: { customerId: id } } },
          { challan: { is: { customerId: id } } },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        bill: { select: { billNumber: true, billDate: true } },
        challan: { select: { challanNumber: true, challanDate: true } },
      },
    }),
    prisma.alert.findMany({
      where: { customerId: id, isResolved: false },
      take: 10,
      orderBy: { sentAt: 'desc' },
    }),
  ]);

  const holdingRows = holdings.map((holding) => {
    const holdDays = calculateHoldDays(holding.issuedAt, new Date());
    return {
      id: holding.id,
      issuedAt: holding.issuedAt,
      holdDays,
      overdue: holdDays > thresholdDays,
      status: holding.status,
      cylinder: holding.cylinder,
      billNumber: holding.transaction?.billNumber || null,
      challanNumber: holding.challan?.challanNumber || null,
    };
  });

  const overdueCount = holdingRows.filter((row) => row.overdue).length;
  const outstandingAmount = round2(outstanding.reduce((sum, item) => sum + Number(item.owing || 0), 0));
  const creditLimit = Number(customer.creditLimit || 0);
  const riskLevel = overdueCount > 0 || (creditLimit > 0 && outstandingAmount > creditLimit)
    ? 'HIGH'
    : outstandingAmount > 0 || holdingRows.length > 0
      ? 'MEDIUM'
      : 'LOW';

  res.json({
    customer,
    thresholdDays,
    summary: {
      outstandingBalance: outstandingAmount,
      cylindersHeld: holdingRows.length,
      overdueCylinders: overdueCount,
      rentalDues: round2(outstanding.filter((item) => item.type === 'ECR_RENT').reduce((sum, item) => sum + Number(item.owing || 0), 0)),
      lastPayment: payments[0] || null,
      riskLevel,
      activeAlerts: alerts.length,
    },
    balance,
    outstanding,
    holdings: holdingRows,
    bills: bills.map((bill) => ({ ...bill, totalQuantity: Number(bill.totalQuantity || 0), totalAmount: Number(bill.totalAmount || 0) })),
    payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount || 0) })),
    ledger: ledger.map((entry) => ({ ...entry, debitAmount: Number(entry.debitAmount || 0), creditAmount: Number(entry.creditAmount || 0) })),
    transactions: transactions.map((txn) => ({ ...txn, quantityCum: Number(txn.quantityCum || 0) })),
    routeHistory,
    alerts,
  });
}));

// GET /api/customers/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { area: true, holdings: { where: { status: { in: ['HOLDING', 'BILLED'] } }, include: { cylinder: true } } },
  });
  if (!customer || !customer.isActive) throw new AppError(404, 'Customer not found');
  res.json(customer);
}));

// POST /api/customers
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.create({ data: { ...normalizeCustomerPayload(req.body), isActive: true } });
  res.status(201).json(customer);
}));

// PUT /api/customers/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.update({ where: { id: parseInt(req.params.id, 10) }, data: normalizeCustomerPayload(req.body) });
  res.json(customer);
}));

// DELETE /api/customers/:id
router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Customer not found');
    }

    const updated = await tx.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(tx, {
      action: 'SOFT_DELETE_CUSTOMER',
      module: 'customers',
      userId: req.user.sub,
      entityId: String(updated.id),
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: updated.isActive },
    });
  });

  res.json({ message: 'Customer deactivated' });
}));

module.exports = router;
