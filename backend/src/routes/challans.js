const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { round2, deriveNextHydroDueDate, isHydroTestOverdue, calculateHoldDays, isPocOwner, normalizeOwnerCode } = require('../services/businessRules');
const { createChallan, convertChallanToBill } = require('../services/challanService');
const { updateCylinderStatus } = require('../services/cylinderStatusService');
const { postLedgerEntries } = require('../services/ledgerPostingService');
const { createAuditLog } = require('../services/auditService');
const { calculateRent, getEffectiveRate } = require('../services/rentalService');
const { generateEcrNumber } = require('../services/numberingService');
const {
  parseOptionalNonNegativeNumber,
  parseDate,
  parseRequiredInt,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
} = require('../lib/validation');
const { streamChallanPdf } = require('../services/pdfService');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, page = 1, limit = 50 } = req.query;
  const where = {};
  if (customerId) where.customerId = parseInt(customerId, 10);
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [challans, total] = await Promise.all([
    prisma.challan.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { challanDate: 'desc' },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        linkedBill: { select: { id: true, billNumber: true } },
      },
    }),
    prisma.challan.count({ where }),
  ]);
  res.json({ data: challans, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid challan id');

  const sent = await streamChallanPdf(res, id);
  if (!sent) throw new AppError(404, 'Challan not found');
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customerId = parseRequiredInt(req.body.customerId, 'customerId');
  const challanDate = parseDate(req.body.challanDate, 'challanDate') || new Date();
  const quantityCum = parseOptionalNonNegativeNumber(req.body.quantityCum, 'quantityCum');
  const cylindersCountValue = parseOptionalNonNegativeNumber(req.body.cylindersCount, 'cylindersCount');
  const cylindersCount = cylindersCountValue == null ? 0 : Math.trunc(cylindersCountValue);
  const linkedBillIdValue = parseOptionalNonNegativeNumber(req.body.linkedBillId, 'linkedBillId');
  const linkedBillId = linkedBillIdValue == null ? null : Math.trunc(linkedBillIdValue);

  if (cylindersCount < 0) {
    throw new AppError(400, 'cylindersCount cannot be negative');
  }
  if (linkedBillId != null && linkedBillId <= 0) {
    throw new AppError(400, 'linkedBillId must be a positive integer');
  }

  // Optional cylinders array (each item: { cylinderNumber })
  const cylindersInput = req.body.cylinders;
  let preparedCylinders = [];
  if (cylindersInput != null) {
    if (!Array.isArray(cylindersInput)) throw new AppError(400, 'cylinders must be an array');
    preparedCylinders = cylindersInput.map((cyl, index) => {
      const number = validateCylinderNumber(cyl?.cylinderNumber, `cylinders[${index}].cylinderNumber`);
      return { cylinderNumber: number };
    });
    validateCylinderNumbersUnique(preparedCylinders.map((c) => c.cylinderNumber));
  }

  const billAmount = parseOptionalNonNegativeNumber(req.body.billAmount, 'billAmount');
  const taxableAmount = parseOptionalNonNegativeNumber(req.body.taxableAmount, 'taxableAmount');
  const gstAmount = parseOptionalNonNegativeNumber(req.body.gstAmount, 'gstAmount');

  const created = await prisma.$transaction(async (tx) => {
    return await createChallan(tx, {
      customerId,
      challanDate,
      quantityCum,
      cylindersCount,
      linkedBillId,
      cylinderOwner: req.body.cylinderOwner,
      vehicleNumber: req.body.vehicleNumber,
      transactionType: req.body.transactionType || 'DELIVERY',
      operatorId: req.user.sub,
      preparedCylinders,
      billAmount,
      taxableAmount,
      gstAmount,
      gasCode: req.body.gasCode || null,
    });
  });

  res.status(201).json(created);
}));

// POST /api/challans/:id/convert-to-bill
router.post('/:id/convert-to-bill', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const challanId = parseInt(req.params.id, 10);
  if (!Number.isFinite(challanId) || challanId <= 0) throw new AppError(400, 'Invalid challan id');

  const result = await prisma.$transaction(async (tx) => {
    return await convertChallanToBill(tx, challanId, req.user.sub);
  });

  res.status(201).json({ message: 'Challan converted to bill', ...result });
}));

module.exports = router;

