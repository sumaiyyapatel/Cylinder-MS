const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { round2 } = require('../services/businessRules');
const { generateLedgerVoucherNumber } = require('../services/numberingService');

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
  const withBalance = entries.map((e) => {
    balance += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
    return { ...e, runningBalance: balance };
  });

  res.json({ data: withBalance, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
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

module.exports = router;
