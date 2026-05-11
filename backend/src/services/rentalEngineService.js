const { calculateHoldDays, normalizeOwnerCode, isPocOwner, round2 } = require('./businessRules');
const { calculateRent, getEffectiveRate } = require('./rentalService');

async function computeCylinderRental(tx, {
  customerId,
  gasCode,
  ownerCode,
  issuedAt,
  returnedAt = new Date(),
} = {}) {
  const holdDays = calculateHoldDays(issuedAt, returnedAt);
  const effectiveOwner = normalizeOwnerCode(ownerCode);

  if (isPocOwner(effectiveOwner)) {
    return { holdDays, rentAmount: 0, ownerCode: effectiveOwner, policy: null };
  }

  const policy = await getEffectiveRate(tx, { customerId, gasCode, ownerCode: effectiveOwner });
  const rentAmount = round2(calculateRent(holdDays, policy));

  return { holdDays, rentAmount, ownerCode: effectiveOwner, policy };
}

module.exports = {
  computeCylinderRental,
};
