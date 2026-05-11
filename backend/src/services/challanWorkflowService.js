const { AppError } = require('../middleware/errorHandler');
const { createChallan, convertChallanToBill } = require('./challanService');
const { updateCylinderStatus } = require('./cylinderStatusService');
const { postLedgerEntries } = require('./ledgerPostingService');
const { createAuditLog } = require('./auditService');
const { MOVEMENT_TYPES, recordCylinderMovement } = require('./cylinderMovementService');
const { generateEcrNumber } = require('./numberingService');
const { computeCylinderRental } = require('./rentalEngineService');
const { cancelDocument } = require('./documentLifecycleService');
const { emitDomainEvent } = require('./domainEventService');
const {
  parseOptionalNonNegativeNumber,
  parseDate,
  parseRequiredInt,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
} = require('../lib/validation');

function parseChallanCreatePayload(payload = {}) {
  const customerId = parseRequiredInt(payload.customerId, 'customerId');
  const challanDate = parseDate(payload.challanDate, 'challanDate') || new Date();
  const quantityCum = parseOptionalNonNegativeNumber(payload.quantityCum, 'quantityCum');
  const cylindersCountValue = parseOptionalNonNegativeNumber(payload.cylindersCount, 'cylindersCount');
  const cylindersCount = cylindersCountValue == null ? 0 : Math.trunc(cylindersCountValue);
  const linkedBillIdValue = parseOptionalNonNegativeNumber(payload.linkedBillId, 'linkedBillId');
  const linkedBillId = linkedBillIdValue == null ? null : Math.trunc(linkedBillIdValue);

  if (cylindersCount < 0) throw new AppError(400, 'cylindersCount cannot be negative');
  if (linkedBillId != null && linkedBillId <= 0) throw new AppError(400, 'linkedBillId must be a positive integer');
  if (linkedBillId != null) throw new AppError(400, 'Create challan first, then use convert-to-bill to link billing');
  if (payload.billAmount != null || payload.taxableAmount != null || payload.gstAmount != null) {
    throw new AppError(400, 'Challan does not post accounting amounts; convert it to a bill first');
  }

  const cylindersInput = payload.cylinders;
  let preparedCylinders = [];
  if (cylindersInput != null) {
    if (!Array.isArray(cylindersInput)) throw new AppError(400, 'cylinders must be an array');
    preparedCylinders = cylindersInput.map((cyl, index) => ({
      cylinderNumber: validateCylinderNumber(cyl?.cylinderNumber, `cylinders[${index}].cylinderNumber`),
    }));
    validateCylinderNumbersUnique(preparedCylinders.map((item) => item.cylinderNumber));
  }

  return {
    customerId,
    challanDate,
    quantityCum,
    cylindersCount,
    linkedBillId,
    cylinderOwner: payload.cylinderOwner,
    vehicleNumber: payload.vehicleNumber,
    transactionType: payload.transactionType || 'DELIVERY',
    preparedCylinders,
    gasCode: payload.gasCode || null,
  };
}

async function createChallanWorkflow(db, payload = {}, { operatorId = null } = {}) {
  const input = parseChallanCreatePayload(payload);
  return db.$transaction((tx) => createChallan(tx, { ...input, operatorId }));
}

async function convertChallanWorkflow(db, challanId, { operatorId = null } = {}) {
  const id = Number(challanId);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid challan id');
  return db.$transaction((tx) => convertChallanToBill(tx, id, operatorId));
}

async function deleteChallanWorkflow(db, challanId, { operatorId = null } = {}) {
  const id = Number(challanId);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid challan id');

  await db.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({
      where: { id },
      include: { holdings: { where: { status: { in: ['HOLDING', 'BILLED'] } } } },
    });
    if (!challan) throw new AppError(404, 'Challan not found');
    if (challan.status === 'BILLED' || challan.linkedBillId) {
      throw new AppError(409, 'Billed challans are locked and cannot be deleted');
    }
    if (challan.holdings.length) {
      throw new AppError(409, 'Return active challan cylinders before deleting this challan');
    }

    await cancelDocument(tx, 'challan', id, { operatorId, reason: 'User cancelled challan' });
  });
}

