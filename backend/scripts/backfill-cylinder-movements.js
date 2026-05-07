const prisma = require('../src/lib/prisma');
const { MOVEMENT_TYPES, recordCylinderMovement } = require('../src/services/cylinderMovementService');

function sameDay(left, right) {
  if (!left || !right) return false;
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

async function hasMovement(tx, holdingId, movementType) {
  const existing = await tx.cylinderMovement.findFirst({
    where: { holdingId, movementType },
    select: { id: true },
  });
  return !!existing;
}

async function findMatchingEcr(tx, holding) {
  if (!holding.returnedAt || !holding.cylinder?.cylinderNumber) return null;
  const candidates = await tx.ecrRecord.findMany({
    where: {
      customerId: holding.customerId,
      cylinderNumber: holding.cylinder.cylinderNumber,
    },
    orderBy: [{ ecrDate: 'asc' }, { id: 'asc' }],
  });

  return candidates.find((ecr) => sameDay(ecr.ecrDate, holding.returnedAt))
    || candidates.find((ecr) => ecr.issueNumber && ecr.issueNumber === holding.transaction?.billNumber)
    || candidates.find((ecr) => ecr.challanNumber && ecr.challanNumber === holding.challan?.challanNumber)
    || candidates[0]
    || null;
}

async function main() {
  let issueCreated = 0;
  let returnCreated = 0;

  const holdings = await prisma.cylinderHolding.findMany({
    include: {
      cylinder: { select: { cylinderNumber: true, status: true } },
      transaction: { select: { billNumber: true, quantityCum: true } },
      challan: { select: { challanNumber: true } },
    },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
  });

  await prisma.$transaction(async (tx) => {
    for (const holding of holdings) {
      if (!(await hasMovement(tx, holding.id, MOVEMENT_TYPES.ISSUE))) {
        await recordCylinderMovement(tx, {
          cylinderId: holding.cylinderId,
          customerId: holding.customerId,
          holdingId: holding.id,
          movementType: MOVEMENT_TYPES.ISSUE,
          movementDate: holding.issuedAt,
          quantityCum: holding.transaction?.quantityCum || null,
          statusBefore: 'IN_STOCK',
          statusAfter: 'WITH_CUSTOMER',
          referenceType: holding.transaction ? 'BILL' : holding.challan ? 'CHALLAN' : 'HOLDING',
          referenceNumber: holding.transaction?.billNumber || holding.challan?.challanNumber || String(holding.id),
          operatorId: null,
        });
        issueCreated += 1;
      }

      if (holding.returnedAt && !(await hasMovement(tx, holding.id, MOVEMENT_TYPES.RETURN))) {
        const ecr = await findMatchingEcr(tx, holding);
        await recordCylinderMovement(tx, {
          cylinderId: holding.cylinderId,
          customerId: holding.customerId,
          holdingId: holding.id,
          movementType: MOVEMENT_TYPES.RETURN,
          movementDate: holding.returnedAt,
          quantityCum: ecr?.quantityCum || holding.transaction?.quantityCum || null,
          statusBefore: 'WITH_CUSTOMER',
          statusAfter: 'IN_STOCK',
          referenceType: ecr ? 'ECR' : 'HOLDING_RETURN',
          referenceNumber: ecr?.ecrNumber || String(holding.id),
          operatorId: ecr?.operatorId || null,
        });
        returnCreated += 1;
      }
    }
  });

  console.log(JSON.stringify({ holdings: holdings.length, issueCreated, returnCreated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
