const { calculateHoldDays, normalizeOwnerCode, isPocOwner, round2 } = require('./businessRules');
const { calculateRent, getEffectiveRate } = require('./rentalService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { updateCylinderStatus } = require('./cylinderStatusService');
const { generateEcrNumber } = require('./numberingService');
const { createAuditLog } = require('./auditService');
const { MOVEMENT_TYPES, recordCylinderMovement } = require('./cylinderMovementService');

/**
 * Create a holding record for a cylinder issue.
 * @param {object} tx - Prisma transaction client
 * @param {object} opts - { cylinderId, customerId, transactionId, challanId, issuedAt, status }
 */
async function createHolding(tx, { cylinderId, customerId, transactionId = null, challanId = null, issuedAt = new Date(), status = 'HOLDING' } = {}) {
  const holding = await tx.cylinderHolding.create({
    data: {
      cylinderId,
      customerId,
      transactionId: transactionId || null,
      challanId: challanId || null,
      issuedAt,
      status,
    },
  });
  return holding;
}

/**
 * Calculate hold days and rent for a holding.
 * @param {object} tx - Prisma transaction client
 * @param {object} opts - { holdingId, returnDate }
 */
async function calculateHoldingRent(tx, { holdingId, returnDate = new Date() } = {}) {
  const holding = await tx.cylinderHolding.findUnique({ where: { id: holdingId }, include: { cylinder: true } });
  if (!holding) throw new Error('Holding not found');

  const issueDate = holding.issuedAt;
  const holdDays = calculateHoldDays(issueDate, returnDate);
  let rentAmount = 0;

  const effectiveOwner = normalizeOwnerCode(holding.cylinder?.ownerCode);
  if (!isPocOwner(effectiveOwner)) {
    const rateConfig = await getEffectiveRate(tx, { customerId: holding.customerId, gasCode: holding.cylinder?.gasCode, ownerCode: effectiveOwner });
    rentAmount = calculateRent(holdDays, rateConfig);
  }
  rentAmount = round2(rentAmount);
  return { holdDays, rentAmount };
}

function parseCutoffDate(asOfDate) {
  if (!asOfDate) return new Date();
  const cutoff = new Date(asOfDate);
  if (Number.isNaN(cutoff.getTime())) throw new Error('asOfDate is invalid');
  return cutoff;
}

function createHoldingSummaryBucket({ customerId, customerCode = null, customerName = null, gasCode = null, ownerCode = null }) {
  return {
    customerId,
    customerCode,
    customerName,
    gasCode,
    ownerCode,
    issueCylinders: 0,
    returnCylinders: 0,
    balanceCylinders: 0,
    issueQuantity: 0,
    returnQuantity: 0,
    balanceQuantity: 0,
    activeHoldings: 0,
    heldCylinders: [],
  };
}

function summaryKey({ customerId, gasCode, ownerCode }) {
  return `${customerId || 'ALL'}|${gasCode || 'UNKNOWN'}|${ownerCode || 'UNKNOWN'}`;
}

function getOrCreateBucket(map, seed) {
  const key = summaryKey(seed);
  if (!map.has(key)) map.set(key, createHoldingSummaryBucket(seed));
  return map.get(key);
}

function matchesOwner(cylinderOwner, ownerCode) {
  if (!ownerCode) return true;
  return normalizeOwnerCode(cylinderOwner) === normalizeOwnerCode(ownerCode);
}

function isHoldingActiveAsOf(holding, cutoff) {
  return holding.issuedAt <= cutoff && (!holding.returnedAt || holding.returnedAt > cutoff);
}

async function getHoldingQuantitySummary(tx, {
  customerId = null,
  gasCode = null,
  ownerCode = null,
  asOfDate = new Date(),
} = {}) {
  const cutoff = parseCutoffDate(asOfDate);
  const customerFilter = customerId ? Number(customerId) : null;
  const movementWhere = {
    movementType: { in: [MOVEMENT_TYPES.ISSUE, MOVEMENT_TYPES.RETURN] },
    movementDate: { lte: cutoff },
  };
  if (customerFilter) movementWhere.customerId = customerFilter;

  const [movements, holdings] = await Promise.all([
    tx.cylinderMovement.findMany({
      where: movementWhere,
      include: {
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true } },
        customer: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
    }),
    tx.cylinderHolding.findMany({
      where: {
        ...(customerFilter ? { customerId: customerFilter } : {}),
        issuedAt: { lte: cutoff },
      },
      include: {
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true } },
        customer: { select: { id: true, code: true, name: true } },
        transaction: { select: { quantityCum: true } },
      },
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const buckets = new Map();

  for (const movement of movements) {
    const movementGas = movement.gasCode || movement.cylinder?.gasCode || null;
    const movementOwner = movement.ownerCode || movement.cylinder?.ownerCode || null;
    if (gasCode && movementGas !== gasCode) continue;
    if (!matchesOwner(movementOwner, ownerCode)) continue;

    const bucket = getOrCreateBucket(buckets, {
      customerId: movement.customerId,
      customerCode: movement.customer?.code || null,
      customerName: movement.customer?.name || null,
      gasCode: movementGas,
      ownerCode: normalizeOwnerCode(movementOwner),
    });

    const cylQty = Number(movement.quantityCyl || 0);
    const qty = Number(movement.quantityCum || 0);
    if (movement.movementType === MOVEMENT_TYPES.ISSUE) {
      bucket.issueCylinders += cylQty;
      bucket.issueQuantity = round2(bucket.issueQuantity + qty);
    } else if (movement.movementType === MOVEMENT_TYPES.RETURN) {
      bucket.returnCylinders += cylQty;
      bucket.returnQuantity = round2(bucket.returnQuantity + qty);
    }
  }

  for (const holding of holdings) {
    const holdingGas = holding.cylinder?.gasCode || null;
    const holdingOwner = holding.cylinder?.ownerCode || null;
    if (gasCode && holdingGas !== gasCode) continue;
    if (!matchesOwner(holdingOwner, ownerCode)) continue;

    const bucket = getOrCreateBucket(buckets, {
      customerId: holding.customerId,
      customerCode: holding.customer?.code || null,
      customerName: holding.customer?.name || null,
      gasCode: holdingGas,
      ownerCode: normalizeOwnerCode(holdingOwner),
    });

    if (isHoldingActiveAsOf(holding, cutoff)) {
      bucket.activeHoldings += 1;
      bucket.heldCylinders.push({
        holdingId: holding.id,
        cylinderNumber: holding.cylinder?.cylinderNumber || null,
        issuedAt: holding.issuedAt,
        quantityCum: Number(holding.transaction?.quantityCum || 0),
      });
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      balanceCylinders: bucket.issueCylinders - bucket.returnCylinders,
      balanceQuantity: round2(bucket.issueQuantity - bucket.returnQuantity),
    }))
    .sort((left, right) => `${left.customerCode || ''}${left.gasCode || ''}`.localeCompare(`${right.customerCode || ''}${right.gasCode || ''}`));
}

/**
 * Close a holding and create an ECR record; post ledger entries when applicable.
 * @param {object} tx - Prisma transaction client
 * @param {object} opts - { holdingId, returnDate, cylinderOwner, gasCode, challanNumber, challanDate, vehicleNumber, quantityCum, operatorId, performedBy }
 */
async function returnCylinder(tx, {
  holdingId,
  returnDate = new Date(),
  cylinderOwner = null,
  gasCode = null,
  challanNumber = null,
  challanDate = null,
  vehicleNumber = null,
  quantityCum = null,
  operatorId = null,
  performedBy = null,
} = {}) {
  const holding = await tx.cylinderHolding.findUnique({ where: { id: holdingId }, include: { cylinder: true, transaction: true } });
  if (!holding) throw new Error('No matching holding found');
 if (!['HOLDING', 'BILLED'].includes(holding.status)) {
  throw new Error('Holding already closed');
}

  const issueDate = holding.issuedAt;
  if (returnDate < issueDate) throw new Error('Return date cannot be before issue date');

  const holdDays = calculateHoldDays(issueDate, returnDate);
  const effectiveOwner = normalizeOwnerCode(cylinderOwner || holding.cylinder?.ownerCode);

  let rentAmount = 0;
  if (!isPocOwner(effectiveOwner)) {
    const rateConfig = await getEffectiveRate(tx, { customerId: holding.customerId, gasCode: gasCode || holding.cylinder?.gasCode, ownerCode: effectiveOwner });
    rentAmount = calculateRent(holdDays, rateConfig);
  }
  rentAmount = round2(rentAmount);

  await tx.cylinderHolding.update({ where: { id: holdingId }, data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' } });

  await updateCylinderStatus(tx, holding.cylinderId, 'IN_STOCK');

  const ecrNumber = await generateEcrNumber(tx, returnDate);
  const createdEcr = await tx.ecrRecord.create({
    data: {
      ecrNumber,
      ecrDate: returnDate,
      customerId: holding.customerId,
      gasCode: gasCode || holding.cylinder?.gasCode || null,
      cylinderOwner: effectiveOwner,
      cylinderNumber: holding.cylinder?.cylinderNumber || null,
      issueNumber: holding.transaction?.billNumber || null,
      issueDate,
      holdDays,
      rentAmount,
      challanNumber: challanNumber || null,
      challanDate: challanDate || null,
      vehicleNumber: vehicleNumber || null,
      operatorId: operatorId || null,
      quantityCum: quantityCum == null ? null : round2(quantityCum),
    },
  });
  await recordCylinderMovement(tx, {
    cylinderId: holding.cylinderId,
    customerId: holding.customerId,
    holdingId,
    gasCode: gasCode || holding.cylinder?.gasCode || null,
    ownerCode: effectiveOwner,
    movementType: MOVEMENT_TYPES.RETURN,
    movementDate: returnDate,
    quantityCum,
    statusBefore: holding.cylinder?.status,
    statusAfter: 'IN_STOCK',
    referenceType: 'ECR',
    referenceNumber: ecrNumber,
    operatorId: operatorId || performedBy || null,
  });

  if (rentAmount && rentAmount > 0) {
    const customerRec = await tx.customer.findUnique({ where: { id: holding.customerId }, select: { code: true } });
    const ledgerEntries = [
      { partyCode: customerRec?.code || null, particular: `Rental for ${ecrNumber}`, narration: `Rental for ${ecrNumber}`, debitAmount: rentAmount, creditAmount: null, voucherRef: ecrNumber },
      { partyCode: null, particular: `Rental Income ${ecrNumber}`, narration: `Rental Income ${ecrNumber}`, debitAmount: null, creditAmount: rentAmount, voucherRef: ecrNumber },
    ];
    await postLedgerEntries(tx, returnDate, ledgerEntries, operatorId || null);
  }

  await createAuditLog(tx, {
    action: 'RETURN_CYLINDER',
    module: 'ecr',
    userId: performedBy || operatorId || null,
    entityId: String(createdEcr.id),
    oldValue: { cylinderStatus: holding.cylinder?.status, holdingStatus: holding.status },
    newValue: {
      cylinderStatus: 'IN_STOCK',
      holdingStatus: 'RETURNED',
      cylinderNumber: holding.cylinder?.cylinderNumber,
      ecrNumber,
    },
  });

  return createdEcr;
}

module.exports = {
  createHolding,
  returnCylinder,
  calculateHoldingRent,
  getHoldingQuantitySummary,
};
