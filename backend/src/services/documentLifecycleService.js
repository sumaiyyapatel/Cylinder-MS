const { AppError } = require('../middleware/errorHandler');
const { createAuditLog } = require('./auditService');
const { emitDomainEvent } = require('./domainEventService');

const DOCUMENT_STATUSES = {
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
};

const MODEL_BY_TYPE = {
  bill: 'bill',
  challan: 'challan',
  payment: 'payment',
  ecr: 'ecrRecord',
};

function getModel(tx, documentType) {
  const modelName = MODEL_BY_TYPE[documentType];
  if (!modelName || !tx[modelName]) throw new Error(`Unsupported document type: ${documentType}`);
  return tx[modelName];
}

async function getDocument(tx, documentType, id) {
  const documentId = Number(id);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    throw new AppError(400, `Invalid ${documentType} id`);
  }

  const document = await getModel(tx, documentType).findUnique({ where: { id: documentId } });
  if (!document || document.isDeleted) throw new AppError(404, `${documentType} not found`);
  return document;
}

function assertMutable(document, label = 'Document') {
  if (!document) throw new AppError(404, `${label} not found`);
  if (document.isDeleted) throw new AppError(409, `${label} is deleted`);
  if ([DOCUMENT_STATUSES.CANCELLED, DOCUMENT_STATUSES.REVERSED].includes(document.documentStatus)) {
    throw new AppError(409, `${label} is ${document.documentStatus.toLowerCase()}`);
  }
}

function assertDraft(document, label = 'Document') {
  assertMutable(document, label);
  if (document.documentStatus !== DOCUMENT_STATUSES.DRAFT) {
    throw new AppError(409, `${label} is finalized and cannot be edited`);
  }
}

async function finalizeDocument(tx, documentType, id, { operatorId = null, payload = {} } = {}) {
  const document = await getDocument(tx, documentType, id);
  assertMutable(document, documentType);
  if (document.documentStatus === DOCUMENT_STATUSES.FINALIZED) return document;

  const updated = await getModel(tx, documentType).update({
    where: { id: document.id },
    data: { documentStatus: DOCUMENT_STATUSES.FINALIZED, finalizedAt: new Date() },
  });

  await createAuditLog(tx, {
    action: `${documentType.toUpperCase()}_FINALIZED`,
    module: documentType,
    userId: operatorId,
    entityId: String(document.id),
    oldValue: { documentStatus: document.documentStatus },
    newValue: { documentStatus: updated.documentStatus },
  });
  await emitDomainEvent(tx, {
    eventType: `${documentType[0].toUpperCase()}${documentType.slice(1)}Finalized`,
    aggregateType: documentType,
    aggregateId: document.id,
    payload,
    operatorId,
  });

  return updated;
}

async function cancelDocument(tx, documentType, id, { operatorId = null, reason = null, softDelete = true } = {}) {
  const document = await getDocument(tx, documentType, id);
  assertMutable(document, documentType);

  const updated = await getModel(tx, documentType).update({
    where: { id: document.id },
    data: {
      documentStatus: DOCUMENT_STATUSES.CANCELLED,
      cancelledAt: new Date(),
      isDeleted: softDelete,
      deletedAt: softDelete ? new Date() : null,
      deletedBy: softDelete ? operatorId || null : null,
    },
  });

  await createAuditLog(tx, {
    action: `${documentType.toUpperCase()}_CANCELLED`,
    module: documentType,
    userId: operatorId,
    entityId: String(document.id),
    oldValue: { documentStatus: document.documentStatus, isDeleted: document.isDeleted },
    newValue: { documentStatus: updated.documentStatus, isDeleted: updated.isDeleted, reason },
  });
  await emitDomainEvent(tx, {
    eventType: `${documentType[0].toUpperCase()}${documentType.slice(1)}Cancelled`,
    aggregateType: documentType,
    aggregateId: document.id,
    payload: { reason },
    operatorId,
  });

  return updated;
}

async function reverseDocument(tx, documentType, id, { operatorId = null, reason = null } = {}) {
  const document = await getDocument(tx, documentType, id);
  assertMutable(document, documentType);

  const updated = await getModel(tx, documentType).update({
    where: { id: document.id },
    data: {
      documentStatus: DOCUMENT_STATUSES.REVERSED,
      reversedAt: new Date(),
    },
  });

  await createAuditLog(tx, {
    action: `${documentType.toUpperCase()}_REVERSED`,
    module: documentType,
    userId: operatorId,
    entityId: String(document.id),
    oldValue: { documentStatus: document.documentStatus },
    newValue: { documentStatus: updated.documentStatus, reason },
  });
  await emitDomainEvent(tx, {
    eventType: `${documentType[0].toUpperCase()}${documentType.slice(1)}Reversed`,
    aggregateType: documentType,
    aggregateId: document.id,
    payload: { reason },
    operatorId,
  });

  return updated;
}

module.exports = {
  DOCUMENT_STATUSES,
  assertMutable,
  assertDraft,
  getDocument,
  finalizeDocument,
  cancelDocument,
  reverseDocument,
};
