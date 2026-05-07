const { AppError } = require('../middleware/errorHandler');
const { validateRouteTrace } = require('../lib/validation');
const { createAuditLog } = require('./auditService');

async function createBillRouteTrace(tx, { billId, route, operatorId = null } = {}) {
  const id = Number(billId);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');

  const normalizedRoute = validateRouteTrace(route);
  const bill = await tx.bill.findUnique({ where: { id }, select: { id: true, billNumber: true } });
  if (!bill) throw new AppError(404, 'Bill not found');

  const trace = await tx.deliveryRouteTrace.create({
    data: {
      billId: id,
      operatorId: operatorId || null,
      route: normalizedRoute,
    },
  });

  await createAuditLog(tx, {
    action: 'ROUTE_TRACE_CAPTURED',
    module: 'bills',
    userId: operatorId,
    entityId: String(id),
    newValue: { billNumber: bill.billNumber, points: normalizedRoute.length },
  });

  return { trace, bill };
}

module.exports = {
  createBillRouteTrace,
};
