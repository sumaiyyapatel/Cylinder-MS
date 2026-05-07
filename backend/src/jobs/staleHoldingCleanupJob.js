const prisma = require('../lib/prisma');

async function runStaleHoldingCleanupJob(prismaClient = prisma) {
  const staleHoldings = await prismaClient.cylinderHolding.findMany({
    where: {
      status: { in: ['HOLDING', 'BILLED'] },
      cylinder: { status: { in: ['IN_STOCK', 'DAMAGED', 'CONDEMNED', 'UNDER_TEST'] } },
    },
    include: {
      cylinder: { select: { id: true, cylinderNumber: true, status: true } },
      customer: { select: { code: true, name: true } },
    },
  });

  for (const holding of staleHoldings) {
    const existing = await prismaClient.alert.findFirst({
      where: {
        type: 'OVERDUE_CYLINDER',
        cylinderId: holding.cylinderId,
        isResolved: false,
        message: { contains: 'stale active holding' },
      },
    });
    if (existing) continue;

    await prismaClient.alert.create({
      data: {
        type: 'OVERDUE_CYLINDER',
        customerId: holding.customerId,
        cylinderId: holding.cylinderId,
        message: `Cylinder ${holding.cylinder?.cylinderNumber || 'Unknown'} has stale active holding but status is ${holding.cylinder?.status || 'Unknown'}`,
        sentVia: 'SYSTEM',
      },
    });
  }

  return { staleCount: staleHoldings.length };
}

module.exports = { runStaleHoldingCleanupJob };
