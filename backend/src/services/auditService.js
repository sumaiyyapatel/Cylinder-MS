async function createAuditLog(tx, payload) {
  const {
    action,
    module,
    userId = null,
    entityId = null,
    oldValue = null,
    newValue = null,
  } = payload;

  return tx.auditLog.create({
    data: {
      action,
      module,
      userId,
      entityId,
      oldValue,
      newValue,
    },
  });
}

module.exports = {
  createAuditLog,
};
