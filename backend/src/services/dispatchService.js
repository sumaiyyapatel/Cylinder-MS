const { AppError } = require('../middleware/errorHandler');
const { validateRouteTrace } = require('../lib/validation');
const { createAuditLog } = require('./auditService');
const { emitDomainEvent } = require('./domainEventService');
const { generateDispatchNumber } = require('./numberingService');

const ACTIVE_DISPATCH_STATUSES = ['PLANNED', 'ASSIGNED', 'LOADED', 'OUT_FOR_DELIVERY'];
const VALID_SOURCE_TYPES = new Set(['ORDER', 'CHALLAN']);

function parsePositiveId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `${fieldName} must be a positive integer`);
  }
  return id;
}

function normalizeSourceType(value) {
  const sourceType = String(value || '').trim().toUpperCase();
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    throw new AppError(400, 'sourceType must be ORDER or CHALLAN');
  }
  return sourceType;
}

function normalizeItemRefs(itemRefs) {
  if (!Array.isArray(itemRefs) || itemRefs.length === 0) return [];

  const seen = new Set();
  return itemRefs.map((item, index) => {
    const sourceType = normalizeSourceType(item.sourceType);
    const sourceId = parsePositiveId(item.sourceId, `items[${index}].sourceId`);
    const key = `${sourceType}:${sourceId}`;
    if (seen.has(key)) throw new AppError(400, `Duplicate dispatch item ${key}`);
    seen.add(key);
    return { sourceType, sourceId };
  });
}

function mapOrderSource(order) {
  return {
    sourceType: 'ORDER',
    sourceId: order.id,
    refNumber: order.orderNumber,
    date: order.orderDate,
    customerId: order.customerId,
    customer: order.customer,
    gasCode: order.gasCode,
    ownerCode: order.ownerCode,
    quantityCyl: order.quantityCyl,
    quantityCum: order.quantityCum,
    status: order.status,
  };
}

function mapChallanSource(challan) {
  return {
    sourceType: 'CHALLAN',
    sourceId: challan.id,
    refNumber: challan.challanNumber,
    date: challan.challanDate,
    customerId: challan.customerId,
    customer: challan.customer,
    gasCode: challan.gasCode,
    ownerCode: challan.cylinderOwner,
    quantityCyl: challan.cylindersCount,
    quantityCum: challan.quantityCum,
    status: challan.status,
  };
}

function mapDispatchRun(run) {
  return {
    id: run.id,
    dispatchNumber: run.dispatchNumber,
    dispatchDate: run.dispatchDate,
    status: run.status,
    driverName: run.driverName,
    driverPhone: run.driverPhone,
    vehicleNumber: run.vehicleNumber,
    areaCode: run.areaCode,
    notes: run.notes,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    items: (run.items || []).map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      refNumber: item.refNumber,
      sequence: item.sequence,
      status: item.status,
      deliveredAt: item.deliveredAt,
      returnedAt: item.returnedAt,
      notes: item.notes,
      customer: item.customer,
    })),
  };
}

async function getAssignedSourceKeys(db) {
  const assigned = await db.dispatchItem.findMany({
    where: {
      status: { in: ACTIVE_DISPATCH_STATUSES },
      dispatch: { status: { in: ACTIVE_DISPATCH_STATUSES } },
    },
    select: { sourceType: true, sourceId: true },
  });
  return new Set(assigned.map((item) => `${item.sourceType}:${item.sourceId}`));
}

