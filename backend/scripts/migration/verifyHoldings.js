const prisma = require('../../src/lib/prisma');

async function verifyHoldings(client = prisma) {
  return client.$queryRawUnsafe(`
    WITH movement_summary AS (
      SELECT cylinder_id,
             SUM(CASE WHEN movement_type = 'ISSUE' THEN quantity_cyl ELSE 0 END) AS issued,
             SUM(CASE WHEN movement_type = 'RETURN' THEN quantity_cyl ELSE 0 END) AS returned
      FROM cylinder_movements
      WHERE cylinder_id IS NOT NULL
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

async function main() {
  const mismatches = await verifyHoldings();
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

module.exports = verifyHoldings;
