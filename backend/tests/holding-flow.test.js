const assert = require('assert');
const { createHolding, calculateHoldingRent } = require('../src/services/cylinderHoldingService');

async function testCreateHolding() {
  const tx = {
    cylinderHolding: {
      create: async ({ data }) => ({ id: 101, ...data }),
    },
  };
  const issuedAt = new Date('2026-04-01T00:00:00Z');
  const result = await createHolding(tx, { cylinderId: 5, customerId: 7, transactionId: 9, issuedAt });
  assert.strictEqual(result.id, 101);
  assert.strictEqual(result.cylinderId, 5);
  assert.strictEqual(result.customerId, 7);
  assert.strictEqual(+new Date(result.issuedAt), +new Date(issuedAt));
  console.log('createHolding: OK');
}

async function testCalculateHoldingRent() {
  const issueDate = new Date('2026-04-01T00:00:00Z');
  const returnDate = new Date('2026-04-11T00:00:00Z'); // 10 days
  const tx = {
    cylinderHolding: {
      findUnique: async ({ where, include }) => ({ id: where.id, customerId: null, issuedAt: issueDate, cylinder: { id: 5, ownerCode: 'COC', gasCode: 'OXY' } }),
    },
    rateList: {
      findFirst: async () => ({ rentalFreeDays: 0, rentalRate1: 10, rentalDaysFrom1: 1, rentalDaysTo1: 15 }),
    },
    customer: { findUnique: async () => null },
  };

  const res = await calculateHoldingRent(tx, { holdingId: 1, returnDate });
  assert.strictEqual(res.holdDays, 10);
  assert.strictEqual(res.rentAmount, 100);
  console.log('calculateHoldingRent: OK');
}

(async () => {
  try {
    await testCreateHolding();
    await testCalculateHoldingRent();
    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
