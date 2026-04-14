const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createTransfer } = require('../services/transferService');
const { parseDate, parseOptionalNonNegativeNumber } = require('../lib/validation');

const router = express.Router();

// GET /api/transfers - List all inter-company transfers
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { sourceCompany, destCompany, page = 1, limit = 50 } = req.query;
  const where = {};
  if (sourceCompany) where.sourceCompany = sourceCompany;
  if (destCompany) where.destCompany = destCompany;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [transfers, total] = await Promise.all([
    prisma.interCompanyTransfer.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { transferDate: 'desc' },
    }),
    prisma.interCompanyTransfer.count({ where }),
  ]);

  res.json({
    data: transfers,
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / parseInt(limit, 10)),
  });
}));

// POST /api/transfers - Create inter-company transfer
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const {
    sourceCompany,
    destCompany,
    gasCode,
    vehicleNumber,
    notes,
    cylinderNumbers,
  } = req.body;

  const transferDate = parseDate(req.body.transferDate, 'transferDate') || new Date();
  const cylindersCount = parseOptionalNonNegativeNumber(req.body.cylindersCount, 'cylindersCount') || 0;
  const quantityCum = parseOptionalNonNegativeNumber(req.body.quantityCum, 'quantityCum');

  if (!sourceCompany || !destCompany) {
    throw new AppError(400, 'sourceCompany and destCompany are required');
  }

  // Validate cylinder numbers if provided
  let parsedCylinderNumbers = [];
  if (cylinderNumbers) {
    if (!Array.isArray(cylinderNumbers)) throw new AppError(400, 'cylinderNumbers must be an array');
    parsedCylinderNumbers = cylinderNumbers.map((n) => String(n).trim()).filter(Boolean);
  }

  const result = await prisma.$transaction(async (tx) => {
    return await createTransfer(tx, {
      transferDate,
      sourceCompany,
      destCompany,
      gasCode: gasCode || null,
      cylindersCount: Math.trunc(cylindersCount),
      quantityCum,
      vehicleNumber: vehicleNumber || null,
      notes: notes || null,
      operatorId: req.user.sub,
      cylinderNumbers: parsedCylinderNumbers,
    });
  });

  res.status(201).json({ message: 'Transfer created', transfer: result });
}));

module.exports = router;
