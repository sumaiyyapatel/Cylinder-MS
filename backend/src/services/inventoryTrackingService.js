const { AppError } = require('../middleware/errorHandler');
const { round2, normalizeOwnerCode } = require('./businessRules');

const TRACKING_MODES = {
  SERIALIZED: 'SERIALIZED',
  QUANTITY: 'QUANTITY',
};

function normalizeTrackingMode(value, fallback = TRACKING_MODES.SERIALIZED) {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized === TRACKING_MODES.QUANTITY ? TRACKING_MODES.QUANTITY : TRACKING_MODES.SERIALIZED;
}

function resolveTrackingMode({ explicitMode = null, hasCylinderRows = false, gasType = null } = {}) {
  if (explicitMode) return normalizeTrackingMode(explicitMode);
  if (gasType?.trackingMode) return normalizeTrackingMode(gasType.trackingMode);
  return hasCylinderRows ? TRACKING_MODES.SERIALIZED : TRACKING_MODES.QUANTITY;
}

function validateIssueTrackingShape({
  trackingMode,
  cylinderCount = 0,
  quantityCum = null,
  cylindersCount = 0,
  context = 'issue',
} = {}) {
  const mode = normalizeTrackingMode(trackingMode);
  const hasCylinderRows = Number(cylinderCount) > 0;
  const qty = quantityCum == null ? null : round2(quantityCum);

  if (mode === TRACKING_MODES.SERIALIZED) {
    if (!hasCylinderRows) {
      throw new AppError(400, `${context} requires cylinder numbers for serialized gas`);
    }
    if (cylindersCount && Number(cylindersCount) !== Number(cylinderCount)) {
      throw new AppError(400, `${context} cylindersCount must match serialized cylinder rows`);
    }
    return { trackingMode: mode, quantityCum: qty };
  }

  if (hasCylinderRows) {
    throw new AppError(400, `${context} cannot mix cylinder numbers with quantity-based gas`);
  }
  if (qty == null || qty <= 0) {
    throw new AppError(400, `${context} requires positive quantityCum for quantity-based gas`);
  }

  return { trackingMode: mode, quantityCum: qty };
}

function buildQuantityMovementPayload({
  customerId,
  gasCode,
  ownerCode,
  movementType,
  movementDate,
  quantityCum,
  cylindersCount = 0,
  referenceType,
  referenceNumber,
  operatorId,
} = {}) {
  return {
    cylinderId: null,
    customerId,
    gasCode,
    ownerCode: normalizeOwnerCode(ownerCode || 'COC'),
    movementType,
    movementDate,
    quantityCyl: Number.isInteger(cylindersCount) && cylindersCount > 0 ? cylindersCount : 0,
    quantityCum,
    referenceType,
    referenceNumber,
    operatorId,
  };
}

module.exports = {
  TRACKING_MODES,
  normalizeTrackingMode,
  resolveTrackingMode,
  validateIssueTrackingShape,
  buildQuantityMovementPayload,
};
