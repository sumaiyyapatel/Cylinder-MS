const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

function parsePositiveInt(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(400, `${field} is required`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalNumber(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(400, `${field} must be a non-negative number`);
  }
  return parsed;
}

function parseOptionalDate(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(400, `${field} is required`);
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${field} must be a valid date`);
  }
  return parsed;
}

function validateOrderStatus(status) {
  if (status === undefined) return undefined;
  if (!['ACTIVE', 'CLOSED', 'CANCELLED'].includes(status)) {
    throw new AppError(400, 'Invalid order status');
  }
  return status;
}

function normalizeOrderPayload(payload, { partial = false } = {}) {
  const data = {};

  if (!partial || payload.orderNumber !== undefined) {
    const orderNumber = String(payload.orderNumber || '').trim();
    if (!orderNumber) throw new AppError(400, 'orderNumber is required');
    data.orderNumber = orderNumber;
  }

  if (!partial || payload.customerId !== undefined) {
    data.customerId = parsePositiveInt(payload.customerId, 'customerId', { required: true });
  }

  if (!partial || payload.orderDate !== undefined) {
    data.orderDate = parseOptionalDate(payload.orderDate, 'orderDate', { required: true });
  }

  if (payload.gasCode !== undefined) data.gasCode = payload.gasCode || null;
  if (payload.ownerCode !== undefined) data.ownerCode = payload.ownerCode || null;
  if (payload.quantityCyl !== undefined) data.quantityCyl = parsePositiveInt(payload.quantityCyl, 'quantityCyl');
  if (payload.quantityCum !== undefined) data.quantityCum = parseOptionalNumber(payload.quantityCum, 'quantityCum');
  if (payload.rate !== undefined) data.rate = parseOptionalNumber(payload.rate, 'rate');
  if (payload.freightRate !== undefined) data.freightRate = parseOptionalNumber(payload.freightRate, 'freightRate');
  if (payload.salesTaxRate !== undefined) data.salesTaxRate = parseOptionalNumber(payload.salesTaxRate, 'salesTaxRate');
  if (payload.discount !== undefined) data.discount = payload.discount || null;
  if (payload.validFrom !== undefined) data.validFrom = parseOptionalDate(payload.validFrom, 'validFrom') || null;
  if (payload.validTo !== undefined) data.validTo = parseOptionalDate(payload.validTo, 'validTo') || null;
  if (payload.status !== undefined) data.status = validateOrderStatus(payload.status);

  if (data.validFrom && data.validTo && data.validTo < data.validFrom) {
    throw new AppError(400, 'validTo cannot be before validFrom');
  }

  return data;
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, customerId, page = 1, limit = 50 } = req.query;
  const where = {};
  if (status) where.status = validateOrderStatus(status);
  if (customerId) where.customerId = parsePositiveInt(customerId, 'customerId');

  const parsedPage = parsePositiveInt(page, 'page', { required: true });
  const parsedLimit = parsePositiveInt(limit, 'limit', { required: true });
  const skip = (parsedPage - 1) * parsedLimit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, skip, take: parsedLimit, orderBy: { orderDate: 'desc' } }),
    prisma.order.count({ where }),
  ]);

  res.json({ data: orders, total, page: parsedPage, totalPages: Math.ceil(total / parsedLimit) });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'id', { required: true });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'Order not found');
  res.json(order);
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  try {
    const order = await prisma.order.create({ data: normalizeOrderPayload(req.body) });
    res.status(201).json(order);
  } catch (err) {
    if (err?.code === 'P2002') {
      throw new AppError(409, 'Order number already exists');
    }
    throw err;
  }
}));

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'id', { required: true });
  try {
    const order = await prisma.order.update({
      where: { id },
      data: normalizeOrderPayload(req.body, { partial: true }),
    });
    res.json(order);
  } catch (err) {
    if (err?.code === 'P2025') {
      throw new AppError(404, 'Order not found');
    }
    if (err?.code === 'P2002') {
      throw new AppError(409, 'Order number already exists');
    }
    throw err;
  }
}));

router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'id', { required: true });
  try {
    await prisma.order.delete({ where: { id } });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    if (err?.code === 'P2025') {
      throw new AppError(404, 'Order not found');
    }
    throw err;
  }
}));

module.exports = router;
