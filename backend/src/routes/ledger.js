const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validateVoucherEntry, validateBalance } = require('../services/ledgerValidationService');
const { postLedgerEntries } = require('../services/ledgerPostingService');

const router = express.Router();


// ==============================
// GET /api/ledger
// ==============================
router.get('/', asyncHandler(async (req, res) => {
    const {
      partyCode,
      dateFrom,
      dateTo,
      transactionType,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};

    // ✅ FIX: handle "all"
    if (partyCode && partyCode !== "all") {
      where.partyCode = partyCode;
    }

    if (transactionType) {
      where.transactionType = transactionType;
    }

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
    });

    // ✅ FIX: O(n) running balance
    let running = 0;

const withBalance = entries.map((e) => {
  const debit = Number(e.debitAmount || 0);
  const credit = Number(e.creditAmount || 0);

  running += debit - credit;

  return {
    id: e.id,
    voucherNumber: e.voucherNumber,
    voucherDate: e.voucherDate,
    partyCode: e.partyCode,
    particular: e.particular,
    narration: e.narration,
    debitAmount: debit,
    creditAmount: credit,
    chequeNumber: e.chequeNumber,
    transactionType: e.transactionType,
    voucherRef: e.voucherRef,
    operatorId: e.operatorId,
    createdAt: e.createdAt,
    runningBalance: running,
  };
});

    const skip = (pageNum - 1) * pageSize;
    const paged = withBalance.slice(skip, skip + pageSize);
//console.log(typeof entries[0].debitAmount); // should be object (Decimal)
//console.log(typeof withBalance[0].debitAmount); // should be number
    res.json({
      data: paged,
      total: withBalance.length,
      page: pageNum,
      totalPages: Math.ceil(withBalance.length / pageSize),
    });
  })
);


// ==============================
// POST /api/ledger
// ==============================
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const validation = validateVoucherEntry(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors });
    }

    const voucherDate = req.body.voucherDate
      ? new Date(req.body.voucherDate)
      : new Date();

    let entry;

    await prisma.$transaction(async (tx) => {
      const amount = Number(req.body.debitAmount || req.body.creditAmount);

      if (!amount || amount <= 0) {
        throw new Error("Invalid amount");
      }

      let entries = [];

      // ======================
      // DEBIT ENTRY (Receipt etc.)
      // ======================
      if (req.body.debitAmount) {
        entries = [
          {
            partyCode: req.body.partyCode || null,
            particular: req.body.particular,
            narration: req.body.narration,
            debitAmount: amount,
            creditAmount: null,
            transactionType: req.body.transactionType,
          },
          {
            partyCode: null,
            particular: "Cash/Bank",
            narration: req.body.narration,
            debitAmount: null,
            creditAmount: amount,
            transactionType: req.body.transactionType,
          },
        ];
      }

      // ======================
      // CREDIT ENTRY (Payment etc.)
      // ======================
      if (req.body.creditAmount) {
        entries = [
          {
            partyCode: null,
            particular: "Cash/Bank",
            narration: req.body.narration,
            debitAmount: amount,
            creditAmount: null,
            transactionType: req.body.transactionType,
          },
          {
            partyCode: req.body.partyCode || null,
            particular: req.body.particular,
            narration: req.body.narration,
            debitAmount: null,
            creditAmount: amount,
            transactionType: req.body.transactionType,
          },
        ];
      }

      // safety check
      const balanceCheck = validateBalance(entries);
      if (!balanceCheck.valid) {
        throw new Error(
          `Unbalanced entry: Dr ${balanceCheck.totalDebit}, Cr ${balanceCheck.totalCredit}`
        );
      }

      const result = await postLedgerEntries(
        tx,
        voucherDate,
        entries,
        req.user.sub
      );

      entry = result[0];
    });

    res.status(201).json(entry);
  })
);


// ==============================
// POST /api/ledger/validate
// ==============================
router.post(
  '/validate',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const result = validateVoucherEntry(req.body);
    res.json(result);
  })
);


// ==============================
// POST /api/ledger/balance-check
// ==============================
router.post(
  '/balance-check',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries must be an array' });
    }

    const result = validateBalance(entries);
    res.json(result);
  })
);

module.exports = router;

