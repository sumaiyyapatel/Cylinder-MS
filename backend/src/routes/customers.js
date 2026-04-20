const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// GET /api/customers
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { search, city, areaCode, page = 1, limit = 50, includeInactive } = req.query;
  const where = {};
  if (includeInactive !== 'true') {
    where.isActive = true;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (areaCode) where.areaCode = areaCode;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take: parseInt(limit, 10), orderBy: { code: 'asc' }, include: { area: true } }),
    prisma.customer.count({ where }),
  ]);
  res.json({ data: customers, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

// GET /api/customers/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { area: true, holdings: { where: { status: { in: ['HOLDING', 'BILLED'] } }, include: { cylinder: true } } },
  });
  if (!customer || !customer.isActive) throw new AppError(404, 'Customer not found');
  res.json(customer);
}));

// POST /api/customers
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.create({ data: { ...req.body, isActive: true } });
  res.status(201).json(customer);
}));

// PUT /api/customers/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.update({ where: { id: parseInt(req.params.id, 10) }, data: req.body });
  res.json(customer);
}));

// DELETE /api/customers/:id
router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Customer not found');
    }

    const updated = await tx.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(tx, {
      action: 'SOFT_DELETE_CUSTOMER',
      module: 'customers',
      userId: req.user.sub,
      entityId: String(updated.id),
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: updated.isActive },
    });
  });

  res.json({ message: 'Customer deactivated' });
}));

module.exports = router;
