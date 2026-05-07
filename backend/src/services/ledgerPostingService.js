const { generateLedgerVoucherNumber } = require('./numberingService');
const { round2 } = require('./businessRules');
const { validateBalance } = require('./ledgerValidationService');

/**
 * Post a set of ledger entries under a single voucher number.
 * Validates double-entry balance before persisting.
 *
 * @param {object} tx - Prisma transaction client
 * @param {Date} voucherDate - Date for all entries
 * @param {Array} entries - Array of { partyCode, particular, narration, debitAmount, creditAmount, transactionType, voucherRef }
 * @param {number|null} operatorId - Operator performing the action
 * @param {object} options - { transactionType, voucherNumber, skipBalanceCheck }
 * @returns {Array} Created ledger entries
 */
async function postLedgerEntries(tx, voucherDate, entries = [], operatorId = null, options = {}) {
  if (!entries.length) return [];

  const transactionType = options.transactionType || entries[0]?.transactionType || 'JOURNAL';
  const voucherNumber = options.voucherNumber || await generateLedgerVoucherNumber(tx, transactionType, voucherDate);

  // Validate balance (Dr === Cr) unless explicitly skipped
  if (!options.skipBalanceCheck) {
    const balanceCheck = validateBalance(entries);
   if (!balanceCheck.valid) {
  throw new Error(
    `[LedgerPosting] Unbalanced voucher ${voucherNumber} — ` +
    `Dr: ${balanceCheck.totalDebit}, Cr: ${balanceCheck.totalCredit}, ` +
    `Diff: ${balanceCheck.difference}`
  );
}
  }
  if (!entries.every((entry) => {
    const debit = Number(entry.debitAmount || 0);
    const credit = Number(entry.creditAmount || 0);
    return (debit > 0 && credit === 0) || (credit > 0 && debit === 0);
  })) {
    throw new Error('Each ledger row must contain either debit or credit');
  }
  const created = [];
  for (const entry of entries) {
    const createdEntry = await tx.ledgerEntry.create({
      data: {
        voucherNumber,
        voucherDate,
        partyCode: entry.partyCode || null,
        particular: entry.particular || null,
        narration: entry.narration || null,
        debitAmount: entry.debitAmount == null ? null : round2(entry.debitAmount),
        creditAmount: entry.creditAmount == null ? null : round2(entry.creditAmount),
        transactionType: entry.transactionType || transactionType,
        voucherRef: entry.voucherRef || null,
        operatorId: operatorId || null,
      },
    });
    created.push(createdEntry);
  }
  return created;
}

module.exports = { postLedgerEntries };
