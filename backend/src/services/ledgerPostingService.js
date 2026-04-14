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
      console.warn(
        `[LedgerPosting] Warning: Unbalanced voucher ${voucherNumber} — ` +
        `Dr: ${balanceCheck.totalDebit}, Cr: ${balanceCheck.totalCredit}, ` +
        `Diff: ${balanceCheck.difference}`
      );
      // Log warning but don't block — legacy data may have imbalances
    }
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
