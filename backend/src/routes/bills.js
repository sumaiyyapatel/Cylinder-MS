const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { streamBillPdf } = require('../services/pdfService');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');
  const sent = await streamBillPdf(res, id, { userId: req.user.sub });
  if (!sent) throw new AppError(404, 'Bill not found');
}));

router.post('/:id/route-trace', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');
  if (!Array.isArray(req.body.route) || req.body.route.length === 0) {
    throw new AppError(400, 'route must be a non-empty array');
  }

  const bill = await prisma.bill.findUnique({ where: { id }, select: { id: true, billNumber: true } });
  if (!bill) throw new AppError(404, 'Bill not found');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO delivery_route_traces (bill_id, operator_id, route)
      VALUES (${id}, ${req.user.sub || null}, ${JSON.stringify(req.body.route)}::jsonb)
    `;

    await createAuditLog(tx, {
      action: 'ROUTE_TRACE_CAPTURED',
      module: 'bills',
      userId: req.user.sub,
      entityId: String(id),
      newValue: { billNumber: bill.billNumber, points: req.body.route.length },
    });
  });

  res.status(201).json({ message: 'Route trace saved' });
}));

module.exports = router;
