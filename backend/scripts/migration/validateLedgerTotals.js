const prisma = require('../../src/lib/prisma');

async function validateLedgerTotals(client = prisma) {
  return client.$queryRawUnsafe(`
    SELECT voucher_number AS "voucherNumber",
           COALESCE(transaction_type, '') AS "transactionType",
           ROUND(SUM(COALESCE(debit_amount, 0))::numeric, 2) AS debit,
           ROUND(SUM(COALESCE(credit_amount, 0))::numeric, 2) AS credit,
           ROUND((SUM(COALESCE(debit_amount, 0)) - SUM(COALESCE(credit_amount, 0)))::numeric, 2) AS difference
    FROM ledger_entries
    GROUP BY voucher_number, transaction_type
    HAVING ABS(SUM(COALESCE(debit_amount, 0)) - SUM(COALESCE(credit_amount, 0))) > 0.01
    ORDER BY voucher_number
  `);
}

async function main() {
  const mismatches = await validateLedgerTotals();
  console.log(JSON.stringify(mismatches, null, 2));
  if (mismatches.length) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = validateLedgerTotals;
