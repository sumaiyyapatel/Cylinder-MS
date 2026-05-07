const prisma = require('../../src/lib/prisma');

async function validateCounts(client = prisma) {
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
    client.customer.count(),
    client.cylinder.count(),
    client.bill.count(),
    client.transaction.count(),
    client.challan.count(),
    client.ecrRecord.count(),
    client.payment.count(),
    client.ledgerEntry.count(),
    client.cylinderHolding.count(),
    client.cylinderMovement.count(),
  ]);

  return { customers, cylinders, bills, transactions, challans, ecrRecords, payments, ledgerEntries, holdings, movements };
}

async function main() {
  console.log(JSON.stringify(await validateCounts(), null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = validateCounts;
