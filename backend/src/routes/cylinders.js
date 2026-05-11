const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../services/auditService');
const { calculateHoldDays } = require('../services/businessRules');
const { updateCylinderStatus } = require('../services/cylinderStatusService');

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

router.get('/:id/timeline', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid cylinder id');

  const cylinder = await prisma.cylinder.findUnique({
    where: { id },
    include: { gasType: true },
  });
  if (!cylinder || !cylinder.isActive) throw new AppError(404, 'Cylinder not found');

  const [movements, holdings, ecrs] = await Promise.all([
    prisma.cylinderMovement.findMany({
      where: { cylinderId: id },
      orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true } } },
    }),
    prisma.cylinderHolding.findMany({
      where: { cylinderId: id },
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      include: {
        customer: { select: { id: true, code: true, name: true } },
        transaction: { select: { billNumber: true, billDate: true, transactionCode: true } },
        challan: { select: { challanNumber: true, challanDate: true } },
      },
    }),
    prisma.ecrRecord.findMany({
      where: { cylinderNumber: cylinder.cylinderNumber },
      orderBy: [{ ecrDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  const events = [
    {
      type: 'CREATED',
      label: 'Cylinder created',
      date: cylinder.createdAt,
      detail: `${cylinder.ownerCode} / ${cylinder.gasCode || '-'}`,
      status: cylinder.status,
    },
  ];

  const hasHydroMovement = movements.some((movement) => movement.movementType === 'HYDRO_TESTED');
  if (cylinder.hydroTestDate && !hasHydroMovement) {
    events.push({
      type: 'HYDRO_TESTED',
      label: 'Hydro tested',
      date: cylinder.hydroTestDate,
      detail: cylinder.nextTestDue ? `Next due ${cylinder.nextTestDue.toISOString()}` : 'Hydro test completed',
      status: 'UNDER_TEST',
    });
  }

  if (movements.length) {
    for (const movement of movements) {
      const labels = {
        ISSUE: 'Issued',
        RETURN: 'Returned',
        TRANSFER: 'Transferred',
        HYDRO_TESTED: 'Hydro tested',
        STATUS_CHANGE: 'Status changed',
      };
      events.push({
        type: movement.movementType,
        label: labels[movement.movementType] || movement.movementType.replace(/_/g, ' '),
        date: movement.movementDate,
        detail: movement.referenceNumber || movement.referenceType || '-',
        customer: movement.customer,
        status: movement.statusAfter || movement.statusBefore || null,
        holdDays: null,
      });
    }
  } else {
    for (const holding of holdings) {
      events.push({
        type: holding.challanId ? 'CHALLAN_ISSUED' : 'ISSUED',
        label: holding.challanId ? 'Issued on challan' : 'Issued on bill',
        date: holding.issuedAt,
        detail: holding.transaction?.billNumber || holding.challan?.challanNumber || '-',
        customer: holding.customer,
        status: holding.status,
        holdDays: calculateHoldDays(holding.issuedAt, holding.returnedAt || new Date()),
      });

      if (holding.returnedAt) {
        events.push({
          type: 'RETURNED',
          label: 'Returned',
          date: holding.returnedAt,
          detail: holding.rentAmount ? `Rent ${holding.rentAmount}` : 'Returned to stock',
          customer: holding.customer,
          status: 'RETURNED',
          holdDays: holding.holdDays || calculateHoldDays(holding.issuedAt, holding.returnedAt),
        });
      }
    }

    for (const ecr of ecrs) {
      events.push({
        type: 'ECR',
        label: 'ECR posted',
        date: ecr.ecrDate,
        detail: `${ecr.ecrNumber}${ecr.rentAmount ? ` / rent ${ecr.rentAmount}` : ''}`,
        customer: ecr.customer,
        status: 'RETURNED',
        holdDays: ecr.holdDays || null,
      });
    }
  }

  if (['DAMAGED', 'CONDEMNED', 'UNDER_TEST'].includes(cylinder.status)) {
    events.push({
      type: cylinder.status,
      label: cylinder.status.replace(/_/g, ' '),
      date: new Date(),
      detail: 'Current cylinder state',
      status: cylinder.status,
    });
  }

  events.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  res.json({
    cylinder,
    summary: {
      totalIssues: movements.length ? movements.filter((movement) => movement.movementType === 'ISSUE').length : holdings.length,
      totalReturns: movements.length ? movements.filter((movement) => movement.movementType === 'RETURN').length : ecrs.length,
      currentStatus: cylinder.status,
      lastEvent: events[0] || null,
    },
    events,
  });
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

router.post('/:id/refill', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await prisma.$transaction(async (tx) => {
    const cylinder = await updateCylinderStatus(tx, id, 'REFILLED');
    await createAuditLog(tx, {
      action: 'CYLINDER_REFILLED',
      module: 'cylinders',
      userId: req.user.sub,
      entityId: String(id),
      newValue: { cylinderNumber: cylinder.cylinderNumber, status: cylinder.status },
    });
    return cylinder;
  });
  res.json(updated);
}));

// PUT /api/cylinders/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, ...data } = req.body;
  const cylinder = await prisma.$transaction(async (tx) => {
    let updated = await tx.cylinder.update({ where: { id }, data });
    if (status && status !== updated.status) {
      updated = await updateCylinderStatus(tx, id, status);
    }
    return updated;
  });
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
