const prisma = require('../src/lib/prisma');

async function countRows() {
  const [
    customers,
    cylinders,
    bills,
    transactions,
    challans,
    ecrRecords,
    payments,
    ledgerEntries,
    holdings,
    movements,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.cylinder.count(),
    prisma.bill.count(),
    prisma.transaction.count(),
    prisma.challan.count(),
    prisma.ecrRecord.count(),
    prisma.payment.count(),
    prisma.ledgerEntry.count(),
    prisma.cylinderHolding.count(),
    prisma.cylinderMovement.count(),
  ]);

  return { customers, cylinders, bills, transactions, challans, ecrRecords, payments, ledgerEntries, holdings, movements };
}

async function findDuplicateDocuments() {
  const [billNumbers, challanNumbers, paymentVouchers, ledgerVouchers] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT bill_number AS key, COUNT(*)::int AS count FROM bills GROUP BY bill_number HAVING COUNT(*) > 1'),
    prisma.$queryRawUnsafe('SELECT challan_number AS key, COUNT(*)::int AS count FROM challans GROUP BY challan_number HAVING COUNT(*) > 1'),
    prisma.$queryRawUnsafe('SELECT voucher_number AS key, COUNT(*)::int AS count FROM payments GROUP BY voucher_number HAVING COUNT(*) > 1'),
    prisma.$queryRawUnsafe(`
      SELECT voucher_number AS key,
             COALESCE(party_code, '') AS party_code,
             COALESCE(particular, '') AS particular,
             COALESCE(transaction_type, '') AS transaction_type,
             COALESCE(voucher_ref, '') AS voucher_ref,
             COUNT(*)::int AS count
      FROM ledger_entries
      GROUP BY voucher_number, party_code, particular, transaction_type, voucher_ref
      HAVING COUNT(*) > 1
    `),
  ]);

  return { billNumbers, challanNumbers, paymentVouchers, ledgerVouchers };
}

async function findOrphanCylinders() {
  const [holdingRows, transactionRows, ecrRows, movementRows] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT h.id, h.cylinder_id
      FROM cylinder_holdings h
      LEFT JOIN cylinders c ON c.id = h.cylinder_id
      WHERE c.id IS NULL
    `),
    prisma.$queryRawUnsafe(`
      SELECT t.id, t.cylinder_number
      FROM transactions t
      LEFT JOIN cylinders c ON c.cylinder_number = t.cylinder_number
      WHERE t.cylinder_number IS NOT NULL AND c.id IS NULL
    `),
    prisma.$queryRawUnsafe(`
      SELECT e.id, e.cylinder_number
      FROM ecr_records e
      LEFT JOIN cylinders c ON c.cylinder_number = e.cylinder_number
      WHERE e.cylinder_number IS NOT NULL AND c.id IS NULL
    `),
    prisma.$queryRawUnsafe(`
      SELECT m.id, m.cylinder_id
      FROM cylinder_movements m
      LEFT JOIN cylinders c ON c.id = m.cylinder_id
      WHERE c.id IS NULL
    `),
  ]);

  return { holdingRows, transactionRows, ecrRows, movementRows };
}

async function findLedgerMismatches() {
  return prisma.$queryRawUnsafe(`
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

async function verifyHoldingRecalculation() {
  return prisma.$queryRawUnsafe(`
    WITH movement_summary AS (
      SELECT cylinder_id,
             SUM(CASE WHEN movement_type = 'ISSUE' THEN quantity_cyl ELSE 0 END) AS issued,
             SUM(CASE WHEN movement_type = 'RETURN' THEN quantity_cyl ELSE 0 END) AS returned
      FROM cylinder_movements
      GROUP BY cylinder_id
    ),
    active_holdings AS (
      SELECT cylinder_id, COUNT(*) AS active
      FROM cylinder_holdings
      WHERE status IN ('HOLDING', 'BILLED')
      GROUP BY cylinder_id
    )
    SELECT c.cylinder_number AS "cylinderNumber",
           COALESCE(ms.issued, 0)::int AS issued,
           COALESCE(ms.returned, 0)::int AS returned,
           COALESCE(ah.active, 0)::int AS active,
           (COALESCE(ms.issued, 0) - COALESCE(ms.returned, 0) - COALESCE(ah.active, 0))::int AS delta
    FROM cylinders c
    LEFT JOIN movement_summary ms ON ms.cylinder_id = c.id
    LEFT JOIN active_holdings ah ON ah.cylinder_id = c.id
    WHERE ABS(COALESCE(ms.issued, 0) - COALESCE(ms.returned, 0) - COALESCE(ah.active, 0)) > 0
    ORDER BY c.cylinder_number
  `);
}

function totalIssues(report) {
  return Object.values(report).reduce((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    if (value && typeof value === 'object') return sum + totalIssues(value);
    return sum;
  }, 0);
}

async function main() {
  const report = {
    rowCounts: await countRows(),
    duplicates: await findDuplicateDocuments(),
    orphans: await findOrphanCylinders(),
    ledgerMismatches: await findLedgerMismatches(),
    holdingMismatches: await verifyHoldingRecalculation(),
  };

  console.log(JSON.stringify(report, null, 2));

  const issueCount = totalIssues({
    duplicates: report.duplicates,
    orphans: report.orphans,
    ledgerMismatches: report.ledgerMismatches,
    holdingMismatches: report.holdingMismatches,
  });

  if (issueCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
