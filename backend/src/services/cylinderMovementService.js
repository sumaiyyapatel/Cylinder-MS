const { round2 } = require('./businessRules');

const MOVEMENT_TYPES = {
  ISSUE: 'ISSUE',
  RETURN: 'RETURN',
  TRANSFER: 'TRANSFER',
  HYDRO_TESTED: 'HYDRO_TESTED',
  STATUS_CHANGE: 'STATUS_CHANGE',
};

async function recordCylinderMovement(tx, {
  cylinderId,
  customerId = null,
  holdingId = null,
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
  if (!cylinderId) return null;
  if (!movementType) throw new Error('movementType is required');

  return tx.cylinderMovement.create({
    data: {
      cylinderId,
      customerId: customerId || null,
      holdingId: holdingId || null,
      movementType,
      movementDate,
      quantityCyl: Number.isInteger(quantityCyl) && quantityCyl > 0 ? quantityCyl : 1,
      quantityCum: quantityCum == null ? null : round2(quantityCum),
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
