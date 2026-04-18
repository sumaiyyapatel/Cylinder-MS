require('dotenv').config();
(async function(){
  const prisma = require('./src/lib/prisma');
  const { getOrGeneratePdf } = require('./src/services/invoiceService');
  try {
    const uniq = Date.now();
    const cust = await prisma.customer.create({ data: { code: 'TESTCUST-' + uniq, name: 'Test Customer ' + uniq } });
    const now = new Date();
    const billNumber = 'CA-TEST-' + uniq;
    const bill = await prisma.bill.create({ data: { billNumber: billNumber, billDate: now, customerId: cust.id, totalCylinders: 1, unitRate: 1000, taxableAmount: 1000, gstAmount: 180, totalAmount: 1180 } });
    await prisma.transaction.create({ data: { billId: bill.id, billNumber: bill.billNumber, billDate: bill.billDate, customerId: cust.id, cylinderNumber: 'CYL-TEST-001', quantityCum: 1 } });
    const p = await getOrGeneratePdf(bill.id);
    console.log('PDF_PATH=>', p);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await require('./src/lib/prisma').$disconnect();
  }
})();
