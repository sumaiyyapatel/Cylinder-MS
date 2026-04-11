const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// GET /api/gas-types
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const where = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const gasTypes = await prisma.gasType.findMany({ where, orderBy: { gasCode: 'asc' } });
  res.json(gasTypes);
}));

// POST /api/gas-types
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const gasType = await prisma.gasType.create({ data: { ...req.body, isActive: true } });
  res.status(201).json(gasType);
}));

// PUT /api/gas-types/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const gasType = await prisma.gasType.update({ where: { id: parseInt(req.params.id, 10) }, data: req.body });
  res.json(gasType);
}));

// DELETE /api/gas-types/:id
router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.gasType.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Gas type not found');
    }

    const updated = await tx.gasType.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(tx, {
      action: 'SOFT_DELETE_GAS_TYPE',
      module: 'gas_types',
      userId: req.user.sub,
      entityId: String(updated.id),
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: updated.isActive },
    });
  });

  res.json({ message: 'Gas type deactivated' });
}));

module.exports = router;
