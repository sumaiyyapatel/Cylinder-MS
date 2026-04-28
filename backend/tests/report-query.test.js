const assert = require('assert');
const {
  getHoldingStatementReport,
  getOutstandingReport,
  getTrialBalanceReport,
} = require('../src/services/reportQueryService');

async function testHoldingStatementUsesAsOfDate() {
  const prisma = {
    companySetting: { findUnique: async () => ({ value: '30' }) },
    cylinderHolding: {
      findMany: async () => [
        {
          issuedAt: new Date('2026-04-01T00:00:00Z'),
          customer: { code: 'C001', name: 'Customer 1' },
          cylinder: { cylinderNumber: 'CYL1', gasCode: 'OX', ownerCode: 'COC', capacity: 1 },
          transaction: { billNumber: 'B1', billDate: new Date('2026-04-01T00:00:00Z') },
        },
      ],
    },
  };

  const result = await getHoldingStatementReport(prisma, { asOfDate: '2026-04-11' });
  assert.strictEqual(result[0].cylinders[0].holdDays, 10);
}

async function testTrialBalanceKeepsNonPartyAccounts() {
  const prisma = {
    ledgerEntry: {
      findMany: async () => [
        { partyCode: 'C001', particular: 'Sales B1', transactionType: 'JOURNAL', debitAmount: 118, creditAmount: null },
        { partyCode: null, particular: 'Sales B1', transactionType: 'JOURNAL', debitAmount: null, creditAmount: 100 },
        { partyCode: null, particular: 'GST B1', transactionType: 'JOURNAL', debitAmount: null, creditAmount: 18 },
      ],
    },
    customer: {
      findMany: async () => [{ code: 'C001', name: 'Customer 1' }],
    },
  };

  const result = await getTrialBalanceReport(prisma, {});
  assert(result.some((row) => row.partyCode === 'C001' && row.debit === 118));
  assert(result.some((row) => row.partyName === 'Sales B1' && row.credit === 100));
  assert(result.some((row) => row.partyName === 'GST B1' && row.credit === 18));
}

async function testOutstandingUsesBillsEcrsAndPayments() {
  const prisma = {
    bill: {
      findMany: async () => [
        { id: 1, customerId: 10, totalAmount: 100, customer: { code: 'C001', name: 'Customer 1', phone: null } },
      ],
    },
    ecrRecord: {
      findMany: async () => [
        { id: 2, customerId: 10, rentAmount: 40, customer: { code: 'C001', name: 'Customer 1', phone: null } },
      ],
    },
    payment: {
      findMany: async () => [
        { customerId: 10, billId: 1, ecrId: null, amount: 25 },
        { customerId: 10, billId: null, ecrId: 2, amount: 10 },
      ],
    },
  };

  const result = await getOutstandingReport(prisma);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].balance, 105);
}

(async () => {
  try {
    await testHoldingStatementUsesAsOfDate();
    await testTrialBalanceKeepsNonPartyAccounts();
    await testOutstandingUsesBillsEcrsAndPayments();
    console.log('Report query tests passed');
  } catch (err) {
    console.error('Report query test failed:', err);
    process.exit(1);
  }
})();
