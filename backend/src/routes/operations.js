const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateHoldDays } = require('../services/businessRules');
const { getOutstandingReport } = require('../services/reportQueryService');
const {
  createDispatchRun,
  assignDispatchRun,
  startDispatchRun,
  completeDispatchItem,
  completeDispatchRun,
  recordDispatchRouteTrace,
  getDispatchBoard,
  getDispatchReconciliation,
} = require('../services/dispatchService');

const router = express.Router();

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function getOverdueThresholdDays() {
  const setting = await prisma.companySetting.findUnique({
    where: { key: 'overdue_threshold_days' },
    select: { value: true },
  });
  const parsed = parseInt(setting?.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function mapHolding(holding, thresholdDays, asOf = new Date()) {
  const holdDays = calculateHoldDays(holding.issuedAt, asOf);
  return {
    id: holding.id,
    issuedAt: holding.issuedAt,
    holdDays,
    status: holding.status,
    overdue: holdDays > thresholdDays,
    customer: holding.customer,
    cylinder: holding.cylinder,
    billNumber: holding.transaction?.billNumber || null,
    challanNumber: holding.challan?.challanNumber || null,
  };
}

router.get('/console', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const canViewPayments = ['ADMIN', 'MANAGER'].includes(req.user?.role);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thresholdDays = await getOverdueThresholdDays();
  const overdueBefore = new Date(today);
  overdueBefore.setDate(overdueBefore.getDate() - thresholdDays);

  const [
    dispatchBoard,
    activeHoldings,
    overdueHoldings,
    todayIssues,
    todayReturns,
    alerts,
    statusSummary,
    outstandingRows,
    activeHoldingsCount,
    overdueHoldingsCount,
    activeOrdersCount,
    openChallansCount,
  ] = await Promise.all([
    getDispatchBoard(prisma),
    prisma.cylinderHolding.findMany({
      where: { status: { in: ['HOLDING', 'BILLED'] } },
      take: 12,
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      include: {
        customer: { select: { id: true, code: true, name: true, areaCode: true } },
        cylinder: { select: { id: true, cylinderNumber: true, gasCode: true, ownerCode: true, status: true } },
        transaction: { select: { billNumber: true } },
        challan: { select: { challanNumber: true } },
      },
    }),
    prisma.cylinderHolding.findMany({
      where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: overdueBefore } },
      take: 10,
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      include: {
        customer: { select: { id: true, code: true, name: true, areaCode: true } },
        cylinder: { select: { id: true, cylinderNumber: true, gasCode: true, ownerCode: true, status: true } },
        transaction: { select: { billNumber: true } },
        challan: { select: { challanNumber: true } },
      },
    }),
    prisma.transaction.count({ where: { billDate: { gte: today, lt: tomorrow }, cylinderNumber: { not: null } } }),
    prisma.ecrRecord.count({ where: { ecrDate: { gte: today, lt: tomorrow } } }),
    prisma.alert.count({ where: { isResolved: false } }),
    prisma.cylinder.groupBy({ by: ['status'], _count: true }),
    canViewPayments ? getOutstandingReport(prisma) : Promise.resolve([]),
    prisma.cylinderHolding.count({ where: { status: { in: ['HOLDING', 'BILLED'] } } }),
    prisma.cylinderHolding.count({ where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: overdueBefore } } }),
    prisma.order.count({ where: { status: 'ACTIVE' } }),
    prisma.challan.count({ where: { status: 'OPEN', isDeleted: false } }),
  ]);

  const dispatchQueue = dispatchBoard.unassignedQueue.slice(0, 12).map((item) => ({
    type: item.sourceType,
    id: item.sourceId,
    refNumber: item.refNumber,
    date: item.date,
    customer: item.customer,
    gasCode: item.gasCode,
    ownerCode: item.ownerCode,
    quantityCyl: item.quantityCyl,
    quantityCum: item.quantityCum,
    status: item.status,
  }));

  const pendingPayments = outstandingRows.slice(0, 8).map((row) => ({
    customerId: row.customerId,
    partyCode: row.partyCode,
    partyName: row.partyName,
    phone: row.phone,
    balance: asNumber(row.balance),
  }));

  res.json({
    thresholdDays,
    stats: {
      pendingDeliveries: activeOrdersCount + openChallansCount,
      activeReturns: activeHoldingsCount,
      overdueCylinders: overdueHoldingsCount,
      pendingPayments: outstandingRows.length,
      todayIssues,
      todayReturns,
      unresolvedAlerts: alerts,
      outstandingAmount: outstandingRows.reduce((sum, item) => sum + asNumber(item.balance), 0),
    },
    dispatchQueue,
    activeDispatchRuns: dispatchBoard.activeRuns,
    returnsQueue: activeHoldings.map((holding) => mapHolding(holding, thresholdDays)),
    overdueCylinders: overdueHoldings.map((holding) => mapHolding(holding, thresholdDays)),
    pendingPayments,
    stockHealth: statusSummary.map((item) => ({ status: item.status, count: item._count })),
  });
}));

router.get('/dispatch-board', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const board = await getDispatchBoard(prisma);
  res.json(board);
}));

router.post('/dispatch-runs', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const run = await createDispatchRun(prisma, req.body, { operatorId: req.user.sub });
  res.status(201).json({ message: 'Dispatch planned', run });
}));

router.patch('/dispatch-runs/:id/assign', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const run = await assignDispatchRun(prisma, req.params.id, req.body, { operatorId: req.user.sub });
  res.json({ message: 'Dispatch assigned', run });
}));

router.patch('/dispatch-runs/:id/start', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const run = await startDispatchRun(prisma, req.params.id, { operatorId: req.user.sub });
  res.json({ message: 'Dispatch started', run });
}));

router.patch('/dispatch-runs/:id/complete', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const result = await completeDispatchRun(prisma, req.params.id, { operatorId: req.user.sub });
  res.json({ message: 'Dispatch completed', ...result });
}));

router.patch('/dispatch-items/:id/complete', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const item = await completeDispatchItem(prisma, req.params.id, req.body, { operatorId: req.user.sub });
  res.json({ message: 'Dispatch item completed', item });
}));

router.post('/dispatch-runs/:id/route-trace', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const trace = await recordDispatchRouteTrace(prisma, req.params.id, req.body.route, { operatorId: req.user.sub });
  res.status(201).json({ message: 'Dispatch route trace saved', trace });
}));

router.get('/dispatch-runs/:id/reconciliation', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const reconciliation = await getDispatchReconciliation(prisma, req.params.id);
  res.json(reconciliation);
}));

module.exports = router;
