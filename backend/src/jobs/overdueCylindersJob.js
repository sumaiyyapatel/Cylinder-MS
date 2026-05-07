const prisma = require('../lib/prisma');
const { markOverdueCylinders } = require('../services/hydroService');

async function runOverdueCylindersJob(prismaClient = prisma) {
  const thresholdSetting = await prismaClient.companySetting.findUnique({
    where: { key: 'overdue_threshold_days' },
  });
  const thresholdDays = Math.max(1, Number(thresholdSetting?.value) || 30);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

  await prismaClient.$transaction([
    prismaClient.cylinderHolding.updateMany({
      where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: cutoffDate } },
      data: { isOverdue: true },
    }),
    prismaClient.cylinderHolding.updateMany({
      where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { gte: cutoffDate } },
      data: { isOverdue: false },
    }),
  ]);

  const newlyOverdueHoldings = await prismaClient.cylinderHolding.findMany({
    where: { status: { in: ['HOLDING', 'BILLED'] }, isOverdue: true, alertSentAt: null },
    include: { cylinder: { select: { cylinderNumber: true } } },
  });

  if (newlyOverdueHoldings.length) {
    await prismaClient.alert.createMany({
      data: newlyOverdueHoldings.map((holding) => {
        const days = Math.ceil((Date.now() - new Date(holding.issuedAt).getTime()) / 86400000);
        return {
          type: 'OVERDUE_CYLINDER',
          customerId: holding.customerId,
          cylinderId: holding.cylinderId,
          message: `Cylinder ${holding.cylinder?.cylinderNumber || 'Unknown'} held for ${days} days`,
          sentVia: 'SYSTEM',
        };
      }),
    });

    await prismaClient.cylinderHolding.updateMany({
      where: { id: { in: newlyOverdueHoldings.map((holding) => holding.id) } },
      data: { alertSentAt: new Date() },
    });
  }

  await markOverdueCylinders(prismaClient);

  return {
    thresholdDays,
    newlyOverdueCount: newlyOverdueHoldings.length,
  };
}

module.exports = { runOverdueCylindersJob };
