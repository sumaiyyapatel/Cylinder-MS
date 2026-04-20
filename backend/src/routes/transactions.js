const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const {
  isHydroTestOverdue,
  normalizeOwnerCode,
  round2,
  deriveNextHydroDueDate,
  getGstMode,
  calculateGstBreakup,
} = require('../services/businessRules');
const {
  generateBillNumber,
  generateSalesVoucherNumber,
} = require('../services/numberingService');
const { postLedgerEntries } = require('../services/ledgerPostingService');
const { updateCylinderStatus, assertNoActiveHolding } = require('../services/cylinderStatusService');
const { createAuditLog } = require('../services/auditService');
const { createHolding } = require('../services/cylinderHoldingService');
const invoiceService = require('../services/invoiceService');
const whatsappService = require('../services/whatsappService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
  validateGstRate,
} = require('../lib/validation');

const router = express.Router();

async function buildBillResponse(tx, bill, { salesBookEntry: salesBookEntryIn, companyGstin: companyGstinIn } = {}) {
  const salesBookEntry = salesBookEntryIn === undefined
    ? await tx.salesBook.findFirst({
        where: { billNumber: bill.billNumber },
        select: { billNumber: true, subtotal: true, gstAmount: true, totalAmount: true, gstCode: true, rate: true },
      })
    : salesBookEntryIn;

  const companyGstin = companyGstinIn === undefined
    ? (await tx.companySetting.findUnique({
        where: { key: 'company_gstin' },
        select: { value: true },
      }))?.value
    : companyGstinIn;

  const gstBreakup = salesBookEntry
    ? calculateGstBreakup(
        parseFloat(salesBookEntry.subtotal || 0),
        salesBookEntry.gstCode ? parseInt(salesBookEntry.gstCode.replace(/^[IS]/, ''), 10) : 0,
        bill.gstMode || getGstMode(companyGstin, bill.customer?.gstin)
      )
    : null;

  return {
    ...bill,
    salesBook: salesBookEntry,
    gstBreakup,
    companyGstin,
    hsnCode: bill.items?.[0]?.cylinder?.gasType?.hsnCode || null,
  };
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, gasCode, dateFrom, dateTo, page = 1, limit = 50 } = req.query;

  const where = {};

  if (customerId && !isNaN(parseInt(customerId, 10))) {
    where.customerId = parseInt(customerId, 10);
  }

  if (gasCode) where.gasCode = gasCode;

  if (dateFrom || dateTo) {
    where.billDate = {};

    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d)) where.billDate.gte = d;
    }

    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d)) {
        where.billDate.lte = new Date(`${dateTo}T23:59:59Z`);
      }
    }
  }

  // ✅ FIX: safe parsing
  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);

  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  const skip = (safePage - 1) * safeLimit;

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            gstin: true,
            address1: true,
            city: true
          }
        },
        items: {
          orderBy: [{ id: 'asc' }],
          include: {
            bill: { select: { id: true } },
            cylinder: {
              select: {
                gasCode: true,
                gasType: {
                  select: {
                    hsnCode: true,
                    gstRate: true
                  }
                }
              }
            }
          }
        }
      },
    }),
    prisma.bill.count({ where }),
  ]);

  const billNumbers = bills.map((b) => b.billNumber).filter(Boolean);

  const [salesBookEntries, companyGstinSetting] = await Promise.all([
    billNumbers.length
      ? prisma.salesBook.findMany({
          where: { billNumber: { in: billNumbers } },
          select: {
            billNumber: true,
            subtotal: true,
            gstAmount: true,
            totalAmount: true,
            gstCode: true,
            rate: true
          },
        })
      : Promise.resolve([]),
    prisma.companySetting.findUnique({
      where: { key: 'company_gstin' },
      select: { value: true }
    }),
  ]);

  const salesBookByBillNumber = new Map(
    salesBookEntries.map((e) => [e.billNumber, e])
  );

  const companyGstin = companyGstinSetting?.value ?? null;

  const enrichedBills = await Promise.all(
    bills.map((bill) =>
      buildBillResponse(prisma, bill, {
        salesBookEntry: salesBookByBillNumber.get(bill.billNumber) ?? null,
        companyGstin,
      })
    )
  );

  res.json({
    data: enrichedBills,
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
  });
}));

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
    return { cylinderNumber: number, quantityCum };
  });

  validateCylinderNumbersUnique(preparedCylinders.map((c) => c.cylinderNumber));

  const { createdBill, warnings } = await prisma.$transaction(async (tx) => {
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
        ownerCode: true,
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
        status: { in: ['HOLDING', 'BILLED'] },
      },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((h) => h.cylinderId));

    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedOwnerMismatch = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];

    const expectedOwner = normalizeOwnerCode(cylinderOwner || 'COC');
    for (const number of cylinderNumbers) {
      const cylinder = cylinderByNumber.get(number);
      if (!cylinder) continue;

      if (holdingCylinderIds.has(cylinder.id)) blockedWithCustomer.push(number);
      if (cylinder.status !== 'IN_STOCK') blockedNotInStock.push(number);
      if (normalizeOwnerCode(cylinder.ownerCode) !== expectedOwner) {
        blockedOwnerMismatch.push({ cylinderNumber: number, actualOwner: cylinder.ownerCode });
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
    if (blockedOwnerMismatch.length) {
      const first = blockedOwnerMismatch[0];
      throw new AppError(409, `Cylinder ${first.cylinderNumber} is owned by ${first.actualOwner}, not ${cylinderOwner || 'COC'}`);
    }

    const warnings = [];
    if (blockedMissingHydro.length) {
      warnings.push(`Hydro test data missing for cylinder(s): ${[...new Set(blockedMissingHydro)].join(', ')}`);
    }
    if (blockedHydroOverdue.length) {
      warnings.push(`Hydro test overdue for cylinder(s): ${[...new Set(blockedHydroOverdue)].join(', ')}`);
    }

    const billNumber = await generateBillNumber(tx, cylinderOwner || 'COC', effectiveBillDate);
    const rateConfig = await tx.rateList.findFirst({
      where: {
        gasCode: gasCode || dbCylinders[0]?.gasCode || undefined,
        ownerCode: cylinderOwner || 'COC',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const gstRate = rateConfig?.gstRate == null ? 0 : validateGstRate(rateConfig.gstRate, 'gstRate');
    const unitRate = Number(rateConfig?.ratePerUnit ?? 0);
    if (!Number.isFinite(unitRate) || unitRate < 0) {
      throw new AppError(400, 'Rate list has invalid unit rate');
    }

    const totalQuantity = round2(preparedCylinders.reduce((sum, item) => sum + (item.quantityCum || 0), 0));
    const taxableAmount = round2(totalQuantity * unitRate);
    const gstMode = getGstMode(companyGstinSetting?.value, customer.gstin);
    const tax = calculateGstBreakup(taxableAmount, gstRate, gstMode);

    const bill = await tx.bill.create({
      data: {
        billNumber,
        billDate: effectiveBillDate,
        customerId: customerIdNum,
        gasCode: gasCode || dbCylinders[0]?.gasCode || null,
        cylinderOwner: cylinderOwner || 'COC',
        orderNumber: orderNumber || null,
        transactionCode: transactionCode || 'ISSUE',
        totalCylinders: preparedCylinders.length,
        totalQuantity: totalQuantity || null,
        unitRate: unitRate || null,
        gstRate: round2(gstRate),
        gstMode,
        taxableAmount: round2(tax.taxableAmount),
        gstAmount: round2(tax.gstAmount),
        totalAmount: round2(tax.totalAmount),
        operatorId: req.user.sub,
      },
    });

    for (const item of preparedCylinders) {
      const cylinder = cylinderByNumber.get(item.cylinderNumber);
      await assertNoActiveHolding(tx, cylinder.id, cylinder.cylinderNumber);

      const txn = await tx.transaction.create({
        data: {
          billId: bill.id,
          billNumber,
          billDate: effectiveBillDate,
          customerId: customerIdNum,
          gasCode: gasCode || cylinder.gasCode || null,
          cylinderOwner: cylinderOwner || 'COC',
          cylinderNumber: item.cylinderNumber,
          quantityCum: round2(item.quantityCum || 0) || null,
          orderNumber: orderNumber || null,
          transactionCode: transactionCode || 'ISSUE',
          fullOrEmpty: 'F',
          operatorId: req.user.sub,
        },
      });

      await updateCylinderStatus(tx, cylinder.id, 'WITH_CUSTOMER', { incrementFillCount: true });
      const holding = await createHolding(tx, { cylinderId: cylinder.id, customerId: customerIdNum, transactionId: txn.id, issuedAt: effectiveBillDate, status: 'BILLED' });

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
    }

    const salesVoucher = await generateSalesVoucherNumber(tx, effectiveBillDate);
    await tx.salesBook.create({
      data: {
        voucherNumber: salesVoucher,
        voucherDate: effectiveBillDate,
        partyCode: customer.code,
        documentNumber: billNumber,
        quantityIssued: totalQuantity || null,
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

    const ledgerEntries = [
      {
        partyCode: customer.code,
        particular: `Sales Bill ${billNumber}`,
        narration: `Sales bill ${billNumber}`,
        debitAmount: round2(tax.totalAmount),
        creditAmount: null,
        voucherRef: billNumber,
      },
      {
        partyCode: null,
        particular: `Sales ${billNumber}`,
        narration: `Taxable amount for ${billNumber}`,
        debitAmount: null,
        creditAmount: round2(tax.taxableAmount),
        voucherRef: billNumber,
      },
    ];

    if (tax.gstAmount > 0) {
      ledgerEntries.push({
        partyCode: null,
        particular: `GST Output ${billNumber}`,
        narration: `GST output for ${billNumber}`,
        debitAmount: null,
        creditAmount: round2(tax.gstAmount),
        voucherRef: billNumber,
      });
    }

    await postLedgerEntries(tx, effectiveBillDate, ledgerEntries, req.user.sub, { transactionType: 'JOURNAL' });

    await createAuditLog(tx, {
      action: 'CREATE_BILL',
      module: 'transactions',
      userId: req.user.sub,
      entityId: String(bill.id),
      oldValue: null,
      newValue: {
        billNumber,
        customerId: customerIdNum,
        totalCylinders: preparedCylinders.length,
        totalAmount: round2(tax.totalAmount),
      },
    });

    const createdBill = await tx.bill.findUnique({
      where: { id: bill.id },
      include: {
        customer: { select: { id: true, code: true, name: true, phone: true, gstin: true, address1: true, city: true } },
        items: {
          orderBy: [{ id: 'asc' }],
          include: {
            cylinder: {
              select: {
                gasCode: true,
                gasType: { select: { hsnCode: true, gstRate: true } },
              },
            },
          },
        },
      },
    });

    return { createdBill, warnings };
  });

  const responseBill = await buildBillResponse(prisma, createdBill);
  res.status(201).json({
    message: 'Bill created',
    warnings,
    bill: responseBill,
  });

  // Fire-and-forget: generate PDF and send WhatsApp notification (if configured)
  (async () => {
    try {
      const pdfPath = await invoiceService.generateInvoicePdf(createdBill.id);
      // Public URL for the PDF endpoint
      const pdfUrl = `${req.protocol}://${req.get('host')}/api/bills/${createdBill.id}/pdf`;
      const sent = await whatsappService.sendBillNotification(createdBill.customerId, createdBill.billNumber, pdfUrl);
      if (sent) {
        await prisma.bill.update({ where: { id: createdBill.id }, data: { whatsappSent: true } });
      }
    } catch (err) {
      console.error('Post-bill notification failed:', err.message || err);
    }
  })();
}));

router.patch('/:id/whatsapp-sent', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    throw new AppError(400, 'Invalid bill id');
  }

  const bill = await prisma.bill.update({
    where: { id },
    data: { whatsappSent: true },
  });

  res.json({ message: 'WhatsApp marked sent', bill });
}));

router.get('/next-bill-number', authenticate, asyncHandler(async (req, res) => {
  const { ownerCode = 'COC' } = req.query;
  const billNumber = await generateBillNumber(prisma, ownerCode);
  res.json({ billNumber });
}));

module.exports = router;
