require('dotenv').config({ override: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const {
  generateBillNumber,
  generateSalesVoucherNumber,
  generateLedgerVoucherNumber,
  generateChallanNumber,
  generateEcrNumber,
} = require('../src/services/numberingService');
const { round2 } = require('../src/services/businessRules');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with realistic operational data...');

  // Users (keep minimal)
  const users = [
    { username: 'admin', fullName: 'Administrator', role: 'ADMIN', password: 'Admin@123' },
    { username: 'operator', fullName: 'Operator User', role: 'OPERATOR', password: 'Operator@123' },
    { username: 'accounts', fullName: 'Accounts User', role: 'ACCOUNTANT', password: 'Account@123' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, role: u.role, passwordHash: hash },
      create: { username: u.username, fullName: u.fullName, role: u.role, passwordHash: hash },
    });
  }

  // Company settings
  const settings = [
    { key: 'company_name', value: 'Patel & Company' },
    { key: 'company_address', value: 'MIDC Industrial Area' },
    { key: 'company_city', value: 'Nagpur' },
    { key: 'company_gstin', value: '27PATEL1234X1Z5' },
    { key: 'company_phone', value: '0712-1234567' },
    { key: 'overdue_threshold_days', value: '30' },
    { key: 'financial_year', value: '2025-26' },
  ];
  for (const s of settings) {
    await prisma.companySetting.upsert({ where: { key: s.key }, update: s, create: s });
  }

  // 1) Areas
  const areas = [
    { areaCode: 'NGP', areaName: 'Nagpur Central' },
    { areaCode: 'KMP', areaName: 'Kamptee Road' },
    { areaCode: 'ITW', areaName: 'Itwari' },
    { areaCode: 'MNC', areaName: 'Mankapur' },
    { areaCode: 'HNG', areaName: 'Hingna' },
  ];
  for (const a of areas) {
    await prisma.area.upsert({ where: { areaCode: a.areaCode }, update: a, create: a });
  }

  // 2) Gas types
  const gasTypes = [
    { gasCode: 'OXY', name: 'Oxygen', chemicalName: 'Oxygen', formula: 'O2', hsnCode: '28044090', gstRate: 12, itemCode: 'OXY' },
    { gasCode: 'N2', name: 'Nitrogen', chemicalName: 'Nitrogen', formula: 'N2', hsnCode: '28043000', gstRate: 12, itemCode: 'N2' },
    { gasCode: 'ARG', name: 'Argon', chemicalName: 'Argon', formula: 'Ar', hsnCode: '28043000', gstRate: 12, itemCode: 'ARG' },
    { gasCode: 'CO2', name: 'Carbon Dioxide', chemicalName: 'Carbon Dioxide', formula: 'CO2', hsnCode: '28111900', gstRate: 12, itemCode: 'CO2' },
  ];
  for (const g of gasTypes) await prisma.gasType.upsert({ where: { gasCode: g.gasCode }, update: g, create: g });

  // 3) Customers
  const customers = [
    { code: 'JGW01', name: 'Jubilee Glass Works Pvt Ltd', areaCode: 'NGP', phone: '9325357257', gstin: '27ABCDE1234F1Z5', contactPerson: 'Mr. Patel' },
    { code: 'MED01', name: 'City Care Hospital', areaCode: 'KMP', phone: '9370706868', gstin: '27PQRSX5678L1Z2', contactPerson: 'Dr. Singh' },
    { code: 'IND01', name: 'Sharma Engineering Works', areaCode: 'HNG', phone: '9876543210', gstin: '27LMNOP1234T1Z9', contactPerson: 'Ravi Sharma' },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({ where: { code: c.code }, update: c, create: c });
  }

  // 4) Cylinders (seed a few specific ones + bulk oxygen cylinders)
  const baseCylinders = [
    { cylinderNumber: 'OXY001', gasCode: 'OXY', ownerCode: 'COC', status: 'IN_STOCK', hydroTestDate: new Date('2024-01-10'), nextTestDue: new Date('2029-01-10'), particular: '47L Oxygen', capacity: 47 },
    { cylinderNumber: 'OXY002', gasCode: 'OXY', ownerCode: 'COC', status: 'IN_STOCK', hydroTestDate: new Date('2023-06-01'), nextTestDue: new Date('2028-06-01'), particular: '47L Oxygen', capacity: 47 },
    { cylinderNumber: 'N2001', gasCode: 'N2', ownerCode: 'POC', status: 'IN_STOCK', hydroTestDate: new Date('2021-03-01'), nextTestDue: new Date('2026-03-01'), particular: '47L Nitrogen', capacity: 47 },
    { cylinderNumber: 'ARG001', gasCode: 'ARG', ownerCode: 'COC', status: 'DAMAGED', hydroTestDate: new Date('2020-08-10'), nextTestDue: new Date('2025-08-10'), particular: '47L Argon', capacity: 47 },
  ];
  for (const c of baseCylinders) {
    await prisma.cylinder.upsert({ where: { cylinderNumber: c.cylinderNumber }, update: c, create: c });
  }

  // Bulk oxygen cylinders OXY003..OXY062 (60 items)
  const moreCylinders = Array.from({ length: 60 }, (_, i) => ({
    cylinderNumber: `OXY${String(i + 3).padStart(3, '0')}`,
    gasCode: 'OXY',
    ownerCode: i % 2 === 0 ? 'COC' : 'POC',
    status: 'IN_STOCK',
    particular: '47L Oxygen',
    capacity: 47,
  }));
  for (const c of moreCylinders) {
    await prisma.cylinder.upsert({ where: { cylinderNumber: c.cylinderNumber }, update: c, create: c });
  }

  // 5) Orders / Rate hints (create simple orders table entries)
  const orders = [
    { customerCode: 'JGW01', gasCode: 'OXY', rate: 120, freight: 20, gstPercent: 18 },
    { customerCode: 'MED01', gasCode: 'OXY', rate: 100, freight: 10, gstPercent: 12 },
  ];
  for (const o of orders) {
    const cust = await prisma.customer.findUnique({ where: { code: o.customerCode } });
    if (!cust) continue;
    const exists = await prisma.order.findFirst({ where: { customerId: cust.id, gasCode: o.gasCode } });
    if (!exists) {
      await prisma.order.create({ data: { orderNumber: `ORD-${Math.floor(1000 + Math.random() * 9000)}`, orderDate: new Date(), customerId: cust.id, gasCode: o.gasCode, ownerCode: 'COC', quantityCum: 47, quantityCyl: 1, rate: o.rate, freightRate: o.freight, salesTaxRate: o.gstPercent, status: 'ACTIVE' } });
    }
  }

  // 6) Rental config -> RateList entries (customer-specific where provided)
  const rentalRates = [
    {
      ownerCode: 'JGW01',
      gasCode: 'OXY',
      cylinderType: '47L',
      ratePerUnit: 120,
      rentalFreeDays: 7,
      rentalRate1: 5,
      rentalDaysFrom1: 1,
      rentalDaysTo1: 30,
      rentalRate2: 8,
      rentalDaysFrom2: 31,
      rentalDaysTo2: 60,
      rentalRate3: 12,
      rentalDaysFrom3: 61,
      rentalDaysTo3: 999,
      gstRate: 18,
    },
    {
      ownerCode: 'MED01',
      gasCode: 'OXY',
      cylinderType: '47L',
      ratePerUnit: 100,
      rentalFreeDays: 7,
      rentalRate1: 4,
      rentalDaysFrom1: 1,
      rentalDaysTo1: 30,
      rentalRate2: 6,
      rentalDaysFrom2: 31,
      rentalDaysTo2: 60,
      rentalRate3: 10,
      rentalDaysFrom3: 61,
      rentalDaysTo3: 999,
      gstRate: 12,
    },
    // Default company rate
    {
      ownerCode: 'COC',
      gasCode: 'OXY',
      cylinderType: '47L',
      ratePerUnit: 150,
      rentalFreeDays: 7,
      rentalRate1: 6,
      rentalDaysFrom1: 1,
      rentalDaysTo1: 30,
      rentalRate2: 9,
      rentalDaysFrom2: 31,
      rentalDaysTo2: 60,
      rentalRate3: 14,
      rentalDaysFrom3: 61,
      rentalDaysTo3: 999,
      gstRate: 12,
    },
  ];
  for (const r of rentalRates) {
    const existing = await prisma.rateList.findFirst({ where: { gasCode: r.gasCode, ownerCode: r.ownerCode, cylinderType: r.cylinderType } });
    if (!existing) await prisma.rateList.create({ data: r });
    else await prisma.rateList.update({ where: { id: existing.id }, data: r });
  }

  // 7) Transactions (create two sample bills + transactions)
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });

  // Helper to create a bill + transaction + holding
  async function issueCylinder({ customerCode, cylinderNumber, quantityCum = 1, billDate = new Date(), ownerCode = 'COC' }) {
    const customer = await prisma.customer.findUnique({ where: { code: customerCode } });
    const cylinder = await prisma.cylinder.findUnique({ where: { cylinderNumber } });
    if (!customer || !cylinder) return null;

    const billNumber = await generateBillNumber(prisma, ownerCode, billDate);
    const rate = await prisma.rateList.findFirst({ where: { gasCode: cylinder.gasCode, ownerCode: customerCode } })
      || await prisma.rateList.findFirst({ where: { gasCode: cylinder.gasCode, ownerCode } })
      || { ratePerUnit: 0, gstRate: 0 };

    const unitRate = Number(rate.ratePerUnit || 0);
    const taxable = round2(unitRate * Number(quantityCum || 0));
    const gstAmount = round2((taxable * (Number(rate.gstRate || 0) / 100)));
    const totalAmount = round2(taxable + gstAmount);

    const bill = await prisma.bill.create({ data: {
      billNumber,
      billDate,
      customerId: customer.id,
      gasCode: cylinder.gasCode,
      cylinderOwner: ownerCode,
      totalCylinders: 1,
      totalQuantity: quantityCum,
      unitRate: unitRate || null,
      gstRate: round2(rate.gstRate || 0),
      gstMode: 'INTRA',
      taxableAmount: taxable,
      gstAmount,
      totalAmount,
      operatorId: adminUser?.id || null,
    } });

    const txn = await prisma.transaction.create({ data: {
      billId: bill.id,
      billNumber: bill.billNumber,
      billDate: billDate,
      customerId: customer.id,
      gasCode: cylinder.gasCode,
      cylinderOwner: ownerCode,
      cylinderNumber: cylinder.cylinderNumber,
      quantityCum,
      transactionCode: 'ISSUE',
      fullOrEmpty: 'F',
      operatorId: adminUser?.id || null,
    } });

    await prisma.cylinder.update({ where: { id: cylinder.id }, data: { status: 'WITH_CUSTOMER' } });
    await prisma.cylinderHolding.create({ data: { cylinderId: cylinder.id, customerId: customer.id, transactionId: txn.id, issuedAt: billDate, status: 'HOLDING' } });

    return { bill, txn };
  }

  // Create sample transactions
  await issueCylinder({ customerCode: 'JGW01', cylinderNumber: 'OXY002', quantityCum: 7, billDate: new Date('2026-04-10') });
  // Ensure OXY003 exists before issuing
  if (!(await prisma.cylinder.findUnique({ where: { cylinderNumber: 'OXY003' } }))) {
    await prisma.cylinder.create({ data: { cylinderNumber: 'OXY003', gasCode: 'OXY', ownerCode: 'COC', status: 'IN_STOCK', particular: '47L Oxygen', capacity: 47 } });
  }
  await issueCylinder({ customerCode: 'MED01', cylinderNumber: 'OXY003', quantityCum: 7, billDate: new Date('2026-04-12') });

  // 8) Active holdings: ensure OXY002 is held by JGW01
  const jgw = await prisma.customer.findUnique({ where: { code: 'JGW01' } });
  const oxy2 = await prisma.cylinder.findUnique({ where: { cylinderNumber: 'OXY002' } });
  if (jgw && oxy2) {
    const existing = await prisma.cylinderHolding.findFirst({ where: { cylinderId: oxy2.id, customerId: jgw.id, status: 'HOLDING' } });
    if (!existing) {
      await prisma.cylinderHolding.create({ data: { cylinderId: oxy2.id, customerId: jgw.id, issuedAt: new Date('2026-04-10'), status: 'HOLDING' } });
    }
  }

  // 9) ECR returns: MED01 returns OXY003 (issue 2026-03-20 -> return 2026-04-15)
  const med = await prisma.customer.findUnique({ where: { code: 'MED01' } });
  const oxy3 = await prisma.cylinder.findUnique({ where: { cylinderNumber: 'OXY003' } });
  if (med && oxy3) {
    // find holding if exists, otherwise create synthetic holding with issueDate 2026-03-20
    let medHolding = await prisma.cylinderHolding.findFirst({ where: { cylinderId: oxy3.id, customerId: med.id } });
    if (!medHolding) {
      medHolding = await prisma.cylinderHolding.create({ data: { cylinderId: oxy3.id, customerId: med.id, issuedAt: new Date('2026-03-20'), status: 'HOLDING' } });
    }

    const returnDate = new Date('2026-04-15');
    const holdDays = 26; // as provided in your sample
    const rentAmount = 95; // as provided in your sample

    await prisma.cylinderHolding.update({ where: { id: medHolding.id }, data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' } });

    const ecrNumber = await generateEcrNumber(prisma, returnDate);
    await prisma.ecrRecord.create({ data: {
      ecrNumber,
      ecrDate: returnDate,
      customerId: med.id,
      gasCode: oxy3.gasCode,
      cylinderOwner: oxy3.ownerCode,
      cylinderNumber: oxy3.cylinderNumber,
      issueNumber: null,
      issueDate: medHolding.issuedAt,
      holdDays,
      rentAmount,
      challanNumber: null,
      challanDate: null,
      vehicleNumber: null,
      operatorId: adminUser?.id || null,
      quantityCum: 7,
    } });

    await prisma.cylinder.update({ where: { id: oxy3.id }, data: { status: 'IN_STOCK' } });
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
