const prisma = require('../src/lib/prisma');
const { closeDailyStock } = require('../src/services/stockLedgerService');

async function main() {
  const closingDate = process.argv[2] ? new Date(process.argv[2]) : new Date();
  if (Number.isNaN(closingDate.getTime())) {
    throw new Error('closing date is invalid');
  }

  await prisma.$transaction(async (tx) => {
    await closeDailyStock(tx, closingDate);
  });

  console.log(JSON.stringify({ closedDate: closingDate.toISOString().slice(0, 10) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
