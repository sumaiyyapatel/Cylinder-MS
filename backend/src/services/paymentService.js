const { AppError } = require('../middleware/errorHandler');
const { round2 } = require('./businessRules');
const { generateLedgerVoucherNumber } = require('./numberingService');
const { buildReceiptEntries } = require('./ledgerValidationService');
const { postLedgerEntries } = require('./ledgerPostingService');

const VALID_PAYMENT_MODES = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI'];

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizePaymentMode(mode) {
  const value = String(mode || '').trim().toUpperCase();
  if (!VALID_PAYMENT_MODES.includes(value)) {
    throw new AppError(400, 'Invalid paymentMode');
  }
  return value;
}

function getReceiptTransactionType(paymentMode) {
  return paymentMode === 'CASH' ? 'CASH_RECEIPT' : 'BANK_RECEIPT';
}

function getReceiptLedgerMode(paymentMode) {
  return paymentMode === 'CASH' ? 'CASH' : 'BANK';
}

async function getCustomerOrThrow(tx, customerId) {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true, code: true, name: true, isActive: true },
  });

  if (!customer || !customer.isActive) {
    throw new AppError(404, 'Customer not found');
  }

  return customer;
}

async function getBillOrThrow(tx, billId, customerId) {
  if (!billId) return null;

  const bill = await tx.bill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      customerId: true,
      billNumber: true,
      billDate: true,
      totalAmount: true,
    },
  });

  if (!bill) throw new AppError(404, 'Bill not found');
  if (bill.customerId !== customerId) {
    throw new AppError(409, 'Bill does not belong to the selected customer');
  }

  return bill;
}

function mapPaymentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: row.voucherNumber,
    voucherDate: row.voucherDate,
    customerId: row.customerId,
    billId: row.billId,
    paymentMode: row.paymentMode,
    amount: asNumber(row.amount),
    reference: row.reference,
    createdAt: row.createdAt,
  };
}

async function recordPayment(tx, {
  customerId,
  billId,
  amount,
  paymentMode,
  reference,
  voucherDate,
  operatorId,
}) {
  const normalizedAmount = round2(amount);
  if (!normalizedAmount || normalizedAmount <= 0) {
    throw new AppError(400, 'Amount must be positive');
  }

  const effectivePaymentMode = normalizePaymentMode(paymentMode);
  const customer = await getCustomerOrThrow(tx, customerId);
  const bill = await getBillOrThrow(tx, billId, customerId);

  const transactionType = getReceiptTransactionType(effectivePaymentMode);
  const voucherNumber = await generateLedgerVoucherNumber(tx, transactionType, voucherDate);
  const rows = await tx.$queryRaw`
    INSERT INTO payments (
      voucher_number,
      voucher_date,
      customer_id,
      bill_id,
      payment_mode,
      amount,
      reference,
      operator_id
    )
    VALUES (
      ${voucherNumber},
      ${voucherDate},
      ${customerId},
      ${bill?.id ?? null},
      ${effectivePaymentMode},
      ${normalizedAmount},
      ${reference || null},
      ${operatorId || null}
    )
    RETURNING
      id,
      voucher_number AS "voucherNumber",
      voucher_date AS "voucherDate",
      customer_id AS "customerId",
      bill_id AS "billId",
      payment_mode AS "paymentMode",
      amount,
      reference,
      created_at AS "createdAt"
  `;

  const payment = mapPaymentRow(rows[0]);

  const receiptEntries = buildReceiptEntries({
    partyCode: customer.code,
    refNumber: bill?.billNumber || voucherNumber,
    amount: normalizedAmount,
    mode: getReceiptLedgerMode(effectivePaymentMode),
  });

  await postLedgerEntries(tx, voucherDate, receiptEntries, operatorId, {
    transactionType,
    voucherNumber,
  });

  const balance = await updateCustomerBalance(tx, customerId, voucherDate);

  return {
    ...payment,
    customerCode: customer.code,
    customerName: customer.name,
    billNumber: bill?.billNumber || null,
    balance,
  };
}

