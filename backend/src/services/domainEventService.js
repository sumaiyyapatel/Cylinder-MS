async function emitDomainEvent(tx, {
  eventType,
  aggregateType,
  aggregateId,
  payload = {},
  operatorId = null,
} = {}) {
  if (!eventType) throw new Error('eventType is required');
  if (!aggregateType) throw new Error('aggregateType is required');
  if (aggregateId == null) throw new Error('aggregateId is required');

  return tx.domainEvent.create({
    data: {
      eventType,
      aggregateType,
      aggregateId: String(aggregateId),
      payload,
      operatorId: operatorId || null,
    },
  });
}

module.exports = {
  emitDomainEvent,
};
