const assert = require('assert');
const { validateHoldingRents, findOrphanedHoldings, auditBillToEcrMatching } = require('../src/services/reconciliationService');

async function testValidateHoldingRents() {
  const tx = {
    cylinderHolding: { findMany: async () => [ { id: 1, customerId: 2, rentAmount: 10, returnedAt: new Date('2026-04-05'), status: 'RETURNED', cylinder: { cylinderNumber: 'C001' }, issuedAt: new Date('2026-04-01') } ] },
    ecrRecord: { findMany: async () => [ { id: 5, customerId: 2, cylinderNumber: 'C001', rentAmount: 10, ecrDate: new Date('2026-04-05') } ] },
    companySetting: { findUnique: async () => null },
    bill: { findUnique: async () => null },
  };

  const res = await validateHoldingRents(tx);
  assert(res.summary);
  console.log('validateHoldingRents: OK');
}

async function testFindOrphanedHoldings() {
  const tx = {
    cylinderHolding: { findMany: async () => [ { id: 2, customerId: 3, issuedAt: new Date('2026-03-01'), status: 'HOLDING', cylinder: { cylinderNumber: 'C002', gasCode: 'OXY', ownerCode: 'COC' }, customer: { code: 'CUST1', name: 'Cust 1' } } ] },
    companySetting: { findUnique: async () => ({ value: '10' }) },
  };

  const res = await findOrphanedHoldings(tx);
  assert(Array.isArray(res));
  console.log('findOrphanedHoldings: OK');
}

async function testAuditBillToEcrMatching() {
  const tx = {
    bill: { findUnique: async ({ where }) => ({ id: where.id, billNumber: 'B001', items: [ { cylinderNumber: 'C001', quantityCum: 1 } ] }) },
    ecrRecord: { findMany: async () => [ { id: 10, issueNumber: 'B001', cylinderNumber: 'C001', quantityCum: 1 } ] },
  };

  const res = await auditBillToEcrMatching(tx, 1);
  assert.strictEqual(res.itemCount, 1);
  console.log('auditBillToEcrMatching: OK');
}

(async () => {
  try {
    await testValidateHoldingRents();
    await testFindOrphanedHoldings();
    await testAuditBillToEcrMatching();
    console.log('Reconciliation tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Reconciliation test failed', err);
    process.exit(1);
  }
})();
