const prisma = require('../../src/lib/prisma');

async function detectOrphanCylinders(client = prisma) {
  const [holdingRows, transactionRows, ecrRows, movementRows] = await Promise.all([
    client.$queryRawUnsafe(`
      SELECT h.id, h.cylinder_id
      FROM cylinder_holdings h
      LEFT JOIN cylinders c ON c.id = h.cylinder_id
      WHERE c.id IS NULL
    `),
    client.$queryRawUnsafe(`
      SELECT t.id, t.cylinder_number
      FROM transactions t
      LEFT JOIN cylinders c ON c.cylinder_number = t.cylinder_number
      WHERE t.cylinder_number IS NOT NULL AND c.id IS NULL
    `),
    client.$queryRawUnsafe(`
      SELECT e.id, e.cylinder_number
      FROM ecr_records e
      LEFT JOIN cylinders c ON c.cylinder_number = e.cylinder_number
      WHERE e.cylinder_number IS NOT NULL AND c.id IS NULL
    `),
    client.$queryRawUnsafe(`
      SELECT m.id, m.cylinder_id
      FROM cylinder_movements m
      LEFT JOIN cylinders c ON c.id = m.cylinder_id
      WHERE m.cylinder_id IS NOT NULL AND c.id IS NULL
    `),
  ]);

  return { holdingRows, transactionRows, ecrRows, movementRows };
}

async function main() {
  const orphans = await detectOrphanCylinders();
  console.log(JSON.stringify(orphans, null, 2));
  if (Object.values(orphans).some((rows) => rows.length > 0)) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = detectOrphanCylinders;
