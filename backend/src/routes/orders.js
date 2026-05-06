const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { normalizeOwnerCode } = require('../services/businessRules');

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

async function getAvailableCylinderCount(tx, { gasCode, ownerCode }) {
  const where = {
    isActive: true,
    status: 'IN_STOCK',
  };
  if (gasCode) where.gasCode = gasCode;
  if (ownerCode) where.ownerCode = normalizeOwnerCode(ownerCode);
  return tx.cylinder.count({ where });
}

async function validateOrderBusinessRules(tx, data, existing = null) {
  const merged = { ...(existing || {}), ...data };

  if (merged.customerId) {
    const customer = await tx.customer.findUnique({
      where: { id: merged.customerId },
      select: { id: true, isActive: true },
    });
    if (!customer || !customer.isActive) {
      throw new AppError(404, 'Customer not found');
    }
  }

  if (merged.gasCode) {
    const gasType = await tx.gasType.findUnique({
      where: { gasCode: merged.gasCode },
      select: { gasCode: true, isActive: true },
    });
    if (!gasType || !gasType.isActive) {
      throw new AppError(404, 'Gas type not found');
    }
  }

  const stockSensitivePatch = !existing
    || data.quantityCyl !== undefined
    || data.gasCode !== undefined
    || data.ownerCode !== undefined
    || data.status !== undefined;

  if (stockSensitivePatch && merged.quantityCyl && merged.status !== 'CLOSED' && merged.status !== 'CANCELLED') {
    const ownerCode = normalizeOwnerCode(merged.ownerCode || 'COC');
    const available = await getAvailableCylinderCount(tx, {
      gasCode: merged.gasCode,
      ownerCode,
    });
    if (merged.quantityCyl > available) {
      const scope = `${merged.gasCode || 'all gas types'} / ${ownerCode}`;
      throw new AppError(409, `Only ${available} in-stock cylinder(s) available for ${scope}`);
    }
  }
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

router.get('/stock-availability/check', authenticate, asyncHandler(async (req, res) => {
  const { gasCode, ownerCode = 'COC' } = req.query;
  if (gasCode) {
    const gasType = await prisma.gasType.findUnique({
      where: { gasCode },
      select: { gasCode: true, isActive: true },
    });
    if (!gasType || !gasType.isActive) {
      throw new AppError(404, 'Gas type not found');
    }
  }

  const normalizedOwner = normalizeOwnerCode(ownerCode);
  const available = await getAvailableCylinderCount(prisma, { gasCode, ownerCode: normalizedOwner });
  res.json({ gasCode: gasCode || null, ownerCode: normalizedOwner, available });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'id', { required: true });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'Order not found');
  res.json(order);
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  try {
    const payload = normalizeOrderPayload(req.body);
    const order = await prisma.$transaction(async (tx) => {
      await validateOrderBusinessRules(tx, payload);
      return tx.order.create({ data: payload });
    });
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
    const payload = normalizeOrderPayload(req.body, { partial: true });
    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Order not found');
      await validateOrderBusinessRules(tx, payload, existing);
      return tx.order.update({
        where: { id },
        data: payload,
      });
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
