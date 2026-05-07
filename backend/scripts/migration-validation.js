const prisma = require('../src/lib/prisma');
const validateCounts = require('./migration/validateCounts');
const validateLedgerTotals = require('./migration/validateLedgerTotals');
const detectDuplicateBills = require('./migration/detectDuplicateBills');
const detectOrphanCylinders = require('./migration/detectOrphanCylinders');
const verifyHoldings = require('./migration/verifyHoldings');

function totalIssues(report) {
  return Object.values(report).reduce((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    if (value && typeof value === 'object') return sum + totalIssues(value);
    return sum;
  }, 0);
}

async function main() {
  const report = {
    rowCounts: await validateCounts(prisma),
    duplicates: await detectDuplicateBills(prisma),
    orphans: await detectOrphanCylinders(prisma),
    ledgerMismatches: await validateLedgerTotals(prisma),
    holdingMismatches: await verifyHoldings(prisma),
  };

  console.log(JSON.stringify(report, null, 2));

  const issueCount = totalIssues({
    duplicates: report.duplicates,
    orphans: report.orphans,
    ledgerMismatches: report.ledgerMismatches,
    holdingMismatches: report.holdingMismatches,
  });

  if (issueCount > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