async function getOpenDispatchSources(db, { areaCode = null, limit = 30, excludeAssigned = true } = {}) {
  const assignedKeys = excludeAssigned ? await getAssignedSourceKeys(db) : new Set();
  const customerWhere = areaCode ? { areaCode } : undefined;

  const [orders, challans] = await Promise.all([
    db.order.findMany({
      where: {
        status: 'ACTIVE',
        ...(customerWhere ? { customer: customerWhere } : {}),
      },
      take: limit,
      orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    }),
    db.challan.findMany({
      where: {
        status: 'OPEN',
        isDeleted: false,
        ...(customerWhere ? { customer: customerWhere } : {}),
      },
      take: limit,
      orderBy: [{ challanDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    }),
  ]);

  return [
    ...orders.map(mapOrderSource),
    ...challans.map(mapChallanSource),
  ]
    .filter((source) => !assignedKeys.has(`${source.sourceType}:${source.sourceId}`))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .slice(0, limit);
}

async function loadSource(db, { sourceType, sourceId }) {
  if (sourceType === 'ORDER') {
    const order = await db.order.findUnique({
      where: { id: sourceId },
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    });
    if (!order) throw new AppError(404, `Order ${sourceId} not found`);
    if (order.status !== 'ACTIVE') throw new AppError(409, `${order.orderNumber} is not active`);
    return mapOrderSource(order);
  }

  const challan = await db.challan.findUnique({
    where: { id: sourceId },
    include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
  });
  if (!challan) throw new AppError(404, `Challan ${sourceId} not found`);
  if (challan.isDeleted || challan.documentStatus === 'CANCELLED' || challan.documentStatus === 'REVERSED') {
    throw new AppError(409, `${challan.challanNumber} is not dispatchable`);
  }
  if (challan.status !== 'OPEN') throw new AppError(409, `${challan.challanNumber} is not open`);
  return mapChallanSource(challan);
}

async function assertNotAlreadyAssigned(db, sourceItems) {
  const conditions = sourceItems.map((source) => ({
    sourceType: source.sourceType,
    sourceId: source.sourceId,
  }));
  if (!conditions.length) return;

  const existing = await db.dispatchItem.findFirst({
    where: {
      OR: conditions,
      status: { in: ACTIVE_DISPATCH_STATUSES },
      dispatch: { status: { in: ACTIVE_DISPATCH_STATUSES } },
    },
    select: { refNumber: true },
  });

  if (existing) {
    throw new AppError(409, `${existing.refNumber} is already in an active dispatch run`);
  }
}

async function createDispatchRun(db, payload = {}, { operatorId = null } = {}) {
  const itemRefs = normalizeItemRefs(payload.items || payload.itemRefs);
  const dispatchDate = payload.dispatchDate ? new Date(payload.dispatchDate) : new Date();
  if (Number.isNaN(dispatchDate.getTime())) throw new AppError(400, 'dispatchDate is invalid');

  return db.$transaction(async (tx) => {
    const sourceItems = itemRefs.length
      ? await Promise.all(itemRefs.map((item) => loadSource(tx, item)))
      : await getOpenDispatchSources(tx, {
        areaCode: payload.areaCode || null,
        limit: Number(payload.limit) || 12,
        excludeAssigned: true,
      });

    if (!sourceItems.length) throw new AppError(400, 'No dispatchable items selected');
    await assertNotAlreadyAssigned(tx, sourceItems);

    const dispatchNumber = await generateDispatchNumber(tx, dispatchDate);
    const hasAssignment = Boolean(payload.driverName || payload.vehicleNumber);
    const run = await tx.dispatchRun.create({
      data: {
        dispatchNumber,
        dispatchDate,
        status: hasAssignment ? 'ASSIGNED' : 'PLANNED',
        driverName: payload.driverName ? String(payload.driverName).trim() : null,
        driverPhone: payload.driverPhone ? String(payload.driverPhone).trim() : null,
        vehicleNumber: payload.vehicleNumber ? String(payload.vehicleNumber).trim().toUpperCase() : null,
        areaCode: payload.areaCode ? String(payload.areaCode).trim().toUpperCase() : null,
        notes: payload.notes ? String(payload.notes).trim() : null,
        operatorId: operatorId || null,
        items: {
          create: sourceItems.map((item, index) => ({
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            refNumber: item.refNumber,
            customerId: item.customerId,
            sequence: index + 1,
            status: hasAssignment ? 'ASSIGNED' : 'PLANNED',
          })),
        },
      },
      include: {
        items: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
        },
      },
    });

    await createAuditLog(tx, {
      action: 'DISPATCH_RUN_CREATED',
      module: 'operations',
      userId: operatorId,
      entityId: String(run.id),
      newValue: { dispatchNumber, items: sourceItems.map((item) => item.refNumber) },
    });
    await emitDomainEvent(tx, {
      eventType: 'DispatchPlanned',
      aggregateType: 'DispatchRun',
      aggregateId: run.id,
      payload: { dispatchNumber, status: run.status, items: sourceItems.map((item) => item.refNumber) },
      operatorId,
    });

    return mapDispatchRun(run);
  });
}

async function assignDispatchRun(db, dispatchId, payload = {}, { operatorId = null } = {}) {
  const id = parsePositiveId(dispatchId, 'dispatchId');
  return db.$transaction(async (tx) => {
    const run = await tx.dispatchRun.findUnique({ where: { id } });
    if (!run) throw new AppError(404, 'Dispatch run not found');
    if (!['PLANNED', 'ASSIGNED'].includes(run.status)) {
      throw new AppError(409, `${run.dispatchNumber} cannot be assigned from ${run.status}`);
    }

    const updated = await tx.dispatchRun.update({
      where: { id },
      data: {
        status: 'ASSIGNED',
        driverName: payload.driverName ? String(payload.driverName).trim() : run.driverName,
        driverPhone: payload.driverPhone ? String(payload.driverPhone).trim() : run.driverPhone,
        vehicleNumber: payload.vehicleNumber ? String(payload.vehicleNumber).trim().toUpperCase() : run.vehicleNumber,
      },
      include: {
        items: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
        },
      },
    });

    await tx.dispatchItem.updateMany({
      where: { dispatchId: id, status: 'PLANNED' },
      data: { status: 'ASSIGNED' },
    });
    await createAuditLog(tx, {
      action: 'DISPATCH_RUN_ASSIGNED',
      module: 'operations',
      userId: operatorId,
      entityId: String(id),
      oldValue: { status: run.status, driverName: run.driverName, vehicleNumber: run.vehicleNumber },
      newValue: { status: 'ASSIGNED', driverName: updated.driverName, vehicleNumber: updated.vehicleNumber },
    });
    await emitDomainEvent(tx, {
      eventType: 'DispatchAssigned',
      aggregateType: 'DispatchRun',
      aggregateId: id,
      payload: { dispatchNumber: updated.dispatchNumber, driverName: updated.driverName, vehicleNumber: updated.vehicleNumber },
      operatorId,
    });

    return mapDispatchRun(updated);
  });
}

