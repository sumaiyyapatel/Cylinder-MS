const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');
const { getOutstandingReport } = require('../services/reportQueryService');

const router = express.Router();

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function holdDays(issuedAt, asOf = new Date()) {
  if (!issuedAt) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - new Date(issuedAt).getTime()) / 86400000));
}

router.get('/', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Cylinder issue rows today. This is the actual movement count, not bill count.
    const cylindersOutToday = await prisma.transaction.count({
      where: { billDate: { gte: today, lt: tomorrow }, cylinderNumber: { not: null } },
    });

    // Cylinders returned today
    const cylindersReturnedToday = await prisma.ecrRecord.count({
      where: { ecrDate: { gte: today, lt: tomorrow } },
    });

    // Pending ECRs (cylinders with customer)
    const pendingEcrs = await prisma.cylinderHolding.count({
      where: { status: { in: ['HOLDING', 'BILLED'] } },
    });

    // Overdue cylinders (held > 30 days)
    const thresholdSetting = await prisma.companySetting.findUnique({ where: { key: 'overdue_threshold_days' } });
    const thresholdDays = parseInt(thresholdSetting?.value || '30');
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - thresholdDays);

    const overdueCylinders = await prisma.cylinderHolding.count({
      where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: overdueDate } },
    });

    const billsToday = await prisma.bill.aggregate({
      where: { billDate: { gte: today, lt: tomorrow } },
      _count: { _all: true },
      _sum: { totalAmount: true, totalCylinders: true },
    });

    // Cash collected today (credit amounts from receipt ledger entries)
    const cashToday = await prisma.ledgerEntry.aggregate({
      where: {
        voucherDate: { gte: today, lt: tomorrow },
        transactionType: { in: ['CASH_RECEIPT', 'BANK_RECEIPT'] },
      },
      _sum: { creditAmount: true },
    });

    const outstandingRows = await getOutstandingReport(prisma);
    const outstanding = outstandingRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const topOutstanding = outstandingRows
      .slice()
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
      .slice(0, 5);

    // Cylinder status summary
    const cylindersByStatus = await prisma.cylinder.groupBy({
      by: ['status'],
      _count: true,
    });

    // Cylinders by gas type
    const cylindersByGas = await prisma.cylinder.groupBy({
      by: ['gasCode'],
      _count: true,
    });

    // Daily issues vs returns (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyIssues = await prisma.$queryRaw`
      SELECT DATE(bill_date) as date, COUNT(*)::int as count
      FROM transactions
      WHERE bill_date >= ${thirtyDaysAgo}
      GROUP BY DATE(bill_date)
      ORDER BY date
    `;

    const dailyReturns = await prisma.$queryRaw`
      SELECT DATE(ecr_date) as date, COUNT(*)::int as count
      FROM ecr_records
      WHERE ecr_date >= ${thirtyDaysAgo}
      GROUP BY DATE(ecr_date)
      ORDER BY date
    `;

    // Top 5 customers by cylinders held
    const topCustomers = await prisma.cylinderHolding.groupBy({
      by: ['customerId'],
      where: { status: { in: ['HOLDING', 'BILLED'] } },
      _count: true,
      orderBy: { _count: { customerId: 'desc' } },
      take: 5,
    });

    const topCustomerDetails = await Promise.all(
      topCustomers.map(async (tc) => {
        const customer = await prisma.customer.findUnique({ where: { id: tc.customerId }, select: { code: true, name: true } });
        return { ...customer, cylindersHeld: tc._count };
      })
    );

    const [recentBills, overdueHoldings, unresolvedAlerts] = await Promise.all([
      prisma.bill.findMany({
        take: 8,
        orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          billNumber: true,
          billDate: true,
          totalCylinders: true,
          totalQuantity: true,
          totalAmount: true,
          customer: { select: { code: true, name: true } },
        },
      }),
      prisma.cylinderHolding.findMany({
        take: 8,
        where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: overdueDate } },
        orderBy: { issuedAt: 'asc' },
        select: {
          id: true,
          issuedAt: true,
          status: true,
          customer: { select: { code: true, name: true } },
          cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true } },
        },
      }),
      prisma.alert.count({ where: { isResolved: false } }),
    ]);

    res.json({
      stats: {
        cylindersOutToday,
        cylindersReturnedToday,
        billsToday: billsToday._count._all,
        salesToday: asNumber(billsToday._sum.totalAmount),
        billedCylindersToday: asNumber(billsToday._sum.totalCylinders),
        cashCollectedToday: asNumber(cashToday._sum.creditAmount),
        pendingEcrs,
        overdueCylinders,
        outstandingPayments: outstanding,
        unresolvedAlerts,
      },
      cylindersByStatus: cylindersByStatus.map(s => ({ status: s.status, count: s._count })),
      cylindersByGas: cylindersByGas.map(g => ({ gasCode: g.gasCode, count: g._count })),
      dailyIssues: dailyIssues.map(d => ({ date: d.date, count: d.count })),
      dailyReturns: dailyReturns.map(d => ({ date: d.date, count: d.count })),
      topCustomers: topCustomerDetails,
      topOutstanding,
      recentBills: recentBills.map((bill) => ({
        ...bill,
        totalQuantity: asNumber(bill.totalQuantity),
        totalAmount: asNumber(bill.totalAmount),
      })),
      overdueHoldings: overdueHoldings.map((holding) => ({
        ...holding,
        holdDays: holdDays(holding.issuedAt),
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
