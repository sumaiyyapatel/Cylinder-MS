const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { calculateHoldDays, isPocOwner, normalizeOwnerCode, round2 } = require('../services/businessRules');
const { generateEcrNumber } = require('../services/numberingService');
const { updateCylinderStatus } = require('../services/cylinderStatusService');
const { createAuditLog } = require('../services/auditService');
const { postLedgerEntries } = require('../services/ledgerPostingService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
} = require('../lib/validation');

const router = express.Router();

const { calculateRent, getEffectiveRate } = require('../services/rentalService');

// GET /api/ecr
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const where = {};
  if (customerId) where.customerId = parseInt(customerId, 10);
  if (dateFrom || dateTo) {
    where.ecrDate = {};
    if (dateFrom) where.ecrDate.gte = new Date(dateFrom);
    if (dateTo) where.ecrDate.lte = new Date(`${dateTo}T23:59:59Z`);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [records, total] = await Promise.all([
    prisma.ecrRecord.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { ecrDate: 'desc' },
      include: { customer: { select: { id: true, code: true, name: true } } },
    }),
    prisma.ecrRecord.count({ where }),
  ]);

  res.json({ data: records, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

// POST /api/ecr
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const {
    customerId,
    gasCode,
    cylinderOwner,
    cylinderNumber,
    ecrDate,
    challanNumber,
    challanDate,
    vehicleNumber,
    quantityCum,
  } = req.body;

  const customerIdNum = parseRequiredInt(customerId, 'customerId');
  const normalizedCylinderNumber = validateCylinderNumber(cylinderNumber);
  const returnDate = parseDate(ecrDate, 'ecrDate') || new Date();
  const parsedChallanDate = parseDate(challanDate, 'challanDate');
  const parsedQuantity = parseOptionalNonNegativeNumber(quantityCum, 'quantityCum');

  const ecr = await prisma.$transaction(async (tx) => {
    const cylinder = await tx.cylinder.findUnique({
      where: { cylinderNumber: normalizedCylinderNumber },
    });
    if (!cylinder || !cylinder.isActive) {
      throw new AppError(404, 'Cylinder not found');
    }

    const holding = await tx.cylinderHolding.findFirst({
      where: { cylinderId: cylinder.id, customerId: customerIdNum, status: 'HOLDING' },
      include: { transaction: true },
      orderBy: { issuedAt: 'desc' },
    });
    if (!holding) {
      throw new AppError(400, 'No matching issue found for this customer and cylinder');
    }

    const issueDate = holding.issuedAt;
    const issueNumber = holding.transaction?.billNumber || null;
    if (returnDate < new Date(issueDate)) {
      throw new AppError(400, 'Return date cannot be before issue date');
    }

    const holdDays = calculateHoldDays(issueDate, returnDate);
    const effectiveOwner = normalizeOwnerCode(cylinderOwner || cylinder.ownerCode);

    let rentAmount = 0;
    if (!isPocOwner(effectiveOwner)) {
      const rateConfig = await getEffectiveRate(tx, { customerId: customerIdNum, gasCode: gasCode || cylinder.gasCode, ownerCode: effectiveOwner });
      rentAmount = calculateRent(holdDays, rateConfig);
    }
    rentAmount = round2(rentAmount);

    await tx.cylinderHolding.update({
      where: { id: holding.id },
      data: { returnedAt: returnDate, holdDays, rentAmount, status: 'RETURNED' },
    });

    await updateCylinderStatus(tx, cylinder.id, 'IN_STOCK');

    const ecrNumber = await generateEcrNumber(tx, returnDate);
    const createdEcr = await tx.ecrRecord.create({
      data: {
        ecrNumber,
        ecrDate: returnDate,
        customerId: customerIdNum,
        gasCode: gasCode || cylinder.gasCode,
        cylinderOwner: effectiveOwner,
        cylinderNumber: normalizedCylinderNumber,
        issueNumber,
        issueDate,
        holdDays,
        rentAmount,
        challanNumber,
        challanDate: parsedChallanDate,
        vehicleNumber,
        operatorId: req.user.sub,
        quantityCum: parsedQuantity == null ? null : round2(parsedQuantity),
      },
    });

    // If rental applies, post ledger entries (customer DR, rental income CR)
    if (rentAmount && rentAmount > 0) {
      const customerRec = await tx.customer.findUnique({ where: { id: customerIdNum }, select: { code: true } });
      const ledgerEntries = [
        { partyCode: customerRec?.code || null, particular: `Rental for ${ecrNumber}`, narration: `Rental for ${ecrNumber}`, debitAmount: rentAmount, creditAmount: null, voucherRef: ecrNumber },
        { partyCode: null, particular: `Rental Income ${ecrNumber}`, narration: `Rental Income ${ecrNumber}`, debitAmount: null, creditAmount: rentAmount, voucherRef: ecrNumber },
      ];
      await postLedgerEntries(tx, returnDate, ledgerEntries, req.user.sub);
    }

    await createAuditLog(tx, {
      action: 'RETURN_CYLINDER',
      module: 'ecr',
      userId: req.user.sub,
      entityId: String(createdEcr.id),
      oldValue: { cylinderStatus: cylinder.status, holdingStatus: holding.status },
      newValue: {
        cylinderStatus: 'IN_STOCK',
        holdingStatus: 'RETURNED',
        cylinderNumber: normalizedCylinderNumber,
        ecrNumber,
      },
    });

    return createdEcr;
  });

  res.status(201).json(ecr);
}));

// GET /api/ecr/cylinder-info/:cylinderNumber
router.get('/cylinder-info/:cylinderNumber', authenticate, asyncHandler(async (req, res) => {
  const number = validateCylinderNumber(req.params.cylinderNumber);
  const cylinder = await prisma.cylinder.findUnique({
    where: { cylinderNumber: number },
    include: { gasType: true },
  });
  if (!cylinder) throw new AppError(404, 'Cylinder not found');

  const holding = await prisma.cylinderHolding.findFirst({
    where: { cylinderId: cylinder.id, status: 'HOLDING' },
    include: { customer: true, transaction: true },
    orderBy: { issuedAt: 'desc' },
  });

  let holdDays = 0;
  if (holding) {
    holdDays = calculateHoldDays(holding.issuedAt, new Date());
  }

  res.json({
    cylinder,
    holding: holding ? {
      customerId: holding.customerId,
      customerName: holding.customer?.name,
      issuedAt: holding.issuedAt,
      issueNumber: holding.transaction?.billNumber,
      holdDays,
    } : null,
  });
}));

module.exports = router;
