const prisma = require('../lib/prisma');
const { deriveNextHydroDueDate } = require('./businessRules');
const { createAuditLog } = require('./auditService');

async function markOverdueCylinders(prismaClient = prisma) {
  const today = new Date();
  const cylinders = await prismaClient.cylinder.findMany({
    where: { isActive: true, nextTestDue: { lt: today } },
    select: { id: true, cylinderNumber: true, nextTestDue: true },
  });

  for (const cyl of cylinders) {
    // Avoid duplicate unresolved TEST_DUE alerts
    const existing = await prismaClient.alert.findFirst({
      where: { cylinderId: cyl.id, type: 'TEST_DUE', isResolved: false },
    });
    if (existing) continue;

    await prismaClient.alert.create({
      data: {
        type: 'TEST_DUE',
        cylinderId: cyl.id,
        message: `Hydro test due for cylinder ${cyl.cylinderNumber}`,
        sentVia: 'SYSTEM',
      },
    });
  }
}

async function completeHydroTest(txOrClient, cylinderId, testDate = new Date(), operatorId = null) {
  const client = txOrClient;
  const parsedDate = new Date(testDate);
  const nextDue = deriveNextHydroDueDate({ hydroTestDate: parsedDate });

  const before = await client.cylinder.findUnique({ where: { id: cylinderId } });
  const updated = await client.cylinder.update({
    where: { id: cylinderId },
    data: { hydroTestDate: parsedDate, nextTestDue: nextDue, status: 'IN_STOCK' },
  });

  // Resolve outstanding TEST_DUE alerts for this cylinder
  await client.alert.updateMany({ where: { cylinderId, type: 'TEST_DUE', isResolved: false }, data: { isResolved: true, resolvedAt: new Date() } });

  // Audit
  if (typeof createAuditLog === 'function') {
    await createAuditLog(client, {
      action: 'HYDRO_TEST_COMPLETE',
      module: 'hydro',
      userId: operatorId,
      entityId: String(cylinderId),
      oldValue: { hydroTestDate: before?.hydroTestDate, nextTestDue: before?.nextTestDue, status: before?.status },
      newValue: { hydroTestDate: updated.hydroTestDate, nextTestDue: updated.nextTestDue, status: updated.status },
    });
  }

  return updated;
}

module.exports = { markOverdueCylinders, completeHydroTest };
