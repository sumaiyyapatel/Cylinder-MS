const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// GET /api/ledger
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req, res) => {
  try {
    const { partyCode, dateFrom, dateTo, transactionType, page = 1, limit = 50 } = req.query;
    const where = {};
    if (partyCode) where.partyCode = partyCode;
    if (transactionType) where.transactionType = transactionType;
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { voucherDate: 'desc' },
        include: { customer: { select: { code: true, name: true } } },
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    // Calculate running balance
    let balance = 0;
    const withBalance = entries.map(e => {
      balance += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
      return { ...e, runningBalance: balance };
    });

    res.json({ data: withBalance, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ledger (Voucher Entry)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req, res) => {
  try {
    // Generate voucher number
    const year = new Date().getFullYear().toString().slice(-2);
    const typeMap = { 'CASH_RECEIPT': 'CR', 'CASH_PAYMENT': 'CP', 'BANK_RECEIPT': 'BR', 'BANK_PAYMENT': 'BP', 'JOURNAL': 'JV', 'CONTRA': 'CT', 'DEBIT_NOTE': 'DN', 'CREDIT_NOTE': 'CN' };
    const code = typeMap[req.body.transactionType] || 'GV';
    const prefix = `${code}/${year}/`;
    const last = await prisma.ledgerEntry.findFirst({ where: { voucherNumber: { startsWith: prefix } }, orderBy: { voucherNumber: 'desc' } });
    let seq = 1;
    if (last) { const parts = last.voucherNumber.split('/'); seq = parseInt(parts[2]) + 1; }
    const voucherNumber = `${prefix}${seq.toString().padStart(5, '0')}`;

    const entry = await prisma.ledgerEntry.create({
      data: {
        voucherNumber,
        voucherDate: req.body.voucherDate ? new Date(req.body.voucherDate) : new Date(),
        partyCode: req.body.partyCode || null,
        particular: req.body.particular,
        narration: req.body.narration,
        debitAmount: req.body.debitAmount ? parseFloat(req.body.debitAmount) : null,
        creditAmount: req.body.creditAmount ? parseFloat(req.body.creditAmount) : null,
        chequeNumber: req.body.chequeNumber,
        transactionType: req.body.transactionType,
        voucherRef: req.body.voucherRef,
        operatorId: req.user.sub,
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Voucher number already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
