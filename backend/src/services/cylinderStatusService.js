const { AppError } = require("../middleware/errorHandler");

async function updateCylinderStatus(tx, cylinderId, status, options = {}) {
  const data = { status };

  if (options.incrementFillCount) {
    data.fillCount = { increment: 1 };
  }

  return tx.cylinder.update({
    where: { id: cylinderId },
    data,
  });
}

async function assertNoActiveHolding(tx, cylinderId, cylinderNumber) {
  const activeHolding = await tx.cylinderHolding.findFirst({
    where: { cylinderId, status: "HOLDING" },
    select: { id: true },
  });

  if (activeHolding) {
    throw new AppError(409, `Cylinder ${cylinderNumber} is already on active holding`);
  }
}

module.exports = {
  updateCylinderStatus,
  assertNoActiveHolding,
};
