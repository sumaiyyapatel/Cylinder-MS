const { AppError } = require('../middleware/errorHandler');
const { round2, deriveNextHydroDueDate, isHydroTestOverdue, getGstMode, calculateGstBreakup, normalizeOwnerCode } = require('./businessRules');
const { generateChallanNumber, generateBillNumber, generateSalesVoucherNumber } = require('./numberingService');
const { createAuditLog } = require('./auditService');
const { updateCylinderStatus, assertNoActiveHolding } = require('./cylinderStatusService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { buildIssueEntries } = require('./ledgerValidationService');

async function createChallan(tx, opts = {}) {
  const {
    customerId,
    challanDate = new Date(),
    quantityCum,
    cylindersCount = 0,
    linkedBillId = null,
    cylinderOwner = null,
    vehicleNumber = null,
    transactionType = 'DELIVERY',
    operatorId = null,
    preparedCylinders = [],
    gasCode = null,
  } = opts;

  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, code: true, isActive: true } });
  if (!customer || !customer.isActive) throw new AppError(404, 'Customer not found');

  const challanNumber = await generateChallanNumber(tx, challanDate);
  const created = await tx.challan.create({
    data: {
      challanNumber,
      challanDate,
      customerId,
      gasCode,
      cylinderOwner,
      cylindersCount,
      quantityCum: quantityCum == null ? null : round2(quantityCum),
      vehicleNumber,
      transactionType,
      status: linkedBillId ? 'BILLED' : 'OPEN',
      linkedBillId,
      operatorId,
    },
  });

  if (preparedCylinders && preparedCylinders.length > 0) {
    const cylinderNumbers = preparedCylinders.map((c) => c.cylinderNumber);
    const dbCylinders = await tx.cylinder.findMany({
      where: { cylinderNumber: { in: cylinderNumbers }, isActive: true },
      select: { id: true, cylinderNumber: true, status: true, hydroTestDate: true, nextTestDue: true, gasCode: true, ownerCode: true },
    });

    const existingSet = new Set(dbCylinders.map((c) => c.cylinderNumber));
    const missingCylinders = cylinderNumbers.filter((num) => !existingSet.has(num));
    if (missingCylinders.length) {
      throw new AppError(400, `Cylinder(s) not found: ${missingCylinders.join(', ')}`);
    }

    const holdingRecords = await tx.cylinderHolding.findMany({
      where: { cylinderId: { in: dbCylinders.map((c) => c.id) }, status: { in: ['HOLDING', 'BILLED'] } },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((h) => h.cylinderId));

    const expectedOwner = normalizeOwnerCode(cylinderOwner || 'COC');
    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedOwnerMismatch = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];

    for (const dbCyl of dbCylinders) {
      if (holdingCylinderIds.has(dbCyl.id)) blockedWithCustomer.push(dbCyl.cylinderNumber);
      if (dbCyl.status !== 'IN_STOCK') blockedNotInStock.push(dbCyl.cylinderNumber);
      if (normalizeOwnerCode(dbCyl.ownerCode) !== expectedOwner) {
        blockedOwnerMismatch.push({ cylinderNumber: dbCyl.cylinderNumber, actualOwner: dbCyl.ownerCode });
      }

      const derivedDue = deriveNextHydroDueDate(dbCyl);
      if (!derivedDue) {
        blockedMissingHydro.push(dbCyl.cylinderNumber);
        continue;
      }

      if (!dbCyl.nextTestDue && dbCyl.hydroTestDate) {
        await tx.cylinder.update({ where: { id: dbCyl.id }, data: { nextTestDue: derivedDue } });
      }

      if (isHydroTestOverdue({ ...dbCyl, nextTestDue: derivedDue }, challanDate)) {
        blockedHydroOverdue.push(dbCyl.cylinderNumber);
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
    if (blockedMissingHydro.length) {
      throw new AppError(400, `Hydro test data missing for cylinder(s): ${[...new Set(blockedMissingHydro)].join(', ')}`);
    }
    if (blockedHydroOverdue.length) {
      throw new AppError(400, `Hydro test overdue for cylinder(s): ${[...new Set(blockedHydroOverdue)].join(', ')}`);
    }

    for (const num of cylinderNumbers) {
      const cylinder = dbCylinders.find((d) => d.cylinderNumber === num);
      await assertNoActiveHolding(tx, cylinder.id, cylinder.cylinderNumber);

      await updateCylinderStatus(tx, cylinder.id, 'WITH_CUSTOMER', { incrementFillCount: false });

      const holding = await tx.cylinderHolding.create({
        data: { cylinderId: cylinder.id, customerId, challanId: created.id, issuedAt: challanDate, status: 'HOLDING' },
      });

      await createAuditLog(tx, {
        action: 'ISSUE_CYLINDER',
        module: 'challans',
        userId: operatorId,
        entityId: String(created.id),
        oldValue: { cylinderStatus: cylinder.status },
        newValue: { cylinderStatus: 'WITH_CUSTOMER', holdingId: holding.id, cylinderNumber: cylinder.cylinderNumber },
      });
    }
  }

  await createAuditLog(tx, {
    action: 'CREATE_CHALLAN',
    module: 'challans',
    userId: operatorId,
    entityId: String(created.id),
    oldValue: null,
    newValue: { challanNumber: created.challanNumber, customerId: created.customerId },
  });

  return created;
}

/**
 * Convert an OPEN challan to a bill.
 * Prevents duplicate conversion — throws if challan is already BILLED.
 * Creates Bill + Transaction line items, Sales Book entry, Ledger entries.
 * Links challan.linkedBillId → bill.id and sets status = 'BILLED'.
 */
async function convertChallanToBill(tx, challanId, operatorId = null) {
  const challan = await tx.challan.findUnique({
    where: { id: challanId },
    include: {
      customer: { select: { id: true, code: true, gstin: true, isActive: true } },
      holdings: {
        where: { status: { in: ['HOLDING', 'BILLED'] } },
        include: { cylinder: true },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!challan) throw new AppError(404, 'Challan not found');
  if (challan.status === 'BILLED') throw new AppError(409, 'Challan is already converted to a bill');
  if (challan.linkedBillId) throw new AppError(409, 'Challan already linked to a bill');
  if (!challan.holdings.length) throw new AppError(400, 'Challan has no active cylinder holdings to bill');

  const customer = challan.customer;
  if (!customer || !customer.isActive) throw new AppError(400, 'Customer is inactive');

  // Fetch company GSTIN for GST mode determination
  const companyGstinSetting = await tx.companySetting.findUnique({ where: { key: 'company_gstin' } });

  // Fetch rate config
  const rateConfig = await tx.rateList.findFirst({
    where: {
      gasCode: challan.gasCode || undefined,
      ownerCode: challan.cylinderOwner || 'COC',
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  const gstRate = rateConfig?.gstRate == null ? 0 : Number(rateConfig.gstRate);
  const unitRate = Number(rateConfig?.ratePerUnit ?? 0);
  const totalQuantity = round2(Number(challan.quantityCum || 0));
  const taxableAmount = round2(totalQuantity * unitRate);
  const gstMode = getGstMode(companyGstinSetting?.value, customer.gstin);
  const tax = calculateGstBreakup(taxableAmount, gstRate, gstMode);

  const billNumber = await generateBillNumber(tx, challan.cylinderOwner || 'COC', challan.challanDate);

  // Create Bill
  const bill = await tx.bill.create({
    data: {
      billNumber,
      billDate: challan.challanDate,
      customerId: challan.customerId,
      gasCode: challan.gasCode || null,
      cylinderOwner: challan.cylinderOwner || 'COC',
      transactionCode: challan.transactionType || 'ISSUE',
      totalCylinders: challan.cylindersCount || 0,
      totalQuantity: totalQuantity || null,
      unitRate: unitRate || null,
      gstRate: round2(gstRate),
      gstMode,
      taxableAmount: round2(tax.taxableAmount),
      gstAmount: round2(tax.gstAmount),
      totalAmount: round2(tax.totalAmount),
      operatorId,
    },
  });

  const quantityPerCylinder = challan.holdings.length ? round2(totalQuantity / challan.holdings.length) : 0;
  for (const holding of challan.holdings) {
    const txn = await tx.transaction.create({
      data: {
        billId: bill.id,
        billNumber,
        billDate: challan.challanDate,
        customerId: challan.customerId,
        gasCode: holding.cylinder?.gasCode || challan.gasCode || null,
        cylinderOwner: challan.cylinderOwner || holding.cylinder?.ownerCode || 'COC',
        cylinderNumber: holding.cylinder?.cylinderNumber || null,
        quantityCum: quantityPerCylinder || null,
        orderNumber: challan.challanNumber,
        transactionCode: challan.transactionType || 'ISSUE',
        fullOrEmpty: 'F',
        operatorId,
      },
    });

    await tx.cylinderHolding.update({
      where: { id: holding.id },
      data: { transactionId: txn.id, status: 'BILLED' },
    });
  }

  // Create Sales Book entry
  const salesVoucher = await generateSalesVoucherNumber(tx, challan.challanDate);
  await tx.salesBook.create({
    data: {
      voucherNumber: salesVoucher,
      voucherDate: challan.challanDate,
      partyCode: customer.code,
      documentNumber: billNumber,
      quantityIssued: totalQuantity || null,
      unit: 'CM',
      rate: unitRate || null,
      gstCode: gstRate ? `${gstMode === 'INTER' ? 'I' : 'S'}${Math.round(gstRate)}` : null,
      subtotal: round2(tax.taxableAmount),
      gstAmount: round2(tax.gstAmount),
      totalAmount: round2(tax.totalAmount),
      transactionCode: 'S',
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
    narrationPrefix: `Sales Bill from Challan ${challan.challanNumber}`,
  });

  await postLedgerEntries(tx, challan.challanDate, ledgerEntries, operatorId, { transactionType: 'JOURNAL' });

  // Update challan: link to bill, mark as BILLED
  await tx.challan.update({
    where: { id: challanId },
    data: { linkedBillId: bill.id, status: 'BILLED' },
  });

  await createAuditLog(tx, {
    action: 'CONVERT_CHALLAN_TO_BILL',
    module: 'challans',
    userId: operatorId,
    entityId: String(challanId),
    oldValue: { status: 'OPEN', linkedBillId: null },
    newValue: { status: 'BILLED', linkedBillId: bill.id, billNumber },
  });

  return { bill, challanNumber: challan.challanNumber, billNumber };
}

module.exports = { createChallan, convertChallanToBill };