async function partialReturnChallanWorkflow(db, challanId, payload = {}, { operatorId = null } = {}) {
  const id = Number(challanId);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid challan id');

  const returned = payload.returnedCylinders;
  if (!Array.isArray(returned) || returned.length === 0) {
    throw new AppError(400, 'returnedCylinders must be a non-empty array');
  }

  const returnDate = parseDate(payload.returnDate, 'returnDate') || new Date();

  return db.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({ where: { id } });
    if (!challan) throw new AppError(404, 'Challan not found');

    const processed = [];
    for (const rawNumber of returned) {
      const cylinderNumber = validateCylinderNumber(rawNumber);
      const cylinder = await tx.cylinder.findUnique({ where: { cylinderNumber } });
      if (!cylinder || !cylinder.isActive) throw new AppError(404, `Cylinder not found: ${cylinderNumber}`);

      const holding = await tx.cylinderHolding.findFirst({
        where: {
          cylinderId: cylinder.id,
          customerId: challan.customerId,
          status: { in: ['HOLDING', 'BILLED'] },
        },
        orderBy: { issuedAt: 'desc' },
      });
      if (!holding) throw new AppError(400, `No active holding found for cylinder ${cylinderNumber} under this challan/customer`);

      const rental = await computeCylinderRental(tx, {
        customerId: challan.customerId,
        gasCode: cylinder.gasCode,
        ownerCode: cylinder.ownerCode,
        issuedAt: holding.issuedAt,
        returnedAt: returnDate,
      });
      const { holdDays, rentAmount } = rental;
      const effectiveOwner = rental.ownerCode;

      await tx.cylinderHolding.update({
        where: { id: holding.id },
        data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' },
      });
      await updateCylinderStatus(tx, cylinder.id, 'RETURNED');

      const linkedTransaction = holding.transactionId
        ? await tx.transaction.findUnique({ where: { id: holding.transactionId }, select: { billNumber: true, quantityCum: true } })
        : null;
      const ecrNumber = await generateEcrNumber(tx, returnDate);
      await tx.ecrRecord.create({
        data: {
          ecrNumber,
          ecrDate: returnDate,
          customerId: challan.customerId,
          gasCode: cylinder.gasCode,
          cylinderOwner: effectiveOwner,
          cylinderNumber,
          issueNumber: linkedTransaction?.billNumber || null,
          issueDate: holding.issuedAt,
          holdDays,
          rentAmount,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          operatorId,
          quantityCum: linkedTransaction?.quantityCum || null,
          documentStatus: 'FINALIZED',
          finalizedAt: new Date(),
        },
      });

      await recordCylinderMovement(tx, {
        cylinderId: cylinder.id,
        customerId: challan.customerId,
        holdingId: holding.id,
        gasCode: cylinder.gasCode,
        ownerCode: effectiveOwner,
        movementType: MOVEMENT_TYPES.RETURN,
        movementDate: returnDate,
        quantityCum: linkedTransaction?.quantityCum || null,
        statusBefore: cylinder.status,
        statusAfter: 'RETURNED',
        referenceType: 'ECR',
        referenceNumber: ecrNumber,
        operatorId,
      });

      if (rentAmount && rentAmount > 0) {
        const customerRec = await tx.customer.findUnique({ where: { id: challan.customerId }, select: { code: true } });
        await postLedgerEntries(tx, returnDate, [
          { partyCode: customerRec?.code || null, particular: `Rental for ${ecrNumber}`, narration: `Rental for ${ecrNumber}`, debitAmount: rentAmount, creditAmount: null, voucherRef: ecrNumber },
          { partyCode: null, particular: `Rental Income ${ecrNumber}`, narration: `Rental Income ${ecrNumber}`, debitAmount: null, creditAmount: rentAmount, voucherRef: ecrNumber },
        ], operatorId);
      }

      await createAuditLog(tx, {
        action: 'PARTIAL_RETURN_CYLINDER',
        module: 'challans',
        userId: operatorId,
        entityId: String(challan.id),
        oldValue: { holdingStatus: holding.status, cylinderStatus: cylinder.status },
        newValue: { holdingStatus: 'RETURNED', cylinderStatus: 'RETURNED', cylinderNumber, ecrNumber },
      });
      await emitDomainEvent(tx, {
        eventType: 'CylinderReturned',
        aggregateType: 'ecr',
        aggregateId: ecrNumber,
        payload: { challanId: id, challanNumber: challan.challanNumber, cylinderNumber, holdDays, rentAmount },
        operatorId,
      });

      processed.push({ cylinderNumber, ecrNumber, holdDays, rentAmount });
    }

    const remainingHoldings = await tx.cylinderHolding.count({
      where: { challanId: id, status: { in: ['HOLDING', 'BILLED'] } },
    });
    await tx.challan.update({ where: { id }, data: { cylindersCount: remainingHoldings } });

    return { processed, remainingHoldings };
  });
}

module.exports = {
  createChallanWorkflow,
  convertChallanWorkflow,
  deleteChallanWorkflow,
  partialReturnChallanWorkflow,
};
