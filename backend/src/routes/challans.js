const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { streamChallanPdf } = require('../services/pdfService');
const {
  createChallanWorkflow,
  convertChallanWorkflow,
  deleteChallanWorkflow,
  partialReturnChallanWorkflow,
} = require('../services/challanWorkflowService');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, page = 1, limit = 50 } = req.query;
  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
  const where = { isDeleted: false };
  if (customerId) where.customerId = parseInt(customerId, 10);

  const [challans, total] = await Promise.all([
    prisma.challan.findMany({
      where,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { challanDate: 'desc' },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        linkedBill: { select: { id: true, billNumber: true } },
      },
    }),
    prisma.challan.count({ where }),
  ]);

  res.json({ data: challans, total, page: safePage, totalPages: Math.ceil(total / safeLimit) });
}));

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid challan id');

  const sent = await streamChallanPdf(res, id, { userId: req.user.sub });
  if (!sent) throw new AppError(404, 'Challan not found');
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const created = await createChallanWorkflow(prisma, req.body, { operatorId: req.user.sub });
  res.status(201).json(created);
}));

router.post('/:id/convert-to-bill', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const result = await convertChallanWorkflow(prisma, req.params.id, { operatorId: req.user.sub });
  res.status(201).json({ message: 'Challan converted to bill', ...result });
}));

router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  await deleteChallanWorkflow(prisma, req.params.id, { operatorId: req.user.sub });
  res.json({ message: 'Challan deleted' });
}));

router.post('/:id/partial-return', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const result = await partialReturnChallanWorkflow(prisma, req.params.id, req.body, { operatorId: req.user.sub });
  res.status(200).json(result);
}));

module.exports = router;