async function startDispatchRun(db, dispatchId, { operatorId = null } = {}) {
  const id = parsePositiveId(dispatchId, 'dispatchId');
  return db.$transaction(async (tx) => {
    const run = await tx.dispatchRun.findUnique({ where: { id } });
    if (!run) throw new AppError(404, 'Dispatch run not found');
    if (!['PLANNED', 'ASSIGNED', 'LOADED'].includes(run.status)) {
      throw new AppError(409, `${run.dispatchNumber} cannot be started from ${run.status}`);
    }

    await tx.dispatchItem.updateMany({
      where: { dispatchId: id, status: { in: ['PLANNED', 'ASSIGNED', 'LOADED'] } },
      data: { status: 'OUT_FOR_DELIVERY' },
    });

    const updated = await tx.dispatchRun.update({
      where: { id },
      data: {
        status: 'OUT_FOR_DELIVERY',
        startedAt: run.startedAt || new Date(),
      },
      include: {
        items: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
        },
      },
    });

    await createAuditLog(tx, {
      action: 'DISPATCH_RUN_STARTED',
      module: 'operations',
      userId: operatorId,
      entityId: String(id),
      oldValue: { status: run.status },
      newValue: { status: 'OUT_FOR_DELIVERY' },
    });
    await emitDomainEvent(tx, {
      eventType: 'DispatchStarted',
      aggregateType: 'DispatchRun',
      aggregateId: id,
      payload: { dispatchNumber: updated.dispatchNumber },
      operatorId,
    });

    return mapDispatchRun(updated);
  });
}

