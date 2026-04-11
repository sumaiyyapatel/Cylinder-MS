const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { round2 } = require('../services/businessRules');
const { generateChallanNumber } = require('../services/numberingService');
const { createAuditLog } = require('../services/auditService');
const { parseOptionalNonNegativeNumber, parseDate } = require('../lib/validation');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, page = 1, limit = 50 } = req.query;
  const where = {};
  if (customerId) where.customerId = parseInt(customerId, 10);
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [challans, total] = await Promise.all([
    prisma.challan.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { challanDate: 'desc' },
      include: { customer: { select: { id: true, code: true, name: true } } },
    }),
    prisma.challan.count({ where }),
  ]);
  res.json({ data: challans, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const customerIdValue = parseOptionalNonNegativeNumber(req.body.customerId, 'customerId');
  const customerId = customerIdValue == null ? null : Math.trunc(customerIdValue);
  if (!customerId || customerId <= 0) {
    throw new AppError(400, 'customerId must be a positive integer');
  }
  const challanDate = parseDate(req.body.challanDate, 'challanDate') || new Date();
  const quantityCum = parseOptionalNonNegativeNumber(req.body.quantityCum, 'quantityCum');
  const cylindersCountValue = parseOptionalNonNegativeNumber(req.body.cylindersCount, 'cylindersCount');
  const cylindersCount = cylindersCountValue == null ? 0 : Math.trunc(cylindersCountValue);
  const linkedBillIdValue = parseOptionalNonNegativeNumber(req.body.linkedBillId, 'linkedBillId');
  const linkedBillId = linkedBillIdValue == null ? null : Math.trunc(linkedBillIdValue);

  if (cylindersCount < 0) {
    throw new AppError(400, 'cylindersCount cannot be negative');
  }
  if (linkedBillId != null && linkedBillId <= 0) {
    throw new AppError(400, 'linkedBillId must be a positive integer');
  }

  const challan = await prisma.$transaction(async (tx) => {
    const challanNumber = await generateChallanNumber(tx, challanDate);
    const created = await tx.challan.create({
      data: {
        challanNumber,
        challanDate,
        customerId,
        cylinderOwner: req.body.cylinderOwner,
        cylindersCount,
        quantityCum: quantityCum == null ? null : round2(quantityCum),
        vehicleNumber: req.body.vehicleNumber,
        transactionType: req.body.transactionType || 'DELIVERY',
        linkedBillId,
        operatorId: req.user.sub,
      },
    });

    await createAuditLog(tx, {
      action: 'CREATE_CHALLAN',
      module: 'challans',
      userId: req.user.sub,
      entityId: String(created.id),
      oldValue: null,
      newValue: { challanNumber: created.challanNumber, customerId: created.customerId },
    });

    return created;
  });

  res.status(201).json(challan);
}));

module.exports = router;
