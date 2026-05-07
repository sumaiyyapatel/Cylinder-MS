const prisma = require('../../src/lib/prisma');

async function detectDuplicateBills(client = prisma) {
  const [billNumbers, challanNumbers, paymentVouchers, ledgerVoucherRows, ledgerExactRows] = await Promise.all([
    client.$queryRawUnsafe('SELECT bill_number AS key, COUNT(*)::int AS count FROM bills GROUP BY bill_number HAVING COUNT(*) > 1'),
    client.$queryRawUnsafe('SELECT challan_number AS key, COUNT(*)::int AS count FROM challans GROUP BY challan_number HAVING COUNT(*) > 1'),
    client.$queryRawUnsafe('SELECT voucher_number AS key, COUNT(*)::int AS count FROM payments GROUP BY voucher_number HAVING COUNT(*) > 1'),
    client.$queryRawUnsafe(`
      SELECT voucher_number AS key,
             party_code,
             COALESCE(transaction_type, '') AS transaction_type,
             COUNT(*)::int AS count
      FROM ledger_entries
      WHERE party_code IS NOT NULL
      GROUP BY voucher_number, party_code, transaction_type
      HAVING COUNT(*) > 1
      ORDER BY voucher_number
    `),
    client.$queryRawUnsafe(`
      SELECT voucher_number AS key,
             COALESCE(party_code, '') AS party_code,
             COALESCE(particular, '') AS particular,
             COALESCE(transaction_type, '') AS transaction_type,
             COALESCE(voucher_ref, '') AS voucher_ref,
             COUNT(*)::int AS count
      FROM ledger_entries
      GROUP BY voucher_number, party_code, particular, transaction_type, voucher_ref
      HAVING COUNT(*) > 1
      ORDER BY voucher_number
    `),
  ]);

  return { billNumbers, challanNumbers, paymentVouchers, ledgerVoucherRows, ledgerExactRows };
}

async function main() {
  const duplicates = await detectDuplicateBills();
  console.log(JSON.stringify(duplicates, null, 2));
  if (Object.values(duplicates).some((rows) => rows.length > 0)) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = detectDuplicateBills;
