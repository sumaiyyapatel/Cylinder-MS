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

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Areas
  const areas = [
    { areaCode: 'B', areaName: 'Butibori' },
    { areaCode: 'K', areaName: 'Kamptee' },
    { areaCode: 'N', areaName: 'Nagpur' },
    { areaCode: 'W', areaName: 'Wardha' },
    { areaCode: 'C', areaName: 'Chandrapur' },
  ];
  for (const a of areas) {
    await prisma.area.upsert({ where: { areaCode: a.areaCode }, update: a, create: a });
  }
  console.log('Areas seeded');

  // Gas Types
  const gasTypes = [
    { gasCode: 'OX', name: 'Oxygen Gas', chemicalName: 'Oxygen', formula: 'O2', hsnCode: '28044090', gstRate: 12, itemCode: 'OX' },
    { gasCode: 'AR', name: 'Argon', chemicalName: 'Argon', formula: 'Ar', hsnCode: '28043000', gstRate: 12, itemCode: 'AR' },
    { gasCode: 'MO', name: 'Medical Oxygen', chemicalName: 'Medical Oxygen', formula: 'O2', hsnCode: '28044090', gstRate: 5, itemCode: 'MO' },
    { gasCode: 'N2', name: 'Nitrogen', chemicalName: 'Nitrogen', formula: 'N2', hsnCode: '28043000', gstRate: 12, itemCode: 'N2' },
    { gasCode: 'CO', name: 'Carbon Dioxide', chemicalName: 'Carbon Dioxide', formula: 'CO2', hsnCode: '28111900', gstRate: 12, itemCode: 'CO' },
  ];
  for (const g of gasTypes) {
    await prisma.gasType.upsert({ where: { gasCode: g.gasCode }, update: g, create: g });
  }
  console.log('Gas types seeded');

  // GST Rates
  const gstRates = [
    { gstCode: 'S01', gstName: 'GST @ 5%', rate: 5 },
    { gstCode: 'S02', gstName: 'GST @ 12%', rate: 12 },
    { gstCode: 'S03', gstName: 'GST @ 18%', rate: 18 },
    { gstCode: 'S09', gstName: 'GST @ 0% (Exempt)', rate: 0 },
  ];
  for (const g of gstRates) {
    await prisma.gstRate.upsert({ where: { gstCode: g.gstCode }, update: g, create: g });
  }
  console.log('GST rates seeded');

  // Users
  const users = [
    { username: 'admin', fullName: 'Administrator', role: 'ADMIN', password: 'Admin@123' },
    { username: 'operator', fullName: 'Operator User', role: 'OPERATOR', password: 'Operator@123' },
    { username: 'accounts', fullName: 'Accounts User', role: 'ACCOUNTANT', password: 'Accounts@123' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, role: u.role, passwordHash: hash },
      create: { username: u.username, fullName: u.fullName, role: u.role, passwordHash: hash },
    });
  }
  console.log('Users seeded');

  // Company Settings
  const settings = [
    { key: 'company_name', value: '[COMPANY NAME]' },
    { key: 'company_address', value: '[COMPANY ADDRESS]' },
    { key: 'company_city', value: '[CITY]' },
    { key: 'company_gstin', value: '[GSTIN PLACEHOLDER]' },
    { key: 'company_phone', value: '[PHONE]' },
    { key: 'overdue_threshold_days', value: '30' },
    { key: 'financial_year', value: '2025-26' },
  ];
  for (const s of settings) {
    await prisma.companySetting.upsert({ where: { key: s.key }, update: s, create: s });
  }
  console.log('Company settings seeded');

  // Sample Customers
  const customers = [
    { code: 'C0001', name: 'Nagpur Steel Works', title: 'M/s', address1: 'Plot 12, MIDC', city: 'Nagpur', pin: '440001', phone: '0712-2345678', areaCode: 'N', contactPerson: 'Ramesh Gupta' },
    { code: 'C0002', name: 'Wardha Auto Parts', title: 'M/s', address1: 'Industrial Estate', city: 'Wardha', pin: '442001', phone: '07152-234567', areaCode: 'W', contactPerson: 'Suresh Patil' },
    { code: 'C0003', name: 'City Hospital', title: 'Dr.', address1: 'Civil Lines', city: 'Nagpur', pin: '440001', phone: '0712-3456789', areaCode: 'N', contactPerson: 'Dr. Mehta' },
    { code: 'C0004', name: 'Butibori Fabricators', title: 'M/s', address1: 'Sector 5, MIDC Butibori', city: 'Nagpur', pin: '441108', phone: '0712-4567890', areaCode: 'B', contactPerson: 'Vijay Kumar' },
    { code: 'C0005', name: 'Kamptee Engineering', title: 'M/s', address1: 'Main Road', city: 'Kamptee', pin: '441002', phone: '07109-234567', areaCode: 'K', contactPerson: 'Aniket Joshi' },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({ where: { code: c.code }, update: c, create: c });
  }
  console.log('Customers seeded');

  // Sample Cylinders
  const cylinders = [
    { ownerCode: 'COC', cylinderNumber: 'COC-OX-001', particular: '47L Oxygen', capacity: 47, gasCode: 'OX', status: 'IN_STOCK' },
    { ownerCode: 'COC', cylinderNumber: 'COC-OX-002', particular: '47L Oxygen', capacity: 47, gasCode: 'OX', status: 'WITH_CUSTOMER' },
    { ownerCode: 'POC', cylinderNumber: 'POC-AR-001', particular: '47L Argon', capacity: 47, gasCode: 'AR', status: 'IN_STOCK' },
    { ownerCode: 'COC', cylinderNumber: 'COC-N2-001', particular: '47L Nitrogen', capacity: 47, gasCode: 'N2', status: 'IN_STOCK' },
    { ownerCode: 'COC', cylinderNumber: 'COC-MO-001', particular: '10L Medical O2', capacity: 10, gasCode: 'MO', status: 'WITH_CUSTOMER' },
    { ownerCode: 'POC', cylinderNumber: 'POC-CO-001', particular: '30L CO2', capacity: 30, gasCode: 'CO', status: 'DAMAGED' },
    { ownerCode: 'COC', cylinderNumber: 'COC-OX-003', particular: '47L Oxygen', capacity: 47, gasCode: 'OX', status: 'UNDER_TEST' },
    { ownerCode: 'COC', cylinderNumber: 'COC-OX-004', particular: '47L Oxygen', capacity: 47, gasCode: 'OX', status: 'IN_STOCK' },
  ];
  for (const c of cylinders) {
    await prisma.cylinder.upsert({ where: { cylinderNumber: c.cylinderNumber }, update: c, create: c });
  }
  console.log('Cylinders seeded');

  // Sample Rate List
  const rates = [
    { gasCode: 'OX', ownerCode: 'COC', cylinderType: '47L', ratePerUnit: 180, rentalFreeDays: 7, rentalRate1: 10, rentalDaysFrom1: 8, rentalDaysTo1: 15, rentalRate2: 15, rentalDaysFrom2: 16, rentalDaysTo2: 30, rentalRate3: 25, rentalDaysFrom3: 31, rentalDaysTo3: 999, gstRate: 12 },
    { gasCode: 'AR', ownerCode: 'POC', cylinderType: '47L', ratePerUnit: 350, rentalFreeDays: 7, rentalRate1: 15, rentalDaysFrom1: 8, rentalDaysTo1: 15, rentalRate2: 20, rentalDaysFrom2: 16, rentalDaysTo2: 30, rentalRate3: 30, rentalDaysFrom3: 31, rentalDaysTo3: 999, gstRate: 12 },
    { gasCode: 'MO', ownerCode: 'COC', cylinderType: '10L', ratePerUnit: 250, rentalFreeDays: 3, rentalRate1: 20, rentalDaysFrom1: 4, rentalDaysTo1: 10, rentalRate2: 30, rentalDaysFrom2: 11, rentalDaysTo2: 20, rentalRate3: 50, rentalDaysFrom3: 21, rentalDaysTo3: 999, gstRate: 5 },
  ];
  for (const r of rates) {
    const existing = await prisma.rateList.findFirst({ where: { gasCode: r.gasCode, ownerCode: r.ownerCode, cylinderType: r.cylinderType } });
    if (!existing) await prisma.rateList.create({ data: r });
  }
  console.log('Rate list seeded');

  // --- Additional mock data for transactions, holdings, challans, ecr, ledger, salesbook, orders, alerts ---
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });

  // Sample Transaction + SalesBook + LedgerEntry + Holding for COC-OX-001 -> C0001
  const cust1 = await prisma.customer.findUnique({ where: { code: 'C0001' } });
  const cyl1 = await prisma.cylinder.findUnique({ where: { cylinderNumber: 'COC-OX-001' } });
  if (cust1 && cyl1) {
    const billDate = new Date();
    const billNumber1 = await generateBillNumber(prisma, 'COC', billDate);
    const txn1 = await prisma.transaction.create({
      data: {
        billNumber: billNumber1,
        billDate,
        customerId: cust1.id,
        gasCode: cyl1.gasCode,
        cylinderOwner: cyl1.ownerCode,
        cylinderNumber: cyl1.cylinderNumber,
        quantityCum: cyl1.capacity || 0,
        transactionCode: 'ISSUE',
        fullOrEmpty: 'F',
        operatorId: adminUser?.id || null,
      },
    });

    const rate = await prisma.rateList.findFirst({ where: { gasCode: cyl1.gasCode, ownerCode: cyl1.ownerCode } });
    const unitRate = Number(rate?.ratePerUnit || 0);
    const subtotal = Math.round((Number(cyl1.capacity || 0) * unitRate) * 100) / 100;
    const gstRate = Number(rate?.gstRate || 0);
    const gstAmount = Math.round((subtotal * (gstRate / 100)) * 100) / 100;
    const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

    const salesVoucher = await generateSalesVoucherNumber(prisma, billDate);
    await prisma.salesBook.create({
      data: {
        voucherNumber: salesVoucher,
        voucherDate: billDate,
        partyCode: cust1.code,
        documentNumber: billNumber1,
        quantityIssued: cyl1.capacity || null,
        unit: 'CM',
        rate: unitRate || null,
        gstCode: gstRate ? `S${Math.round(gstRate)}` : null,
        subtotal,
        gstAmount,
        totalAmount,
        transactionCode: 'S',
        operatorId: adminUser?.id || null,
        billNumber: billNumber1,
      },
    });

    const ledgerVoucher = await generateLedgerVoucherNumber(prisma, 'JOURNAL', billDate);
    await prisma.ledgerEntry.create({
      data: {
        voucherNumber: ledgerVoucher,
        voucherDate: billDate,
        partyCode: cust1.code,
        particular: `Sales Bill ${billNumber1}`,
        narration: `Taxable ${subtotal}, GST ${gstAmount}`,
        debitAmount: totalAmount,
        creditAmount: null,
        transactionType: 'JOURNAL',
        voucherRef: billNumber1,
        operatorId: adminUser?.id || null,
      },
    });

    await prisma.cylinder.update({ where: { id: cyl1.id }, data: { status: 'WITH_CUSTOMER' } });
    const holding1 = await prisma.cylinderHolding.create({ data: { cylinderId: cyl1.id, customerId: cust1.id, transactionId: txn1.id, issuedAt: billDate, status: 'HOLDING' } });

    await prisma.auditLog.create({ data: { action: 'SEED_TXN', module: 'seed', userId: adminUser?.id || null, entityId: String(txn1.id), oldValue: null, newValue: { billNumber: billNumber1 } } });
  }

  // Create a challan linked to the transaction
  const challanDate = new Date();
  const someCust = await prisma.customer.findFirst();
  if (someCust) {
    const challanNumber = await generateChallanNumber(prisma, challanDate);
    await prisma.challan.create({ data: { challanNumber, challanDate, customerId: someCust.id, cylinderOwner: 'COC', cylindersCount: 1, quantityCum: 47, vehicleNumber: 'MH49-0001', transactionType: 'DELIVERY', operatorId: adminUser?.id || null } });
  }

  // Create an ECR (return) for a returned cylinder if a holding exists
  const someHolding = await prisma.cylinderHolding.findFirst({ where: { status: 'HOLDING' }, include: { cylinder: true } });
  if (someHolding) {
    const ecrDate = new Date();
    const ecrNumber = await generateEcrNumber(prisma, ecrDate);
    await prisma.ecrRecord.create({ data: {
      ecrNumber,
      ecrDate,
      customerId: someHolding.customerId,
      gasCode: someHolding.cylinder.gasCode,
      cylinderOwner: someHolding.cylinder.ownerCode,
      cylinderNumber: someHolding.cylinder.cylinderNumber,
      issueNumber: someHolding.transactionId ? (await prisma.transaction.findUnique({ where: { id: someHolding.transactionId }, select: { billNumber: true } })).billNumber : null,
      issueDate: someHolding.issuedAt,
      holdDays: 2,
      rentAmount: 0,
      challanNumber: null,
      challanDate: null,
      vehicleNumber: null,
      operatorId: adminUser?.id || null,
      quantityCum: someHolding.cylinder.capacity || null,
    } });
  }

  // Sample Order
  const anyCustomer = await prisma.customer.findFirst();
  if (anyCustomer) {
    await prisma.order.create({ data: { orderNumber: 'ORD-1001', orderDate: new Date(), customerId: anyCustomer.id, gasCode: 'OX', ownerCode: 'COC', quantityCum: 47, quantityCyl: 1, rate: 180, freightRate: 0, salesTaxRate: 12, status: 'ACTIVE', createdAt: new Date() } });
  }

  // Sample Alerts
  const cylForAlert = await prisma.cylinder.findFirst({ where: { status: 'IN_STOCK' } });
  if (cylForAlert) {
    await prisma.alert.create({ data: { type: 'LOW_STOCK', cylinderId: cylForAlert.id, message: `Low stock sample for ${cylForAlert.cylinderNumber}`, sentVia: 'SYSTEM' } });
  }


  console.log('Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
