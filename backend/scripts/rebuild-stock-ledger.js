const prisma = require('../src/lib/prisma');
const { rebuildInventoryBalances } = require('../src/services/stockLedgerService');

async function main() {
  await prisma.$transaction(async (tx) => {
    await rebuildInventoryBalances(tx);
  });

  const [ledgerRows, balances] = await Promise.all([
    prisma.stockLedger.count(),
    prisma.inventoryBalance.findMany({ orderBy: [{ gasCode: 'asc' }, { ownerCode: 'asc' }] }),
  ]);

  console.log(JSON.stringify({ ledgerRows, balances }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