async function updateCustomerBalance(tx, customerId, asOf) {
  const customer = await getCustomerOrThrow(tx, customerId);
  const totals = await tx.$queryRaw`
    SELECT
      COALESCE(SUM(COALESCE(debit_amount, 0)), 0)::numeric AS "totalDebit",
      COALESCE(SUM(COALESCE(credit_amount, 0)), 0)::numeric AS "totalCredit"
    FROM ledger_entries
    WHERE party_code = ${customer.code}
      AND voucher_date <= ${asOf}
  `;

  const totalDebit = round2(asNumber(totals[0]?.totalDebit));
  const totalCredit = round2(asNumber(totals[0]?.totalCredit));
  const balance = round2(totalDebit - totalCredit);

  const rows = await tx.$queryRaw`
    INSERT INTO customer_balances (
      customer_id,
      as_of,
      total_debit,
      total_credit,
      balance
    )
    VALUES (
      ${customerId},
      ${asOf},
      ${totalDebit},
      ${totalCredit},
      ${balance}
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      as_of = EXCLUDED.as_of,
      total_debit = EXCLUDED.total_debit,
      total_credit = EXCLUDED.total_credit,
      balance = EXCLUDED.balance,
      updated_at = NOW()
    RETURNING
      id,
      customer_id AS "customerId",
      as_of AS "asOf",
      total_debit AS "totalDebit",
      total_credit AS "totalCredit",
      balance,
      updated_at AS "updatedAt"
  `;

  const row = rows[0];
  return {
    id: row.id,
    customerId: row.customerId,
    asOf: row.asOf,
    totalDebit: asNumber(row.totalDebit),
    totalCredit: asNumber(row.totalCredit),
    balance: asNumber(row.balance),
    updatedAt: row.updatedAt,
  };
}

async function getCustomerBalance(tx, customerId) {
  await getCustomerOrThrow(tx, customerId);
  const rows = await tx.$queryRaw`
    SELECT
      id,
      customer_id AS "customerId",
      as_of AS "asOf",
      total_debit AS "totalDebit",
      total_credit AS "totalCredit",
      balance,
      updated_at AS "updatedAt"
    FROM customer_balances
    WHERE customer_id = ${customerId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) throw new AppError(404, 'Balance not found');

  return {
    id: row.id,
    customerId: row.customerId,
    asOf: row.asOf,
    totalDebit: asNumber(row.totalDebit),
    totalCredit: asNumber(row.totalCredit),
    balance: asNumber(row.balance),
    updatedAt: row.updatedAt,
  };
}

async function getCustomerOutstanding(tx, customerId) {
  await getCustomerOrThrow(tx, customerId);

  const bills = await tx.bill.findMany({
    where: { customerId },
    select: {
      id: true,
      billNumber: true,
      billDate: true,
      totalAmount: true,
    },
    orderBy: { billDate: 'asc' },
  });

  if (!bills.length) return [];

  const payments = await tx.$queryRaw`
    SELECT
      bill_id AS "billId",
      COALESCE(SUM(amount), 0)::numeric AS "paidAmount"
    FROM payments
    WHERE customer_id = ${customerId}
      AND bill_id IS NOT NULL
    GROUP BY bill_id
  `;

  const paidMap = new Map(
    payments.map((row) => [row.billId, asNumber(row.paidAmount)])
  );

  return bills
    .map((bill) => {
      const totalAmount = asNumber(bill.totalAmount);
      const paidAmount = round2(paidMap.get(bill.id) || 0);
      const owing = round2(totalAmount - paidAmount);
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(bill.billDate).getTime()) / 86400000)
      );

      return {
        billId: bill.id,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        amount: totalAmount,
        paid: paidAmount,
        owing,
        daysOverdue,
      };
    })
    .filter((bill) => bill.owing > 0);
}

module.exports = {
  VALID_PAYMENT_MODES,
  getCustomerBalance,
  getCustomerOutstanding,
  normalizePaymentMode,
  recordPayment,
  updateCustomerBalance,
};
