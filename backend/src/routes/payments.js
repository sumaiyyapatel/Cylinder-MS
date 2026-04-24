const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { parseDate, parseOptionalNonNegativeNumber, parseRequiredInt } = require('../lib/validation');
const {
  VALID_PAYMENT_MODES,
  getCustomerBalance,
  getCustomerOutstanding,
  recordPayment,
} = require('../services/paymentService');

const router = express.Router();

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const customerId = parseRequiredInt(req.body.customerId, 'customerId');
  const billIdValue = parseOptionalNonNegativeNumber(req.body.billId, 'billId');
  const ecrIdValue = parseOptionalNonNegativeNumber(req.body.ecrId, 'ecrId');
  const amountValue = parseOptionalNonNegativeNumber(req.body.amount, 'amount');
  const billId = billIdValue == null ? null : Math.trunc(billIdValue);
  const ecrId = ecrIdValue == null ? null : Math.trunc(ecrIdValue);
  const amount = amountValue == null ? 0 : amountValue;
  const paymentMode = String(req.body.paymentMode || '').trim().toUpperCase();

  if (billId != null && billId <= 0) throw new AppError(400, 'billId must be a positive integer');
  if (ecrId != null && ecrId <= 0) throw new AppError(400, 'ecrId must be a positive integer');
  if (billId != null && ecrId != null) throw new AppError(400, 'Use either billId or ecrId, not both');
  if (amount <= 0) throw new AppError(400, 'amount must be positive');
  if (!VALID_PAYMENT_MODES.includes(paymentMode)) throw new AppError(400, 'Invalid paymentMode');

  const voucherDate = parseDate(req.body.voucherDate, 'voucherDate') || new Date();
  const payment = await prisma.$transaction(async (tx) => recordPayment(tx, {
    customerId,
    billId,
    ecrId,
    amount,
    paymentMode,
    reference: req.body.reference,
    voucherDate,
    operatorId: req.user.sub,
  }));

  res.status(201).json(payment);
}));

router.get('/customers/:customerId/balance', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const customerId = parseRequiredInt(req.params.customerId, 'customerId');
  const balance = await getCustomerBalance(prisma, customerId);
  res.json(balance);
}));

router.get('/customers/:customerId/outstanding', authenticate, authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const customerId = parseRequiredInt(req.params.customerId, 'customerId');
  const outstanding = await getCustomerOutstanding(prisma, customerId);
  res.json(outstanding);
}));

module.exports = router;
