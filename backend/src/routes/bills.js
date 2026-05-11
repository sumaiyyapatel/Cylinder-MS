const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { streamBillPdf } = require('../services/pdfService');
const { createSerializedIssueBill } = require('../services/billingService');
const { createBillRouteTrace } = require('../services/deliveryRouteTraceService');

const router = express.Router();

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const result = await createSerializedIssueBill(prisma, req.body, { operatorId: req.user.sub });
  res.status(201).json({
    message: 'Bill created',
    warnings: result.warnings,
    bill: result.createdBill,
  });
}));

router.get('/:id/pdf', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');
  const sent = await streamBillPdf(res, id, { userId: req.user.sub });
  if (!sent) throw new AppError(404, 'Bill not found');
}));

router.post('/:id/route-trace', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');

  await prisma.$transaction(async (tx) => {
    await createBillRouteTrace(tx, {
      billId: id,
      route: req.body.route,
      operatorId: req.user.sub,
    });
  });

  res.status(201).json({ message: 'Route trace saved' });
}));

module.exports = router;
