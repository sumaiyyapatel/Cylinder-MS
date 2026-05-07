const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateHoldDays } = require('../services/businessRules');
const { getOutstandingReport } = require('../services/reportQueryService');

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

router.get('/console', authenticate, asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thresholdDays = await getOverdueThresholdDays();
  const overdueBefore = new Date(today);
  overdueBefore.setDate(overdueBefore.getDate() - thresholdDays);

  const [
    orders,
    openChallans,
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
    prisma.order.findMany({
      where: { status: 'ACTIVE' },
      take: 8,
      orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    }),
    prisma.challan.findMany({
      where: { status: 'OPEN' },
      take: 8,
      orderBy: [{ challanDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    }),
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
    getOutstandingReport(prisma),
    prisma.cylinderHolding.count({ where: { status: { in: ['HOLDING', 'BILLED'] } } }),
    prisma.cylinderHolding.count({ where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: overdueBefore } } }),
    prisma.order.count({ where: { status: 'ACTIVE' } }),
    prisma.challan.count({ where: { status: 'OPEN' } }),
  ]);

  const dispatchQueue = [
    ...orders.map((order) => ({
      type: 'ORDER',
      id: order.id,
      refNumber: order.orderNumber,
      date: order.orderDate,
      customer: order.customer,
      gasCode: order.gasCode,
      ownerCode: order.ownerCode,
      quantityCyl: order.quantityCyl,
      status: order.status,
    })),
    ...openChallans.map((challan) => ({
      type: 'CHALLAN',
      id: challan.id,
      refNumber: challan.challanNumber,
      date: challan.challanDate,
      customer: challan.customer,
      gasCode: challan.gasCode,
      ownerCode: challan.cylinderOwner,
      quantityCyl: challan.cylindersCount,
      status: challan.status,
    })),
  ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()).slice(0, 12);

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
    returnsQueue: activeHoldings.map((holding) => mapHolding(holding, thresholdDays)),
    overdueCylinders: overdueHoldings.map((holding) => mapHolding(holding, thresholdDays)),
    pendingPayments,
    stockHealth: statusSummary.map((item) => ({ status: item.status, count: item._count })),
  });
}));

module.exports = router;
