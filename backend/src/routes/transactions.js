const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const {
  isHydroTestOverdue,
  round2,
  deriveNextHydroDueDate,
  getGstMode,
  calculateGstBreakup,
} = require('../services/businessRules');
const {
  generateBillNumber,
  generateSalesVoucherNumber,
  generateLedgerVoucherNumber,
} = require('../services/numberingService');
const { updateCylinderStatus, assertNoActiveHolding } = require('../services/cylinderStatusService');
const { createAuditLog } = require('../services/auditService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
  validateGstRate,
} = require('../lib/validation');

const router = express.Router();

// GET /api/transactions
router.get('/', authenticate, asyncHandler(async (req, res) => {
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
      include: { 
        customer: { select: { id: true, code: true, name: true, phone: true, gstin: true } },
        cylinder: { select: { gasCode: true }, include: { gasType: { select: { hsnCode: true, gstRate: true } } } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  // Enrich transactions with GST data from sales book
  const enrichedTransactions = await Promise.all(
    transactions.map(async (txn) => {
      const salesBookEntry = await prisma.salesBook.findFirst({
        where: { billNumber: txn.billNumber },
        select: { subtotal: true, gstAmount: true, totalAmount: true, gstCode: true, rate: true },
      });

      // Get company GSTIN
      const companyGstinSetting = await prisma.companySetting.findUnique({
        where: { key: 'company_gstin' },
        select: { value: true },
      });

      let gstBreakup = null;
      if (salesBookEntry && salesBookEntry.subtotal && salesBookEntry.gstAmount) {
        const gstMode = getGstMode(companyGstinSetting?.value, txn.customer.gstin);
        const gstRate = salesBookEntry.gstCode ? parseInt(salesBookEntry.gstCode.replace(/^[IS]/, '')) : 0;
        
        gstBreakup = calculateGstBreakup(
          parseFloat(salesBookEntry.subtotal),
          gstRate,
          gstMode
        );
      }

      return {
        ...txn,
        salesBook: salesBookEntry,
        gstBreakup,
        companyGstin: companyGstinSetting?.value,
        hsnCode: txn.cylinder?.gasType?.hsnCode,
      };
    })
  );

  res.json({
    data: enrichedTransactions,
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / parseInt(limit, 10)),
  });
}));

// POST /api/transactions (Bill Cum Challan)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const { customerId, gasCode, cylinderOwner, cylinders, billDate, orderNumber, transactionCode } = req.body;
  const customerIdNum = parseRequiredInt(customerId, 'customerId');
  const effectiveBillDate = parseDate(billDate, 'billDate') || new Date();

  if (!Array.isArray(cylinders) || cylinders.length === 0) {
    throw new AppError(400, 'At least one cylinder is required');
  }

  const preparedCylinders = cylinders.map((cyl, index) => {
    const number = validateCylinderNumber(cyl?.cylinderNumber, `cylinders[${index}].cylinderNumber`);
    const quantityCum = parseOptionalNonNegativeNumber(cyl?.quantityCum, `cylinders[${index}].quantityCum`);
    return {
      cylinderNumber: number,
      quantityCum,
    };
  });

  validateCylinderNumbersUnique(preparedCylinders.map((c) => c.cylinderNumber));

  const { created, warnings } = await prisma.$transaction(async (tx) => {
    const [customer, companyGstinSetting] = await Promise.all([
      tx.customer.findUnique({
        where: { id: customerIdNum },
        select: { id: true, code: true, gstin: true, isActive: true },
      }),
      tx.companySetting.findUnique({ where: { key: 'company_gstin' } }),
    ]);

    if (!customer || !customer.isActive) {
      throw new AppError(404, 'Customer not found');
    }

    const cylinderNumbers = preparedCylinders.map((c) => c.cylinderNumber);
    const dbCylinders = await tx.cylinder.findMany({
      where: { cylinderNumber: { in: cylinderNumbers }, isActive: true },
      select: {
        id: true,
        cylinderNumber: true,
        status: true,
        hydroTestDate: true,
        nextTestDue: true,
        gasCode: true,
      },
    });

    const existingSet = new Set(dbCylinders.map((c) => c.cylinderNumber));
    const missingCylinders = cylinderNumbers.filter((num) => !existingSet.has(num));
    if (missingCylinders.length) {
      throw new AppError(400, `Cylinder(s) not found: ${missingCylinders.join(', ')}`);
    }

    const cylinderByNumber = new Map(dbCylinders.map((c) => [c.cylinderNumber, c]));
    const holdingRecords = await tx.cylinderHolding.findMany({
      where: {
        cylinderId: { in: dbCylinders.map((c) => c.id) },
        status: 'HOLDING',
      },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((h) => h.cylinderId));

    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];

    for (const number of cylinderNumbers) {
      const cylinder = cylinderByNumber.get(number);
      if (!cylinder) continue;

      if (holdingCylinderIds.has(cylinder.id)) {
        blockedWithCustomer.push(number);
      }

      if (cylinder.status !== 'IN_STOCK') {
        blockedNotInStock.push(number);
      }

      const derivedDue = deriveNextHydroDueDate(cylinder);
      if (!derivedDue) {
        blockedMissingHydro.push(number);
        continue;
      }

      if (!cylinder.nextTestDue && cylinder.hydroTestDate) {
        await tx.cylinder.update({
          where: { id: cylinder.id },
          data: { nextTestDue: derivedDue },
        });
      }

      if (isHydroTestOverdue({ ...cylinder, nextTestDue: derivedDue }, effectiveBillDate)) {
        blockedHydroOverdue.push(number);
      }
    }

    if (blockedWithCustomer.length) {
      throw new AppError(409, `Cannot issue cylinder(s) already on active holding: ${[...new Set(blockedWithCustomer)].join(', ')}`);
    }
    if (blockedNotInStock.length) {
      throw new AppError(400, `Cylinder(s) must be IN_STOCK before issue: ${[...new Set(blockedNotInStock)].join(', ')}`);
    }
    const warnings = [];
    if (blockedMissingHydro.length) {
      warnings.push(`Hydro test data missing for cylinder(s): ${[...new Set(blockedMissingHydro)].join(', ')}`);
    }
    if (blockedHydroOverdue.length) {
      warnings.push(`Hydro test overdue for cylinder(s): ${[...new Set(blockedHydroOverdue)].join(', ')}`);
    }

    const created = [];

    for (const item of preparedCylinders) {
      const cylinder = cylinderByNumber.get(item.cylinderNumber);
      await assertNoActiveHolding(tx, cylinder.id, cylinder.cylinderNumber);

      const billNumber = await generateBillNumber(tx, cylinderOwner || 'COC', effectiveBillDate);
      const quantityCum = round2(item.quantityCum || 0);
      const rateConfig = await tx.rateList.findFirst({
        where: {
          gasCode: gasCode || cylinder.gasCode || undefined,
          ownerCode: cylinderOwner || 'COC',
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      const gstRate = rateConfig?.gstRate == null ? 0 : validateGstRate(rateConfig.gstRate, 'gstRate');
      const unitRate = Number(rateConfig?.ratePerUnit ?? 0);
      if (!Number.isFinite(unitRate) || unitRate < 0) {
        throw new AppError(400, 'Rate list has invalid unit rate');
      }

      const taxableAmount = round2(quantityCum * unitRate);
      const gstMode = getGstMode(companyGstinSetting?.value, customer.gstin);
      const tax = calculateGstBreakup(taxableAmount, gstRate, gstMode);

      const txn = await tx.transaction.create({
        data: {
          billNumber,
          billDate: effectiveBillDate,
          customerId: customerIdNum,
          gasCode,
          cylinderOwner: cylinderOwner || 'COC',
          cylinderNumber: item.cylinderNumber,
          quantityCum: quantityCum || null,
          orderNumber,
          transactionCode: transactionCode || 'ISSUE',
          fullOrEmpty: 'F',
          operatorId: req.user.sub,
        },
      });

      const salesVoucher = await generateSalesVoucherNumber(tx, effectiveBillDate);
      await tx.salesBook.create({
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

      const ledgerVoucher = await generateLedgerVoucherNumber(tx, 'JOURNAL', effectiveBillDate);
      await tx.ledgerEntry.create({
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

      await updateCylinderStatus(tx, cylinder.id, 'WITH_CUSTOMER', { incrementFillCount: true });
      const holding = await tx.cylinderHolding.create({
        data: {
          cylinderId: cylinder.id,
          customerId: customerIdNum,
          transactionId: txn.id,
          issuedAt: effectiveBillDate,
          status: 'HOLDING',
        },
      });

      await createAuditLog(tx, {
        action: 'ISSUE_CYLINDER',
        module: 'transactions',
        userId: req.user.sub,
        entityId: String(txn.id),
        oldValue: { cylinderStatus: cylinder.status },
        newValue: {
          cylinderStatus: 'WITH_CUSTOMER',
          holdingId: holding.id,
          billNumber,
          cylinderNumber: item.cylinderNumber,
        },
      });

      created.push({
        ...txn,
        gstMode,
        gstRate: round2(gstRate),
        taxableAmount: round2(tax.taxableAmount),
        gstAmount: round2(tax.gstAmount),
        totalAmount: round2(tax.totalAmount),
      });
    }

    return { created, warnings };
  });

  res.status(201).json({ message: `${created.length} transaction(s) created`, warnings, transactions: created });
}));

// PATCH /api/transactions/:id/whatsapp-sent
router.patch('/:id/whatsapp-sent', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    throw new AppError(400, 'Invalid transaction id');
  }

  const transaction = await prisma.transaction.update({
    where: { id },
    data: { whatsappSent: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  res.json({ message: 'WhatsApp marked sent', transaction });
}));

// GET /api/transactions/next-bill-number
router.get('/next-bill-number', authenticate, asyncHandler(async (req, res) => {
  const { ownerCode = 'COC' } = req.query;
  const billNumber = await generateBillNumber(prisma, ownerCode);
  res.json({ billNumber });
}));

module.exports = router;
