require('dotenv').config({ override: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

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

  console.log('Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