async function completeDispatchItem(db, itemId, payload = {}, { operatorId = null } = {}) {
  const id = parsePositiveId(itemId, 'itemId');
  return db.$transaction(async (tx) => {
    const item = await tx.dispatchItem.findUnique({
      where: { id },
      include: { dispatch: true },
    });
    if (!item) throw new AppError(404, 'Dispatch item not found');
    if (!ACTIVE_DISPATCH_STATUSES.includes(item.status)) {
      throw new AppError(409, `${item.refNumber} cannot be completed from ${item.status}`);
    }
    if (!ACTIVE_DISPATCH_STATUSES.includes(item.dispatch.status)) {
      throw new AppError(409, `${item.dispatch.dispatchNumber} is not active`);
    }

    const completedAt = payload.completedAt ? new Date(payload.completedAt) : new Date();
    if (Number.isNaN(completedAt.getTime())) throw new AppError(400, 'completedAt is invalid');

    const updated = await tx.dispatchItem.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        deliveredAt: completedAt,
        returnedAt: payload.returnedAt ? new Date(payload.returnedAt) : null,
        notes: payload.notes ? String(payload.notes).trim() : item.notes,
      },
      include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
    });

    await createAuditLog(tx, {
      action: 'DISPATCH_ITEM_COMPLETED',
      module: 'operations',
      userId: operatorId,
      entityId: String(id),
      oldValue: { status: item.status },
      newValue: { status: 'COMPLETED', refNumber: item.refNumber },
    });
    await emitDomainEvent(tx, {
      eventType: 'DispatchItemCompleted',
      aggregateType: 'DispatchItem',
      aggregateId: id,
      payload: { dispatchNumber: item.dispatch.dispatchNumber, refNumber: item.refNumber },
      operatorId,
    });

    return updated;
  });
}

async function completeDispatchRun(db, dispatchId, { operatorId = null } = {}) {
  const id = parsePositiveId(dispatchId, 'dispatchId');
  return db.$transaction(async (tx) => {
    const run = await tx.dispatchRun.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!run) throw new AppError(404, 'Dispatch run not found');
    if (!ACTIVE_DISPATCH_STATUSES.includes(run.status)) {
      throw new AppError(409, `${run.dispatchNumber} cannot be completed from ${run.status}`);
    }
    if (!run.items.length) throw new AppError(409, `${run.dispatchNumber} has no dispatch items`);

    const pending = run.items.filter((item) => item.status !== 'COMPLETED');
    if (pending.length) {
      throw new AppError(409, `Complete pending dispatch items first: ${pending.map((item) => item.refNumber).join(', ')}`);
    }

    const updated = await tx.dispatchRun.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        items: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
        },
      },
    });

    await createAuditLog(tx, {
      action: 'DISPATCH_RUN_COMPLETED',
      module: 'operations',
      userId: operatorId,
      entityId: String(id),
      oldValue: { status: run.status },
      newValue: { status: 'COMPLETED' },
    });
    await emitDomainEvent(tx, {
      eventType: 'DispatchCompleted',
      aggregateType: 'DispatchRun',
      aggregateId: id,
      payload: { dispatchNumber: updated.dispatchNumber },
      operatorId,
    });

    const reconciliation = await getDispatchReconciliation(tx, id);
    return { run: mapDispatchRun(updated), reconciliation };
  });
}

async function recordDispatchRouteTrace(db, dispatchId, route, { operatorId = null } = {}) {
  const id = parsePositiveId(dispatchId, 'dispatchId');
  const normalizedRoute = validateRouteTrace(route);

  return db.$transaction(async (tx) => {
    const run = await tx.dispatchRun.findUnique({
      where: { id },
      select: { id: true, dispatchNumber: true },
    });
    if (!run) throw new AppError(404, 'Dispatch run not found');

    const trace = await tx.dispatchRouteTrace.create({
      data: {
        dispatchId: id,
        operatorId: operatorId || null,
        route: normalizedRoute,
      },
    });

    await createAuditLog(tx, {
      action: 'DISPATCH_ROUTE_CAPTURED',
      module: 'operations',
      userId: operatorId,
      entityId: String(id),
      newValue: { dispatchNumber: run.dispatchNumber, points: normalizedRoute.length },
    });

    return trace;
  });
}