// POST /api/challans/:id/partial-return
router.post('/:id/partial-return', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const challanId = parseInt(req.params.id, 10);
  if (!Number.isFinite(challanId) || challanId <= 0) throw new AppError(400, 'Invalid challan id');

  const returned = req.body.returnedCylinders;
  if (!Array.isArray(returned) || returned.length === 0) {
    throw new AppError(400, 'returnedCylinders must be a non-empty array');
  }

  const returnDate = parseDate(req.body.returnDate, 'returnDate') || new Date();

  const result = await prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({ where: { id: challanId } });
    if (!challan) throw new AppError(404, 'Challan not found');

    const processed = [];

    for (const numRaw of returned) {
      const cylNumber = validateCylinderNumber(numRaw);
      const cylinder = await tx.cylinder.findUnique({ where: { cylinderNumber: cylNumber } });
      if (!cylinder || !cylinder.isActive) throw new AppError(404, `Cylinder not found: ${cylNumber}`);

      const holding = await tx.cylinderHolding.findFirst({
        where: { cylinderId: cylinder.id, customerId: challan.customerId, status: { in: ['HOLDING', 'BILLED'] } },
        orderBy: { issuedAt: 'desc' },
      });
      if (!holding) throw new AppError(400, `No active holding found for cylinder ${cylNumber} under this challan/customer`);

      const holdDays = calculateHoldDays(holding.issuedAt, returnDate);
      const effectiveOwner = normalizeOwnerCode(cylinder.ownerCode);
      let rentAmount = 0;
      if (!isPocOwner(effectiveOwner)) {
        const effectiveRate = await getEffectiveRate(tx, { customerId: challan.customerId, gasCode: cylinder.gasCode, ownerCode: effectiveOwner });
        if (effectiveRate) rentAmount = calculateRent(holdDays, effectiveRate);
      }

      // Update holding and cylinder
      await tx.cylinderHolding.update({ where: { id: holding.id }, data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' } });
      await updateCylinderStatus(tx, cylinder.id, 'IN_STOCK');

      // Create ECR record per returned cylinder
      const ecrNumber = await generateEcrNumber(tx, returnDate);
      const createdEcr = await tx.ecrRecord.create({
        data: {
          ecrNumber,
          ecrDate: returnDate,
          customerId: challan.customerId,
          gasCode: cylinder.gasCode,
          cylinderOwner: effectiveOwner,
          cylinderNumber: cylNumber,
          issueNumber: holding.transactionId ? (await tx.transaction.findUnique({ where: { id: holding.transactionId }, select: { billNumber: true } })).billNumber : null,
          issueDate: holding.issuedAt,
          holdDays,
          rentAmount,
          challanNumber: challan.challanNumber,
          challanDate: challan.challanDate,
          operatorId: req.user.sub,
        },
      });

      // If rent applicable post ledger entries
      if (rentAmount && rentAmount > 0) {
        const customerRec = await tx.customer.findUnique({ where: { id: challan.customerId }, select: { code: true } });
        const ledgerEntries = [
          { partyCode: customerRec?.code || null, particular: `Rental for ${ecrNumber}`, narration: `Rental for ${ecrNumber}`, debitAmount: rentAmount, creditAmount: null, voucherRef: ecrNumber },
          { partyCode: null, particular: `Rental Income ${ecrNumber}`, narration: `Rental Income ${ecrNumber}`, debitAmount: null, creditAmount: rentAmount, voucherRef: ecrNumber },
        ];
        await postLedgerEntries(tx, returnDate, ledgerEntries, req.user.sub);
      }

      await createAuditLog(tx, {
        action: 'PARTIAL_RETURN_CYLINDER',
        module: 'challans',
        userId: req.user.sub,
        entityId: String(challan.id),
        oldValue: { holdingStatus: holding.status, cylinderStatus: cylinder.status },
        newValue: { holdingStatus: 'RETURNED', cylinderStatus: 'IN_STOCK', cylinderNumber: cylNumber, ecrNumber },
      });

      processed.push({ cylinderNumber: cylNumber, ecrNumber, holdDays, rentAmount });
    }

    // Recalculate remaining holdings for this challan's customer on challan date
    const start = new Date(challan.challanDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const remainingHoldings = await tx.cylinderHolding.count({ where: { customerId: challan.customerId, status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { gte: start, lt: end } } });

    // Update challan cylindersCount to remainingHoldings (best-effort)
    await tx.challan.update({ where: { id: challanId }, data: { cylindersCount: remainingHoldings } });

    return { processed, remainingHoldings };
  });

  res.status(200).json(result);
}));
