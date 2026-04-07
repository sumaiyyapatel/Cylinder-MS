const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');

const router = express.Router();

// Holding Statement - all customers x gas types
router.get('/holding-statement', authenticate, async (req, res) => {
  try {
    const { customerId, gasCode, asOfDate } = req.query;
    const where = { status: 'HOLDING' };
    if (customerId) where.customerId = parseInt(customerId);
    if (asOfDate) where.issuedAt = { lte: new Date(asOfDate + 'T23:59:59Z') };

    const holdings = await prisma.cylinderHolding.findMany({
      where,
      include: {
        customer: { select: { code: true, name: true } },
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true, capacity: true } },
        transaction: { select: { billNumber: true, billDate: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Group by customer
    const grouped = {};
    for (const h of holdings) {
      const key = h.customer.code;
      if (!grouped[key]) {
        grouped[key] = { customerCode: h.customer.code, customerName: h.customer.name, cylinders: [] };
      }
      const holdDays = Math.ceil((new Date() - new Date(h.issuedAt)) / (1000 * 60 * 60 * 24));
      grouped[key].cylinders.push({
        cylinderNumber: h.cylinder.cylinderNumber,
        gasCode: h.cylinder.gasCode,
        ownerCode: h.cylinder.ownerCode,
        issuedAt: h.issuedAt,
        billNumber: h.transaction?.billNumber,
        holdDays,
        isOverdue: holdDays > 30,
      });
    }

    // Filter by gasCode if provided
    if (gasCode) {
      for (const key of Object.keys(grouped)) {
        grouped[key].cylinders = grouped[key].cylinders.filter(c => c.gasCode === gasCode);
        if (grouped[key].cylinders.length === 0) delete grouped[key];
      }
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Statement
router.get('/customer-statement', authenticate, async (req, res) => {
  try {
    const { customerId, dateFrom, dateTo } = req.query;
    if (!customerId) return res.status(400).json({ error: 'Customer ID required' });

    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59Z');

    const [customer, issues, returns] = await Promise.all([
      prisma.customer.findUnique({ where: { id: parseInt(customerId) } }),
      prisma.transaction.findMany({
        where: { customerId: parseInt(customerId), ...(Object.keys(dateFilter).length ? { billDate: dateFilter } : {}) },
        orderBy: { billDate: 'asc' },
      }),
      prisma.ecrRecord.findMany({
        where: { customerId: parseInt(customerId), ...(Object.keys(dateFilter).length ? { ecrDate: dateFilter } : {}) },
        orderBy: { ecrDate: 'asc' },
      }),
    ]);

    res.json({ customer, issues, returns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Report
router.get('/daily-report', authenticate, async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const [issues, returns] = await Promise.all([
      prisma.transaction.findMany({
        where: { billDate: { gte: reportDate, lt: nextDay } },
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { billNumber: 'asc' },
      }),
      prisma.ecrRecord.findMany({
        where: { ecrDate: { gte: reportDate, lt: nextDay } },
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { ecrNumber: 'asc' },
      }),
    ]);

    res.json({ date: reportDate, issues, returns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sale Transaction Report
router.get('/sale-transactions', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo, customerId, gasCode } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (gasCode) where.gasCode = gasCode;
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { billDate: 'desc' },
    });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trial Balance
router.get('/trial-balance', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const entries = await prisma.ledgerEntry.groupBy({
      by: ['partyCode'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });

    const result = await Promise.all(entries.map(async (e) => {
      let partyName = e.partyCode;
      if (e.partyCode) {
        const cust = await prisma.customer.findUnique({ where: { code: e.partyCode }, select: { name: true } });
        if (cust) partyName = cust.name;
      }
      return {
        partyCode: e.partyCode,
        partyName,
        debit: parseFloat(e._sum.debitAmount || 0),
        credit: parseFloat(e._sum.creditAmount || 0),
        balance: parseFloat(e._sum.debitAmount || 0) - parseFloat(e._sum.creditAmount || 0),
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
