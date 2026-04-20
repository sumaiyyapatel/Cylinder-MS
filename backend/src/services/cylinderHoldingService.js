const { calculateHoldDays, normalizeOwnerCode, isPocOwner, round2 } = require('./businessRules');
const { calculateRent, getEffectiveRate } = require('./rentalService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { updateCylinderStatus } = require('./cylinderStatusService');
const { generateEcrNumber } = require('./numberingService');
const { createAuditLog } = require('./auditService');

/**
 * Create a holding record for a cylinder issue.
 * @param {object} tx - Prisma transaction client
 * @param {object} opts - { cylinderId, customerId, transactionId, issuedAt, status }
 */
async function createHolding(tx, { cylinderId, customerId, transactionId = null, issuedAt = new Date(), status = 'HOLDING' } = {}) {
  const holding = await tx.cylinderHolding.create({
    data: {
      cylinderId,
      customerId,
      transactionId: transactionId || null,
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

module.exports = { createHolding, returnCylinder, calculateHoldingRent };