async function getDispatchReconciliation(db, dispatchId) {
  const id = parsePositiveId(dispatchId, 'dispatchId');
  const run = await db.dispatchRun.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
      },
    },
  });
  if (!run) throw new AppError(404, 'Dispatch run not found');

  const challanItemIds = run.items
    .filter((item) => item.sourceType === 'CHALLAN')
    .map((item) => item.sourceId);

  const [challans, holdings] = await Promise.all([
    challanItemIds.length
      ? db.challan.findMany({
        where: { id: { in: challanItemIds } },
        select: { id: true, challanNumber: true, cylindersCount: true, customerId: true },
      })
      : [],
    challanItemIds.length
      ? db.cylinderHolding.findMany({
        where: { challanId: { in: challanItemIds } },
        select: { challanId: true, customerId: true, status: true },
      })
      : [],
  ]);

  const challanById = new Map(challans.map((challan) => [challan.id, challan]));
  const holdingStats = new Map();
  for (const holding of holdings) {
    const stats = holdingStats.get(holding.challanId) || { issued: 0, returned: 0, wrongCustomer: 0 };
    stats.issued += 1;
    if (holding.status === 'RETURNED') stats.returned += 1;
    const challan = challanById.get(holding.challanId);
    if (challan && holding.customerId !== challan.customerId) stats.wrongCustomer += 1;
    holdingStats.set(holding.challanId, stats);
  }

  return {
    dispatchNumber: run.dispatchNumber,
    status: run.status,
    rows: run.items.map((item) => {
      if (item.sourceType !== 'CHALLAN') {
        return {
          itemId: item.id,
          refNumber: item.refNumber,
          sourceType: item.sourceType,
          customer: item.customer,
          issueQty: 0,
          returnedQty: 0,
          missingReturnQty: 0,
          wrongCustomerQty: 0,
          status: 'ORDER_ONLY',
        };
      }

      const challan = challanById.get(item.sourceId);
      const stats = holdingStats.get(item.sourceId) || { issued: 0, returned: 0, wrongCustomer: 0 };
      const issueQty = Math.max(Number(challan?.cylindersCount || 0), stats.issued);
      const missingReturnQty = Math.max(issueQty - stats.returned, 0);
      const status = stats.wrongCustomer > 0
        ? 'WRONG_CUSTOMER_RETURN'
        : missingReturnQty > 0
          ? 'MISSING_RETURN'
          : 'MATCHED';

      return {
        itemId: item.id,
        refNumber: item.refNumber,
        sourceType: item.sourceType,
        customer: item.customer,
        issueQty,
        returnedQty: stats.returned,
        missingReturnQty,
        wrongCustomerQty: stats.wrongCustomer,
        status,
      };
    }),
  };
}

async function getDispatchBoard(db) {
  const [runs, unassignedQueue] = await Promise.all([
    db.dispatchRun.findMany({
      where: { status: { in: ACTIVE_DISPATCH_STATUSES } },
      orderBy: [{ dispatchDate: 'asc' }, { id: 'asc' }],
      include: {
        items: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, code: true, name: true, areaCode: true } } },
        },
      },
    }),
    getOpenDispatchSources(db, { limit: 30, excludeAssigned: true }),
  ]);

  return {
    activeRuns: runs.map(mapDispatchRun),
    unassignedQueue,
  };
}

module.exports = {
  ACTIVE_DISPATCH_STATUSES,
  createDispatchRun,
  assignDispatchRun,
  startDispatchRun,
  completeDispatchItem,
  completeDispatchRun,
  recordDispatchRouteTrace,
  getDispatchReconciliation,
  getDispatchBoard,
  getOpenDispatchSources,
};
