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
const { returnCylinder } = require('../services/cylinderHoldingService');
const {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  validateCylinderNumber,
} = require('../lib/validation');
const { streamEcrPdf } = require('../services/pdfService');

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

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid ECR id');

  const sent = await streamEcrPdf(res, id, { userId: req.user.sub });
  if (!sent) throw new AppError(404, 'ECR not found');
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

    // Ensure a matching holding exists
    const holding = await tx.cylinderHolding.findFirst({
      where: { cylinderId: cylinder.id, customerId: customerIdNum, status: { in: ['HOLDING', 'BILLED'] } },
      include: { transaction: true },
      orderBy: { issuedAt: 'desc' },
    });
    if (!holding) {
      throw new AppError(400, 'No matching issue found for this customer and cylinder');
    }

    // Delegate close-and-create-ECR to cylinderHoldingService
    const createdEcr = await returnCylinder(tx, {
      holdingId: holding.id,
      returnDate,
      cylinderOwner,
      gasCode,
      challanNumber,
      challanDate: parsedChallanDate,
      vehicleNumber,
      quantityCum: parsedQuantity,
      operatorId: req.user.sub,
      performedBy: req.user.sub,
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
    where: { cylinderId: cylinder.id, status: { in: ['HOLDING', 'BILLED'] } },
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
