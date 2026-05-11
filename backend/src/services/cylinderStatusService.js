const { AppError } = require("../middleware/errorHandler");

const CYLINDER_STATUS = {
  IN_STOCK: "IN_STOCK",
  WITH_CUSTOMER: "WITH_CUSTOMER",
  IN_TRANSIT: "IN_TRANSIT",
  RETURNED: "RETURNED",
  REFILLED: "REFILLED",
  DAMAGED: "DAMAGED",
  UNDER_TEST: "UNDER_TEST",
  CONDEMNED: "CONDEMNED",
};

const ALLOWED_TRANSITIONS = {
  IN_STOCK: ["WITH_CUSTOMER", "IN_TRANSIT", "UNDER_TEST", "DAMAGED", "CONDEMNED"],
  WITH_CUSTOMER: ["RETURNED", "DAMAGED", "CONDEMNED"],
  RETURNED: ["REFILLED", "UNDER_TEST", "DAMAGED", "CONDEMNED", "IN_STOCK"],
  REFILLED: ["WITH_CUSTOMER", "IN_STOCK", "IN_TRANSIT", "UNDER_TEST", "DAMAGED"],
  IN_TRANSIT: ["IN_STOCK", "WITH_CUSTOMER", "DAMAGED"],
  UNDER_TEST: ["IN_STOCK", "CONDEMNED", "DAMAGED"],
  DAMAGED: ["UNDER_TEST", "CONDEMNED", "IN_STOCK"],
  CONDEMNED: [],
};

function assertStatusTransition(currentStatus, nextStatus, cylinderNumber = null) {
  if (currentStatus === nextStatus) return;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const label = cylinderNumber ? `Cylinder ${cylinderNumber}` : "Cylinder";
    throw new AppError(409, `${label} cannot move from ${currentStatus} to ${nextStatus}`);
  }
}

async function updateCylinderStatus(tx, cylinderId, status, options = {}) {
  const cylinder = await tx.cylinder.findUnique({
    where: { id: cylinderId },
    select: { id: true, cylinderNumber: true, status: true },
  });
  if (!cylinder) throw new AppError(404, "Cylinder not found");

  assertStatusTransition(cylinder.status, status, cylinder.cylinderNumber);

  const data = { status };
  if (options.incrementFillCount) data.fillCount = { increment: 1 };

  return tx.cylinder.update({
    where: { id: cylinderId },
    data,
  });
}

async function assertNoActiveHolding(tx, cylinderId, cylinderNumber) {
  const activeHolding = await tx.cylinderHolding.findFirst({
    where: { cylinderId, status: { in: ["HOLDING", "BILLED"] } },
    select: { id: true },
  });

  if (activeHolding) {
    throw new AppError(409, `Cylinder ${cylinderNumber} is already on active holding`);
  }
}

module.exports = {
  CYLINDER_STATUS,
  ALLOWED_TRANSITIONS,
  assertStatusTransition,
  updateCylinderStatus,
  assertNoActiveHolding,
};
