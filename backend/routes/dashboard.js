const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Cylinders out today
    const cylindersOutToday = await prisma.transaction.count({
      where: { billDate: { gte: today, lt: tomorrow } },
    });

    // Cylinders returned today
    const cylindersReturnedToday = await prisma.ecrRecord.count({
      where: { ecrDate: { gte: today, lt: tomorrow } },
    });

    // Pending ECRs (cylinders with customer)
    const pendingEcrs = await prisma.cylinderHolding.count({
      where: { status: 'HOLDING' },
    });

    // Overdue cylinders (held > 30 days)
    const thresholdSetting = await prisma.companySetting.findUnique({ where: { key: 'overdue_threshold_days' } });
    const thresholdDays = parseInt(thresholdSetting?.value || '30');
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - thresholdDays);

    const overdueCylinders = await prisma.cylinderHolding.count({
      where: { status: 'HOLDING', issuedAt: { lt: overdueDate } },
    });

    // Cash collected today (credit amounts from ledger)
    const cashToday = await prisma.ledgerEntry.aggregate({
      where: {
        voucherDate: { gte: today, lt: tomorrow },
        transactionType: { in: ['CASH_RECEIPT', 'BANK_RECEIPT'] },
      },
      _sum: { creditAmount: true },
    });

    // Outstanding payments
    const totalDebit = await prisma.ledgerEntry.aggregate({ _sum: { debitAmount: true } });
    const totalCredit = await prisma.ledgerEntry.aggregate({ _sum: { creditAmount: true } });
    const outstanding = parseFloat(totalDebit._sum.debitAmount || 0) - parseFloat(totalCredit._sum.creditAmount || 0);

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
      where: { status: 'HOLDING' },
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

    res.json({
      stats: {
        cylindersOutToday,
        cylindersReturnedToday,
        cashCollectedToday: parseFloat(cashToday._sum.creditAmount || 0),
        pendingEcrs,
        overdueCylinders,
        outstandingPayments: outstanding,
      },
      cylindersByStatus: cylindersByStatus.map(s => ({ status: s.status, count: s._count })),
      cylindersByGas: cylindersByGas.map(g => ({ gasCode: g.gasCode, count: g._count })),
      dailyIssues: dailyIssues.map(d => ({ date: d.date, count: d.count })),
      dailyReturns: dailyReturns.map(d => ({ date: d.date, count: d.count })),
      topCustomers: topCustomerDetails,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
