const { round2 } = require('./businessRules');

const MOVEMENT_TYPES = {
  ISSUE: 'ISSUE',
  RETURN: 'RETURN',
  TRANSFER: 'TRANSFER',
  HYDRO_TESTED: 'HYDRO_TESTED',
  STATUS_CHANGE: 'STATUS_CHANGE',
};

async function recordCylinderMovement(tx, {
  cylinderId = null,
  customerId = null,
  holdingId = null,
  gasCode = null,
  ownerCode = null,
  movementType,
  movementDate = new Date(),
  quantityCyl = 1,
  quantityCum = null,
  statusBefore = null,
  statusAfter = null,
  referenceType = null,
  referenceNumber = null,
  operatorId = null,
} = {}) {
  if (!movementType) throw new Error('movementType is required');
  if (!cylinderId && !gasCode) throw new Error('cylinderId or gasCode is required');

  const safeQuantityCyl = Number.isInteger(quantityCyl) && quantityCyl >= 0 ? quantityCyl : 1;
  const safeQuantityCum = quantityCum == null ? null : round2(quantityCum);
  if (safeQuantityCum != null && safeQuantityCum < 0) throw new Error('quantityCum cannot be negative');

  return tx.cylinderMovement.create({
    data: {
      cylinderId: cylinderId || null,
      customerId: customerId || null,
      holdingId: holdingId || null,
      gasCode: gasCode || null,
      ownerCode: ownerCode || null,
      movementType,
      movementDate,
      quantityCyl: safeQuantityCyl,
      quantityCum: safeQuantityCum,
      statusBefore: statusBefore || null,
      statusAfter: statusAfter || null,
      referenceType: referenceType || null,
      referenceNumber: referenceNumber || null,
      operatorId: operatorId || null,
    },
  });
}

module.exports = {
  MOVEMENT_TYPES,
  recordCylinderMovement,
};
