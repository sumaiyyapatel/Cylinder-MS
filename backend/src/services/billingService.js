const { AppError } = require('../middleware/errorHandler');
const {
  isHydroTestOverdue,
  normalizeOwnerCode,
  round2,
  deriveNextHydroDueDate,
  getGstMode,
  calculateGstBreakup,
} = require('./businessRules');
const { generateBillNumber, generateSalesVoucherNumber } = require('./numberingService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { buildIssueEntries } = require('./ledgerValidationService');
const { updateCylinderStatus, assertNoActiveHolding } = require('./cylinderStatusService');
const { createAuditLog } = require('./auditService');
const { createHolding } = require('./cylinderHoldingService');
const { MOVEMENT_TYPES, recordCylinderMovement } = require('./cylinderMovementService');
const { emitDomainEvent } = require('./domainEventService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
  validateGstRate,
} = require('../lib/validation');

function prepareSerializedBillInput(payload = {}) {
  const customerId = parseRequiredInt(payload.customerId, 'customerId');
  const billDate = parseDate(payload.billDate, 'billDate') || new Date();
  const cylinders = payload.cylinders;

  if (!Array.isArray(cylinders) || cylinders.length === 0) {
    throw new AppError(400, 'At least one cylinder is required');
  }

  const preparedCylinders = cylinders.map((cyl, index) => {
    const cylinderNumber = validateCylinderNumber(cyl?.cylinderNumber, `cylinders[${index}].cylinderNumber`);
    const quantityCum = parseOptionalNonNegativeNumber(cyl?.quantityCum, `cylinders[${index}].quantityCum`);
    if (!quantityCum || quantityCum <= 0) {
      throw new AppError(400, `cylinders[${index}].quantityCum must be greater than zero`);
    }
    return { cylinderNumber, quantityCum };
  });

  validateCylinderNumbersUnique(preparedCylinders.map((item) => item.cylinderNumber));

  return {
    customerId,
    billDate,
    gasCode: payload.gasCode || null,
    cylinderOwner: payload.cylinderOwner || 'COC',
    orderNumber: payload.orderNumber || null,
    transactionCode: payload.transactionCode || 'ISSUE',
    preparedCylinders,
  };
}

async function createSerializedIssueBill(db, payload = {}, { operatorId = null } = {}) {
  const input = prepareSerializedBillInput(payload);

  return db.$transaction(async (tx) => {
    const [customer, companyGstinSetting] = await Promise.all([
      tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, code: true, gstin: true, isActive: true },
      }),
      tx.companySetting.findUnique({ where: { key: 'company_gstin' } }),
    ]);

    if (!customer || !customer.isActive) {
      throw new AppError(404, 'Customer not found');
    }

    const cylinderNumbers = input.preparedCylinders.map((item) => item.cylinderNumber);
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
        gasType: { select: { hsnCode: true, gstRate: true } },
      },
    });

    const existingSet = new Set(dbCylinders.map((cylinder) => cylinder.cylinderNumber));
    const missingCylinders = cylinderNumbers.filter((number) => !existingSet.has(number));
    if (missingCylinders.length) {
      throw new AppError(400, `Cylinder(s) not found: ${missingCylinders.join(', ')}`);
    }

    const cylinderByNumber = new Map(dbCylinders.map((cylinder) => [cylinder.cylinderNumber, cylinder]));
    const holdingRecords = await tx.cylinderHolding.findMany({
      where: {
        cylinderId: { in: dbCylinders.map((cylinder) => cylinder.id) },
        status: { in: ['HOLDING', 'BILLED'] },
      },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((holding) => holding.cylinderId));

    const expectedOwner = normalizeOwnerCode(input.cylinderOwner);
    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedOwnerMismatch = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];

    for (const number of cylinderNumbers) {
      const cylinder = cylinderByNumber.get(number);
      if (!cylinder) continue;

      if (holdingCylinderIds.has(cylinder.id)) blockedWithCustomer.push(number);
      if (!['IN_STOCK', 'REFILLED'].includes(cylinder.status)) blockedNotInStock.push(number);
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

      if (isHydroTestOverdue({ ...cylinder, nextTestDue: derivedDue }, input.billDate)) {
        blockedHydroOverdue.push(number);
      }
    }

    if (blockedWithCustomer.length) {
      throw new AppError(409, `Cannot issue cylinder(s) already on active holding: ${[...new Set(blockedWithCustomer)].join(', ')}`);
    }
    if (blockedNotInStock.length) {
      throw new AppError(400, `Cylinder(s) must be IN_STOCK or REFILLED before issue: ${[...new Set(blockedNotInStock)].join(', ')}`);
    }
    if (blockedOwnerMismatch.length) {
      const first = blockedOwnerMismatch[0];
      throw new AppError(409, `Cylinder ${first.cylinderNumber} is owned by ${first.actualOwner}, not ${input.cylinderOwner}`);
    }

    const warnings = [];
    if (blockedMissingHydro.length) {
      warnings.push(`Hydro test data missing for cylinder(s): ${[...new Set(blockedMissingHydro)].join(', ')}`);
    }
    if (blockedHydroOverdue.length) {
      throw new AppError(400, `Hydro test overdue for cylinder(s): ${[...new Set(blockedHydroOverdue)].join(', ')}`);
    }

    const billNumber = await generateBillNumber(tx, input.cylinderOwner, input.billDate);
    const rateConfig = await tx.rateList.findFirst({
      where: {
        gasCode: input.gasCode || dbCylinders[0]?.gasCode || undefined,
        ownerCode: input.cylinderOwner,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const gstRate = rateConfig?.gstRate == null ? 0 : validateGstRate(rateConfig.gstRate, 'gstRate');
    const unitRate = Number(rateConfig?.ratePerUnit ?? 0);
    if (!Number.isFinite(unitRate) || unitRate < 0) {
      throw new AppError(400, 'Rate list has invalid unit rate');
    }
    if (!unitRate) {
      throw new AppError(400, `Rate not configured for ${input.gasCode || dbCylinders[0]?.gasCode || 'selected gas'} / ${input.cylinderOwner}`);
    }

    const totalQuantity = round2(input.preparedCylinders.reduce((sum, item) => sum + item.quantityCum, 0));
    const taxableAmount = round2(totalQuantity * unitRate);
    const gstMode = getGstMode(companyGstinSetting?.value, customer.gstin);
    const tax = calculateGstBreakup(taxableAmount, gstRate, gstMode);
    if (tax.totalAmount <= 0) {
      throw new AppError(400, 'Bill total must be greater than zero');
    }

    const bill = await tx.bill.create({
      data: {
        billNumber,
        billDate: input.billDate,
        customerId: input.customerId,
        gasCode: input.gasCode || dbCylinders[0]?.gasCode || null,
        cylinderOwner: input.cylinderOwner,
        orderNumber: input.orderNumber,
        transactionCode: input.transactionCode,
        totalCylinders: input.preparedCylinders.length,
        totalQuantity: totalQuantity || null,
        unitRate: unitRate || null,
        gstRate: round2(gstRate),
        gstMode,
        taxableAmount: round2(tax.taxableAmount),
        gstAmount: round2(tax.gstAmount),
        totalAmount: round2(tax.totalAmount),
        documentStatus: 'FINALIZED',
        finalizedAt: new Date(),
        operatorId,
      },
    });

    for (const item of input.preparedCylinders) {
      const cylinder = cylinderByNumber.get(item.cylinderNumber);
      await assertNoActiveHolding(tx, cylinder.id, cylinder.cylinderNumber);

      const lineTaxableAmount = round2(item.quantityCum * unitRate);
      const lineTax = calculateGstBreakup(lineTaxableAmount, gstRate, gstMode);
      const txn = await tx.transaction.create({
        data: {
          billId: bill.id,
          billNumber,
          billDate: input.billDate,
          customerId: input.customerId,
          gasCode: input.gasCode || cylinder.gasCode || null,
          cylinderOwner: input.cylinderOwner,
          cylinderNumber: item.cylinderNumber,
          quantityCum: round2(item.quantityCum) || null,
          unitRate: unitRate || null,
          taxableAmount: lineTaxableAmount || null,
          hsnCode: cylinder.gasType?.hsnCode || null,
          gstRate: round2(gstRate),
          gstAmount: round2(lineTax.gstAmount),
          cgstAmount: round2(lineTax.cgstAmount),
          sgstAmount: round2(lineTax.sgstAmount),
          igstAmount: round2(lineTax.igstAmount),
          orderNumber: input.orderNumber,
          transactionCode: input.transactionCode,
          fullOrEmpty: 'F',
          operatorId,
        },
      });

      await updateCylinderStatus(tx, cylinder.id, 'WITH_CUSTOMER', { incrementFillCount: true });
      const holding = await createHolding(tx, {
        cylinderId: cylinder.id,
        customerId: input.customerId,
        transactionId: txn.id,
        issuedAt: input.billDate,
        status: 'BILLED',
      });
      await recordCylinderMovement(tx, {
        cylinderId: cylinder.id,
        customerId: input.customerId,
        holdingId: holding.id,
        gasCode: cylinder.gasCode || input.gasCode || null,
        ownerCode: cylinder.ownerCode || input.cylinderOwner,
        movementType: MOVEMENT_TYPES.ISSUE,
        movementDate: input.billDate,
        quantityCum: item.quantityCum,
        statusBefore: cylinder.status,
        statusAfter: 'WITH_CUSTOMER',
        referenceType: 'BILL',
        referenceNumber: billNumber,
        operatorId,
      });

      await createAuditLog(tx, {
        action: 'ISSUE_CYLINDER',
        module: 'transactions',
        userId: operatorId,
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

    const salesVoucher = await generateSalesVoucherNumber(tx, input.billDate);
    await tx.salesBook.create({
      data: {
        voucherNumber: salesVoucher,
        voucherDate: input.billDate,
        partyCode: customer.code,
        documentNumber: billNumber,
        quantityIssued: totalQuantity || null,
        unit: 'CM',
        rate: unitRate || null,
        gstCode: gstRate ? `${gstMode === 'INTER' ? 'I' : 'S'}${Math.round(gstRate)}` : null,
        subtotal: round2(tax.taxableAmount),
        gstAmount: round2(tax.gstAmount),
        totalAmount: round2(tax.totalAmount),
        transactionCode: input.transactionCode || 'S',
        operatorId,
        billNumber,
      },
    });

    const ledgerEntries = buildIssueEntries({
      partyCode: customer.code,
      billNumber,
      totalAmount: tax.totalAmount,
      taxableAmount: tax.taxableAmount,
      gstAmount: tax.gstAmount,
      gstMode: tax.gstMode,
      cgstAmount: tax.cgstAmount,
      sgstAmount: tax.sgstAmount,
      igstAmount: tax.igstAmount,
    });

    await postLedgerEntries(tx, input.billDate, ledgerEntries, operatorId, {
      transactionType: 'JOURNAL',
    });

    await createAuditLog(tx, {
      action: 'CREATE_BILL',
      module: 'transactions',
      userId: operatorId,
      entityId: String(bill.id),
      oldValue: null,
      newValue: {
        billNumber,
        customerId: input.customerId,
        totalCylinders: input.preparedCylinders.length,
        totalAmount: round2(tax.totalAmount),
      },
    });
    await emitDomainEvent(tx, {
      eventType: 'BillFinalized',
      aggregateType: 'bill',
      aggregateId: bill.id,
      payload: { billNumber, customerId: input.customerId, totalAmount: round2(tax.totalAmount) },
      operatorId,
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
}

module.exports = {
  createSerializedIssueBill,
  prepareSerializedBillInput,
};
