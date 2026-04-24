const { AppError } = require('../middleware/errorHandler');
const { round2 } = require('./businessRules');
const { generateLedgerVoucherNumber } = require('./numberingService');
const { buildReceiptEntries } = require('./ledgerValidationService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { createAuditLog } = require('./auditService');

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

async function getEcrOrThrow(tx, ecrId, customerId) {
  if (!ecrId) return null;

  const ecr = await tx.ecrRecord.findUnique({
    where: { id: ecrId },
    select: {
      id: true,
      customerId: true,
      ecrNumber: true,
      ecrDate: true,
      rentAmount: true,
    },
  });

  if (!ecr) throw new AppError(404, 'ECR not found');
  if (ecr.customerId !== customerId) {
    throw new AppError(409, 'ECR does not belong to the selected customer');
  }

  return ecr;
}

function mapPaymentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: row.voucherNumber,
    voucherDate: row.voucherDate,
    customerId: row.customerId,
    billId: row.billId,
    ecrId: row.ecrId,
    paymentMode: row.paymentMode,
    amount: asNumber(row.amount),
    reference: row.reference,
    createdAt: row.createdAt,
  };
}

async function recordPayment(tx, {
  customerId,
  billId,
  ecrId,
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
  if (effectivePaymentMode !== 'CASH' && !String(reference || '').trim()) {
    throw new AppError(400, 'Reference is required for non-cash payments');
  }

  const customer = await getCustomerOrThrow(tx, customerId);
  const bill = await getBillOrThrow(tx, billId, customerId);
  const ecr = await getEcrOrThrow(tx, ecrId, customerId);

  if (bill && ecr) {
    throw new AppError(400, 'Payment can link to either billId or ecrId, not both');
  }

  const outstanding = await getCustomerOutstanding(tx, customerId);
  if (bill) {
    const billOutstanding = outstanding.find((item) => item.type === 'BILL' && item.billId === bill.id);
    const owing = billOutstanding?.owing || 0;
    if (normalizedAmount > owing + 0.01) {
      throw new AppError(409, `Payment exceeds bill outstanding by ${round2(normalizedAmount - owing)}`);
    }
  }
  if (ecr) {
    const ecrOutstanding = outstanding.find((item) => item.type === 'ECR_RENT' && item.ecrId === ecr.id);
    const owing = ecrOutstanding?.owing || 0;
    if (normalizedAmount > owing + 0.01) {
      throw new AppError(409, `Payment exceeds ECR rent outstanding by ${round2(normalizedAmount - owing)}`);
    }
  }

  const transactionType = getReceiptTransactionType(effectivePaymentMode);
  const voucherNumber = await generateLedgerVoucherNumber(tx, transactionType, voucherDate);
  const rows = await tx.$queryRaw`
    INSERT INTO payments (
      voucher_number,
      voucher_date,
      customer_id,
      bill_id,
      ecr_id,
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
      ${ecr?.id ?? null},
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
      ecr_id AS "ecrId",
      payment_mode AS "paymentMode",
      amount,
      reference,
      created_at AS "createdAt"
  `;

  const payment = mapPaymentRow(rows[0]);

  const receiptEntries = buildReceiptEntries({
    partyCode: customer.code,
    refNumber: bill?.billNumber || ecr?.ecrNumber || voucherNumber,
    amount: normalizedAmount,
    mode: getReceiptLedgerMode(effectivePaymentMode),
  });

  await postLedgerEntries(tx, voucherDate, receiptEntries, operatorId, {
    transactionType,
    voucherNumber,
  });

  const balance = await updateCustomerBalance(tx, customerId, voucherDate);

  await createAuditLog(tx, {
    action: 'PAYMENT_RECORDED',
    module: 'payments',
    userId: operatorId,
    entityId: String(payment.id),
    newValue: {
      voucherNumber,
      customerCode: customer.code,
      billNumber: bill?.billNumber || null,
      ecrNumber: ecr?.ecrNumber || null,
      amount: normalizedAmount,
      paymentMode: effectivePaymentMode,
      reference: reference || null,
    },
  });

  return {
    ...payment,
    customerCode: customer.code,
    customerName: customer.name,
    billNumber: bill?.billNumber || null,
    ecrNumber: ecr?.ecrNumber || null,
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

  const [bills, ecrs] = await Promise.all([
    tx.bill.findMany({
      where: { customerId },
      select: {
        id: true,
        billNumber: true,
        billDate: true,
        totalAmount: true,
      },
      orderBy: { billDate: 'asc' },
    }),
    tx.ecrRecord.findMany({
      where: { customerId, rentAmount: { gt: 0 } },
      select: {
        id: true,
        ecrNumber: true,
        ecrDate: true,
        rentAmount: true,
        cylinderNumber: true,
      },
      orderBy: { ecrDate: 'asc' },
    }),
  ]);

  if (!bills.length && !ecrs.length) return [];

  const payments = await tx.$queryRaw`
    SELECT
      bill_id AS "billId",
      ecr_id AS "ecrId",
      COALESCE(SUM(amount), 0)::numeric AS "paidAmount"
    FROM payments
    WHERE customer_id = ${customerId}
      AND (bill_id IS NOT NULL OR ecr_id IS NOT NULL)
    GROUP BY bill_id, ecr_id
  `;

  const paidMap = new Map(
    payments.map((row) => [`${row.billId ? 'BILL' : 'ECR'}:${row.billId || row.ecrId}`, asNumber(row.paidAmount)])
  );

  const billOutstanding = bills
    .map((bill) => {
      const totalAmount = asNumber(bill.totalAmount);
      const paidAmount = round2(paidMap.get(`BILL:${bill.id}`) || 0);
      const owing = round2(totalAmount - paidAmount);
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(bill.billDate).getTime()) / 86400000)
      );

      return {
        type: 'BILL',
        billId: bill.id,
        ecrId: null,
        refNumber: bill.billNumber,
        billNumber: bill.billNumber,
        ecrNumber: null,
        billDate: bill.billDate,
        documentDate: bill.billDate,
        description: 'Bill outstanding',
        amount: totalAmount,
        paid: paidAmount,
        owing,
        daysOverdue,
      };
    })
    .filter((bill) => bill.owing > 0);

  const ecrOutstanding = ecrs
    .map((ecr) => {
      const totalAmount = asNumber(ecr.rentAmount);
      const paidAmount = round2(paidMap.get(`ECR:${ecr.id}`) || 0);
      const owing = round2(totalAmount - paidAmount);
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(ecr.ecrDate).getTime()) / 86400000)
      );

      return {
        type: 'ECR_RENT',
        billId: null,
        ecrId: ecr.id,
        refNumber: ecr.ecrNumber,
        billNumber: null,
        ecrNumber: ecr.ecrNumber,
        billDate: ecr.ecrDate,
        documentDate: ecr.ecrDate,
        description: `Rent for cylinder ${ecr.cylinderNumber || '-'}`,
        amount: totalAmount,
        paid: paidAmount,
        owing,
        daysOverdue,
      };
    })
    .filter((ecr) => ecr.owing > 0);

  return [...billOutstanding, ...ecrOutstanding].sort(
    (a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime()
  );
}

module.exports = {
  VALID_PAYMENT_MODES,
  getCustomerBalance,
  getCustomerOutstanding,
  normalizePaymentMode,
  recordPayment,
  updateCustomerBalance,
};
