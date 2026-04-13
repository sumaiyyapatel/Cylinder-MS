const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/alerts - Fetch unresolved alerts
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { type, customerId, resolved = 'false' } = req.query;

  const where = {};
  if (type) where.type = type;
  if (customerId) where.customerId = parseInt(customerId);
  where.isResolved = resolved === 'true';

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      customer: { select: { code: true, name: true } },
      cylinder: { select: { cylinderNumber: true, gasCode: true } },
    },
    orderBy: { sentAt: 'desc' },
  });

  res.json(alerts);
}));

// PATCH /api/alerts/:id/resolve - Mark alert as resolved
router.patch('/:id/resolve', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);

  const alert = await prisma.alert.update({
    where: { id },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
    },
  });

  res.json(alert);
}));

module.exports = router;