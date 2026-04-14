/**
 * Ledger Validation Service
 *
 * Enforces double-entry bookkeeping rules for FoxPro parity:
 *
 * Transaction Type     | Debit Side        | Credit Side
 * ---------------------|-------------------|-------------------
 * Issue (Sale)         | Customer Dr       | Sales Cr + GST Cr
 * Return Rent          | Customer Dr       | Rental Income Cr
 * Cash/Bank Receipt    | Cash/Bank Dr      | Customer Cr
 * Cash/Bank Payment    | Customer/Expense Dr| Cash/Bank Cr
 */

const { round2 } = require('./businessRules');

/**
 * Validate that a set of ledger entries is balanced (total Dr === total Cr).
 * Returns { valid, totalDebit, totalCredit, difference }.
 */
function validateBalance(entries = []) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    totalDebit += Number(entry.debitAmount || 0);
    totalCredit += Number(entry.creditAmount || 0);
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const difference = round2(totalDebit - totalCredit);

  return {
    valid: Math.abs(difference) < 0.01,
    totalDebit,
    totalCredit,
    difference,
  };
}

/**
 * Build standard ledger entries for a sales issue (bill/challan).
 * Returns array of entry objects ready for postLedgerEntries.
 *
 * Rule: Customer Dr (total), Sales Cr (taxable), GST Cr (gst)
 */
function buildIssueEntries({ partyCode, billNumber, totalAmount, taxableAmount, gstAmount, narrationPrefix = 'Sales Bill' }) {
  const entries = [];

  // Customer Dr
  if (totalAmount > 0) {
    entries.push({
      partyCode,
      particular: `${narrationPrefix} ${billNumber}`,
      narration: `${narrationPrefix} ${billNumber}`,
      debitAmount: round2(totalAmount),
      creditAmount: null,
      voucherRef: billNumber,
    });
  }

  // Sales Cr
  if (taxableAmount > 0) {
    entries.push({
      partyCode: null,
      particular: `Sales ${billNumber}`,
      narration: `Taxable amount for ${billNumber}`,
      debitAmount: null,
      creditAmount: round2(taxableAmount),
      voucherRef: billNumber,
    });
  }

  // GST Output Cr
  if (gstAmount > 0) {
    entries.push({
      partyCode: null,
      particular: `GST Output ${billNumber}`,
      narration: `GST output for ${billNumber}`,
      debitAmount: null,
      creditAmount: round2(gstAmount),
      voucherRef: billNumber,
    });
  }

  return entries;
}

/**
 * Build standard ledger entries for a rental charge.
 * Rule: Customer Dr (rent), Rental Income Cr (rent)
 */
function buildRentalEntries({ partyCode, refNumber, rentAmount }) {
  if (!rentAmount || rentAmount <= 0) return [];

  return [
    {
      partyCode,
      particular: `Rental for ${refNumber}`,
      narration: `Rental for ${refNumber}`,
      debitAmount: round2(rentAmount),
      creditAmount: null,
      voucherRef: refNumber,
    },
    {
      partyCode: null,
      particular: `Rental Income ${refNumber}`,
      narration: `Rental Income ${refNumber}`,
      debitAmount: null,
      creditAmount: round2(rentAmount),
      voucherRef: refNumber,
    },
  ];
}

/**
 * Build standard ledger entries for a cash/bank receipt.
 * Rule: Cash/Bank Dr, Customer Cr
 */
function buildReceiptEntries({ partyCode, refNumber, amount, mode = 'CASH' }) {
  if (!amount || amount <= 0) return [];

  const accountName = mode === 'BANK' ? 'Bank' : 'Cash';
  return [
    {
      partyCode: null,
      particular: `${accountName} received ${refNumber}`,
      narration: `${accountName} receipt from ${partyCode}`,
      debitAmount: round2(amount),
      creditAmount: null,
      voucherRef: refNumber,
    },
    {
      partyCode,
      particular: `Receipt ${refNumber}`,
      narration: `Receipt against ${refNumber}`,
      debitAmount: null,
      creditAmount: round2(amount),
      voucherRef: refNumber,
    },
  ];
}

/**
 * Validate a voucher entry before posting.
 * Returns { valid, errors[] }.
 */
function validateVoucherEntry(entry) {
  const errors = [];

  if (!entry.transactionType) {
    errors.push('Transaction type is required');
  }

  const debit = Number(entry.debitAmount || 0);
  const credit = Number(entry.creditAmount || 0);

  if (debit === 0 && credit === 0) {
    errors.push('Either debit or credit amount must be specified');
  }

  if (debit > 0 && credit > 0) {
    errors.push('A single entry cannot have both debit and credit amounts');
  }

  if (debit < 0 || credit < 0) {
    errors.push('Amounts cannot be negative');
  }

  // Receipt/Payment types require party code
  const partyRequired = ['CASH_RECEIPT', 'CASH_PAYMENT', 'BANK_RECEIPT', 'BANK_PAYMENT'];
  if (partyRequired.includes(entry.transactionType) && !entry.partyCode) {
    errors.push(`Party code is required for ${entry.transactionType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateBalance,
  buildIssueEntries,
  buildRentalEntries,
  buildReceiptEntries,
  validateVoucherEntry,
};
