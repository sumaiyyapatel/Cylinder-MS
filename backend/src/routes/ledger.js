const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { round2 } = require('../services/businessRules');
const { generateLedgerVoucherNumber } = require('../services/numberingService');
const { validateVoucherEntry, validateBalance } = require('../services/ledgerValidationService');

const router = express.Router();

// GET /api/ledger
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const { partyCode, dateFrom, dateTo, transactionType, page = 1, limit = 50 } = req.query;
  const where = {};
  if (partyCode) where.partyCode = partyCode;
  if (transactionType) where.transactionType = transactionType;
  if (dateFrom || dateTo) {
    where.voucherDate = {};
    if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
    if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
  }
  const pageNum = parseInt(page, 10);
  const pageSize = parseInt(limit, 10);
  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: [{ voucherDate: 'asc' }, { id: 'asc' }],
    include: { customer: { select: { code: true, name: true } } },
  });

  let balance = 0;
  const withBalance = entries.map((e) => {
    balance += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
    return { ...e, runningBalance: balance };
  });

  const skip = (pageNum - 1) * pageSize;
  const paged = withBalance.slice(skip, skip + pageSize);

  res.json({
    data: paged,
    total: withBalance.length,
    page: pageNum,
    totalPages: Math.ceil(withBalance.length / pageSize),
  });
}));

// POST /api/ledger (Voucher Entry)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const voucherDate = req.body.voucherDate ? new Date(req.body.voucherDate) : new Date();
  const voucherNumber = await generateLedgerVoucherNumber(prisma, req.body.transactionType, voucherDate, 'GV');

  const entry = await prisma.ledgerEntry.create({
    data: {
      voucherNumber,
      voucherDate,
      partyCode: req.body.partyCode || null,
      particular: req.body.particular,
      narration: req.body.narration,
      debitAmount: req.body.debitAmount ? round2(req.body.debitAmount) : null,
      creditAmount: req.body.creditAmount ? round2(req.body.creditAmount) : null,
      chequeNumber: req.body.chequeNumber,
      transactionType: req.body.transactionType,
      voucherRef: req.body.voucherRef,
      operatorId: req.user.sub,
    },
  });
  res.status(201).json(entry);
}));

// POST /api/ledger/validate - validate voucher entry before posting
router.post('/validate', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const result = validateVoucherEntry(req.body);
  res.json(result);
}));

// POST /api/ledger/balance-check - validate that a set of entries is balanced
router.post('/balance-check', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries must be an array' });
  }
  const result = validateBalance(entries);
  res.json(result);
}));

module.exports = router;
