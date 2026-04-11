const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// GET /api/cylinders
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, gasCode, ownerCode, search, page = 1, limit = 50, includeInactive } = req.query;
  const where = {};
  if (includeInactive !== 'true') {
    where.isActive = true;
  }
  if (status) where.status = status;
  if (gasCode) where.gasCode = gasCode;
  if (ownerCode) where.ownerCode = ownerCode;
  if (search) {
    where.OR = [
      { cylinderNumber: { contains: search, mode: 'insensitive' } },
      { particular: { contains: search, mode: 'insensitive' } },
    ];
  }
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [cylinders, total] = await Promise.all([
    prisma.cylinder.findMany({ where, skip, take: parseInt(limit, 10), orderBy: { cylinderNumber: 'asc' }, include: { gasType: true } }),
    prisma.cylinder.count({ where }),
  ]);
  res.json({ data: cylinders, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

// GET /api/cylinders/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const cylinder = await prisma.cylinder.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { gasType: true, holdings: { include: { customer: true }, orderBy: { issuedAt: 'desc' }, take: 20 } },
  });
  if (!cylinder || !cylinder.isActive) throw new AppError(404, 'Cylinder not found');
  res.json(cylinder);
}));

// POST /api/cylinders
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const cylinder = await prisma.cylinder.create({ data: { ...req.body, isActive: true } });
  res.status(201).json(cylinder);
}));

// PUT /api/cylinders/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const cylinder = await prisma.cylinder.update({ where: { id: parseInt(req.params.id, 10) }, data: req.body });
  res.json(cylinder);
}));

// DELETE /api/cylinders/:id
router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.cylinder.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Cylinder not found');
    }

    const updated = await tx.cylinder.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(tx, {
      action: 'SOFT_DELETE_CYLINDER',
      module: 'cylinders',
      userId: req.user.sub,
      entityId: String(updated.id),
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: updated.isActive },
    });
  });

  res.json({ message: 'Cylinder deactivated' });
}));

module.exports = router;
