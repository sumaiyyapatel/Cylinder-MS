const { AppError } = require('../middleware/errorHandler');
const { round2, deriveNextHydroDueDate, isHydroTestOverdue } = require('./businessRules');
const { generateChallanNumber } = require('./numberingService');
const { createAuditLog } = require('./auditService');
const { updateCylinderStatus, assertNoActiveHolding } = require('./cylinderStatusService');
const { postLedgerEntries } = require('./ledgerPostingService');

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
    billAmount = null,
    taxableAmount = null,
    gstAmount = null,
  } = opts;

  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, code: true, isActive: true } });
  if (!customer || !customer.isActive) throw new AppError(404, 'Customer not found');

  const challanNumber = await generateChallanNumber(tx, challanDate);
  const created = await tx.challan.create({
    data: {
      challanNumber,
      challanDate,
      customerId,
      cylinderOwner,
      cylindersCount,
      quantityCum: quantityCum == null ? null : round2(quantityCum),
      vehicleNumber,
      transactionType,
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
      where: { cylinderId: { in: dbCylinders.map((c) => c.id) }, status: 'HOLDING' },
      select: { cylinderId: true },
    });
    const holdingCylinderIds = new Set(holdingRecords.map((h) => h.cylinderId));

    const blockedWithCustomer = [];
    const blockedNotInStock = [];
    const blockedHydroOverdue = [];
    const blockedMissingHydro = [];

    for (const dbCyl of dbCylinders) {
      if (holdingCylinderIds.has(dbCyl.id)) blockedWithCustomer.push(dbCyl.cylinderNumber);
      if (dbCyl.status !== 'IN_STOCK') blockedNotInStock.push(dbCyl.cylinderNumber);

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

    for (const num of cylinderNumbers) {
      const cylinder = dbCylinders.find((d) => d.cylinderNumber === num);
      await assertNoActiveHolding(tx, cylinder.id, cylinder.cylinderNumber);

      await updateCylinderStatus(tx, cylinder.id, 'WITH_CUSTOMER', { incrementFillCount: false });

      const holding = await tx.cylinderHolding.create({
        data: { cylinderId: cylinder.id, customerId, issuedAt: challanDate, status: 'HOLDING' },
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

  // Ledger postings (optional)
  const ledgerEntries = [];
  if (billAmount != null && billAmount > 0) {
    ledgerEntries.push({ partyCode: customer.code, particular: `Challan ${created.challanNumber}`, narration: `Challan ${created.challanNumber}`, debitAmount: billAmount, creditAmount: null, voucherRef: created.challanNumber });
  }
  if (taxableAmount != null && taxableAmount > 0) {
    ledgerEntries.push({ partyCode: null, particular: `Sales for ${created.challanNumber}`, narration: `Sales for ${created.challanNumber}`, debitAmount: null, creditAmount: taxableAmount, voucherRef: created.challanNumber });
  }
  if (gstAmount != null && gstAmount > 0) {
    ledgerEntries.push({ partyCode: null, particular: `GST for ${created.challanNumber}`, narration: `GST for ${created.challanNumber}`, debitAmount: null, creditAmount: gstAmount, voucherRef: created.challanNumber });
  }

  if (ledgerEntries.length) {
    await postLedgerEntries(tx, challanDate, ledgerEntries, operatorId);
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

module.exports = { createChallan };
