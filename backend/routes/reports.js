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

// Cylinder Rotation Report
router.get('/cylinder-rotation', authenticate, async (req, res) => {
  try {
    const { cylinderNumber, gasCode } = req.query;
    const where = {};
    if (gasCode) where.cylinder = { gasCode };
    
    const holdings = await prisma.cylinderHolding.findMany({
      where,
      include: {
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true, status: true } },
        customer: { select: { code: true, name: true } },
        transaction: { select: { billNumber: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });

    // Filter by cylinder number if provided
    const filtered = cylinderNumber
      ? holdings.filter(h => h.cylinder.cylinderNumber.toLowerCase().includes(cylinderNumber.toLowerCase()))
      : holdings;

    // Group by cylinder
    const grouped = {};
    for (const h of filtered) {
      const key = h.cylinder.cylinderNumber;
      if (!grouped[key]) {
        grouped[key] = { cylinderNumber: key, gasCode: h.cylinder.gasCode, ownerCode: h.cylinder.ownerCode, currentStatus: h.cylinder.status, history: [] };
      }
      grouped[key].history.push({
        customerCode: h.customer.code,
        customerName: h.customer.name,
        billNumber: h.transaction?.billNumber,
        issuedAt: h.issuedAt,
        returnedAt: h.returnedAt,
        holdDays: h.holdDays || (h.returnedAt ? Math.ceil((new Date(h.returnedAt) - new Date(h.issuedAt)) / 86400000) : Math.ceil((new Date() - new Date(h.issuedAt)) / 86400000)),
        status: h.status,
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Party Wise Rental Report
router.get('/party-rental', authenticate, async (req, res) => {
  try {
    const { customerId, dateFrom, dateTo } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (dateFrom || dateTo) {
      where.ecrDate = {};
      if (dateFrom) where.ecrDate.gte = new Date(dateFrom);
      if (dateTo) where.ecrDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const ecrs = await prisma.ecrRecord.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { ecrDate: 'desc' },
    });

    // Group by customer
    const grouped = {};
    for (const e of ecrs) {
      const key = e.customer.code;
      if (!grouped[key]) {
        grouped[key] = { partyCode: key, partyName: e.customer.name, totalRent: 0, totalDays: 0, count: 0, records: [] };
      }
      grouped[key].totalRent += parseFloat(e.rentAmount || 0);
      grouped[key].totalDays += (e.holdDays || 0);
      grouped[key].count++;
      grouped[key].records.push({
        ecrNumber: e.ecrNumber, ecrDate: e.ecrDate, cylinderNumber: e.cylinderNumber,
        gasCode: e.gasCode, holdDays: e.holdDays, rentAmount: parseFloat(e.rentAmount || 0),
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cash Book
router.get('/cash-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['CASH_RECEIPT', 'CASH_PAYMENT'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    let bal = 0;
    const withBal = entries.map(e => {
      bal += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
      return { ...e, runningBalance: bal };
    });
    res.json(withBal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bank Book
router.get('/bank-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['BANK_RECEIPT', 'BANK_PAYMENT'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    let bal = 0;
    const withBal = entries.map(e => {
      bal += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
      return { ...e, runningBalance: bal };
    });
    res.json(withBal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Journal Book
router.get('/journal-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['JOURNAL', 'CONTRA', 'DEBIT_NOTE', 'CREDIT_NOTE'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outstanding Payments
router.get('/outstanding', authenticate, async (req, res) => {
  try {
    const entries = await prisma.ledgerEntry.groupBy({
      by: ['partyCode'],
      _sum: { debitAmount: true, creditAmount: true },
    });

    const result = await Promise.all(entries.filter(e => e.partyCode).map(async (e) => {
      const balance = parseFloat(e._sum.debitAmount || 0) - parseFloat(e._sum.creditAmount || 0);
      if (Math.abs(balance) < 0.01) return null;
      const cust = await prisma.customer.findUnique({ where: { code: e.partyCode }, select: { code: true, name: true, phone: true } });
      return {
        partyCode: e.partyCode,
        partyName: cust?.name || e.partyCode,
        phone: cust?.phone,
        debit: parseFloat(e._sum.debitAmount || 0),
        credit: parseFloat(e._sum.creditAmount || 0),
        balance,
        type: balance > 0 ? 'RECEIVABLE' : 'PAYABLE',
      };
    }));

    res.json(result.filter(Boolean).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales Summary
router.get('/sales-summary', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    // By gas type
    const byGas = await prisma.transaction.groupBy({
      by: ['gasCode'],
      where,
      _count: true,
      _sum: { quantityCum: true },
    });

    // By customer
    const byCust = await prisma.transaction.groupBy({
      by: ['customerId'],
      where,
      _count: true,
      _sum: { quantityCum: true },
    });

    const custDetails = await Promise.all(byCust.map(async (c) => {
      const cust = await prisma.customer.findUnique({ where: { id: c.customerId }, select: { code: true, name: true } });
      return { ...cust, count: c._count, totalCum: parseFloat(c._sum.quantityCum || 0) };
    }));

    res.json({
      byGas: byGas.map(g => ({ gasCode: g.gasCode, count: g._count, totalCum: parseFloat(g._sum.quantityCum || 0) })),
      byCustomer: custDetails.sort((a, b) => b.count - a.count),
      totalBills: byGas.reduce((s, g) => s + g._count, 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
