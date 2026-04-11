const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { validateGstRate, parseOptionalNonNegativeNumber } = require('../lib/validation');

const router = express.Router();

function validateRatePayload(payload, options = {}) {
  const { requireKeys = true } = options;
  const data = { ...payload };

  if (data.gstRate !== undefined && data.gstRate !== null && data.gstRate !== '') {
    data.gstRate = validateGstRate(data.gstRate, 'gstRate');
  }

  const numericFields = ['ratePerUnit', 'rentalRate1', 'rentalRate2', 'rentalRate3'];
  for (const field of numericFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      data[field] = parseOptionalNonNegativeNumber(data[field], field);
    }
  }

  if (requireKeys && !data.gasCode) {
    throw new AppError(400, 'gasCode is required');
  }
  if (requireKeys && !data.ownerCode) {
    throw new AppError(400, 'ownerCode is required');
  }

  return data;
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { gasCode, ownerCode } = req.query;
  const where = {};
  if (gasCode) where.gasCode = gasCode;
  if (ownerCode) where.ownerCode = ownerCode;
  const rates = await prisma.rateList.findMany({ where, include: { gasType: true }, orderBy: { gasCode: 'asc' } });
  res.json(rates);
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const payload = validateRatePayload(req.body, { requireKeys: true });
  const rate = await prisma.rateList.create({ data: payload });
  res.status(201).json(rate);
}));

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const payload = validateRatePayload(req.body, { requireKeys: false });
  const rate = await prisma.rateList.update({ where: { id: parseInt(req.params.id, 10) }, data: payload });
  res.json(rate);
}));

router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.rateList.delete({ where: { id: parseInt(req.params.id, 10) } });
  res.json({ message: 'Rate deleted' });
}));

module.exports = router;
