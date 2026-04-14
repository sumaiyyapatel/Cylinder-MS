const { generateLedgerVoucherNumber } = require('./numberingService');
const { round2 } = require('./businessRules');

async function postLedgerEntries(tx, voucherDate, entries = [], operatorId = null, options = {}) {
  if (!entries.length) return [];

  const transactionType = options.transactionType || entries[0]?.transactionType || 'JOURNAL';
  const voucherNumber = options.voucherNumber || await generateLedgerVoucherNumber(tx, transactionType, voucherDate);
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
