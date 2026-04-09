const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const {
  getFinancialYearCode,
  isHydroTestOverdue,
  round2,
  deriveNextHydroDueDate,
  getGstMode,
  calculateGstBreakup,
} = require('../services/businessRules');

const router = express.Router();

// Helper: generate bill number XX/YY/NNNNN
async function generateBillNumber(ownerCode, forDate = new Date()) {
  const series = ownerCode === 'COC' ? 'CA' : 'PA';
  const year = getFinancialYearCode(forDate);
  const prefix = `${series}/${year}/`;
  const last = await prisma.transaction.findFirst({
    where: { billNumber: { startsWith: prefix } },
    orderBy: { billNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.billNumber.split('/');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(5, '0')}`;
}

async function generateSalesVoucherNumber(forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  const prefix = `SB/${year}/`;
  const last = await prisma.salesBook.findFirst({
    where: { voucherNumber: { startsWith: prefix } },
    orderBy: { voucherNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.voucherNumber.split('/');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(5, '0')}`;
}

async function generateLedgerVoucherNumber(transactionType, forDate = new Date()) {
  const typeMap = {
    CASH_RECEIPT: 'CR',
    CASH_PAYMENT: 'CP',
    BANK_RECEIPT: 'BR',
    BANK_PAYMENT: 'BP',
    JOURNAL: 'JV',
    CONTRA: 'CT',
    DEBIT_NOTE: 'DN',
    CREDIT_NOTE: 'CN',
  };
  const year = getFinancialYearCode(forDate);
  const code = typeMap[transactionType] || 'JV';
  const prefix = `${code}/${year}/`;
  const last = await prisma.ledgerEntry.findFirst({
    where: { voucherNumber: { startsWith: prefix } },
    orderBy: { voucherNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.voucherNumber.split('/');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(5, '0')}`;
}

// GET /api/transactions
router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, gasCode, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId, 10);
    if (gasCode) where.gasCode = gasCode;
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(`${dateTo}T23:59:59Z`);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: { billDate: 'desc' },
        include: { customer: { select: { id: true, code: true, name: true, phone: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions (Bill Cum Challan)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const { customerId, gasCode, cylinderOwner, cylinders, billDate, orderNumber, transactionCode } = req.body;
    const effectiveBillDate = billDate ? new Date(billDate) : new Date();

    if (!customerId || !cylinders || !cylinders.length) {
      return res.status(400).json({ error: 'Customer and at least one cylinder required' });
    }

    const customerIdNum = parseInt(customerId, 10);
    const cylinderNumbers = cylinders
      .map((c) => (c.cylinderNumber || '').trim())
      .filter(Boolean);

    if (!cylinderNumbers.length) {
      return res.status(400).json({ error: 'At least one valid cylinder number required' });
    }

    const existingCylinders = await prisma.cylinder.findMany({
      where: { cylinderNumber: { in: cylinderNumbers } },
      select: {
        id: true,
        cylinderNumber: true,
        status: true,
        hydroTestDate: true,
        nextTestDue: true,
        gasCode: true,
      },
    });

    const existingSet = new Set(existingCylinders.map((c) => c.cylinderNumber));
    const cylinderByNumber = new Map(existingCylinders.map((c) => [c.cylinderNumber, c]));
    const missingCylinders = cylinderNumbers.filter((num) => !existingSet.has(num));

    if (missingCylinders.length) {
      return res.status(400).json({
        error: `Cylinder(s) not found: ${missingCylinders.join(', ')}`,
      });
    }

    const holdingRecords = await prisma.cylinderHolding.findMany({
      where: {
        cylinderId: { in: existingCylinders.map((c) => c.id) },
        status: 'HOLDING',
      },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((h) => h.cylinderId));

    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];
    const cylindersNeedingHydroDueUpdate = [];

    for (const num of cylinderNumbers) {
      const cylinder = cylinderByNumber.get(num);
      if (!cylinder) continue;

      if (cylinder.status === 'WITH_CUSTOMER' || holdingCylinderIds.has(cylinder.id)) {
        blockedWithCustomer.push(num);
      }

      if (cylinder.status !== 'IN_STOCK') {
        blockedNotInStock.push(num);
      }

      const derivedDue = deriveNextHydroDueDate(cylinder);
      if (!derivedDue) {
        blockedMissingHydro.push(num);
      } else {
        if (!cylinder.nextTestDue && cylinder.hydroTestDate) {
          cylindersNeedingHydroDueUpdate.push({ id: cylinder.id, dueDate: derivedDue });
        }
        if (isHydroTestOverdue({ ...cylinder, nextTestDue: derivedDue }, effectiveBillDate)) {
          blockedHydroOverdue.push(num);
        }
      }
    }

    if (blockedWithCustomer.length) {
      return res.status(400).json({
        error: `Cannot issue cylinder(s) already on active holding: ${[...new Set(blockedWithCustomer)].join(', ')}`,
      });
    }

    if (blockedNotInStock.length) {
      return res.status(400).json({
        error: `Cylinder(s) must be IN_STOCK before issue: ${[...new Set(blockedNotInStock)].join(', ')}`,
      });
    }

    if (blockedMissingHydro.length) {
      return res.status(400).json({
        error: `Hydro test data missing for cylinder(s): ${[...new Set(blockedMissingHydro)].join(', ')}`,
      });
    }

    if (blockedHydroOverdue.length) {
      return res.status(400).json({
        error: `Hydro test overdue for cylinder(s): ${[...new Set(blockedHydroOverdue)].join(', ')}`,
      });
    }

    if (cylindersNeedingHydroDueUpdate.length) {
      await Promise.all(
        cylindersNeedingHydroDueUpdate.map((item) =>
          prisma.cylinder.update({
            where: { id: item.id },
            data: { nextTestDue: item.dueDate },
          })
        )
      );
    }

    const [customer, companyGstinSetting] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerIdNum }, select: { id: true, code: true, gstin: true } }),
      prisma.companySetting.findUnique({ where: { key: 'company_gstin' } }),
    ]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const results = [];
    for (const cyl of cylinders) {
      if (!cyl.cylinderNumber) continue;

      const billNumber = await generateBillNumber(cylinderOwner || 'COC', effectiveBillDate);
      const cylinder = cylinderByNumber.get(cyl.cylinderNumber);
      const quantityCum = cyl.quantityCum ? round2(cyl.quantityCum) : 0;

      const rateConfig = await prisma.rateList.findFirst({
        where: {
          gasCode: gasCode || cylinder?.gasCode || undefined,
          ownerCode: cylinderOwner || 'COC',
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      const gstRate = Number(rateConfig?.gstRate ?? 0);
      const unitRate = Number(rateConfig?.ratePerUnit ?? 0);
      const taxableAmount = round2(quantityCum * unitRate);
      const gstMode = getGstMode(companyGstinSetting?.value, customer.gstin);
      const tax = calculateGstBreakup(taxableAmount, gstRate, gstMode);

      const txn = await prisma.transaction.create({
        data: {
          billNumber,
          billDate: effectiveBillDate,
          customerId: customerIdNum,
          gasCode,
          cylinderOwner: cylinderOwner || 'COC',
          cylinderNumber: cyl.cylinderNumber,
          quantityCum: quantityCum || null,
          orderNumber,
          transactionCode: transactionCode || 'ISSUE',
          fullOrEmpty: 'F',
          operatorId: req.user.sub,
        },
      });

      // Bill creates accounting entries; challan route intentionally does not.
      const salesVoucher = await generateSalesVoucherNumber(effectiveBillDate);
      await prisma.salesBook.create({
        data: {
          voucherNumber: salesVoucher,
          voucherDate: effectiveBillDate,
          partyCode: customer.code,
          documentNumber: billNumber,
          quantityIssued: quantityCum || null,
          unit: 'CM',
          rate: unitRate || null,
          gstCode: gstRate ? `${gstMode === 'INTER' ? 'I' : 'S'}${Math.round(gstRate)}` : null,
          subtotal: round2(tax.taxableAmount),
          gstAmount: round2(tax.gstAmount),
          totalAmount: round2(tax.totalAmount),
          transactionCode: transactionCode || 'S',
          operatorId: req.user.sub,
          billNumber,
        },
      });

      const ledgerVoucher = await generateLedgerVoucherNumber('JOURNAL', effectiveBillDate);
      await prisma.ledgerEntry.create({
        data: {
          voucherNumber: ledgerVoucher,
          voucherDate: effectiveBillDate,
          partyCode: customer.code,
          particular: `Sales Bill ${billNumber}`,
          narration: `Taxable ${tax.taxableAmount}, GST ${tax.gstAmount} (${gstMode})`,
          debitAmount: round2(tax.totalAmount),
          creditAmount: null,
          transactionType: 'JOURNAL',
          voucherRef: billNumber,
          operatorId: req.user.sub,
        },
      });

      if (cyl.cylinderNumber && cylinder) {
        await prisma.cylinder.update({
          where: { id: cylinder.id },
          data: { status: 'WITH_CUSTOMER', fillCount: { increment: 1 } },
        });

        await prisma.cylinderHolding.create({
          data: {
            cylinderId: cylinder.id,
            customerId: customerIdNum,
            transactionId: txn.id,
            issuedAt: effectiveBillDate,
            status: 'HOLDING',
          },
        });
      }

      results.push({
        ...txn,
        gstMode,
        gstRate: round2(gstRate),
        taxableAmount: round2(tax.taxableAmount),
        gstAmount: round2(tax.gstAmount),
        totalAmount: round2(tax.totalAmount),
      });
    }

    res.status(201).json({ message: `${results.length} transaction(s) created`, transactions: results });
  } catch (err) {
    console.error('Transaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/next-bill-number
router.get('/next-bill-number', authenticate, async (req, res) => {
  try {
    const { ownerCode = 'COC' } = req.query;
    const billNumber = await generateBillNumber(ownerCode);
    res.json({ billNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
