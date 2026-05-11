const { round2, normalizeOwnerCode } = require('./businessRules');

const STOCK_DIRECTIONS = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
};

const STOCK_MOVEMENT_TYPES = new Set(['ISSUE', 'RETURN', 'TRANSFER']);

function getMovementDirection(movementType) {
  if (movementType === 'ISSUE') return STOCK_DIRECTIONS.OUT;
  if (movementType === 'RETURN') return STOCK_DIRECTIONS.IN;
  if (movementType === 'TRANSFER') return STOCK_DIRECTIONS.ADJUSTMENT;
  return null;
}

async function getDefaultWarehouse(tx) {
  const existing = await tx.warehouse.findFirst({
    where: { isDefault: true, isActive: true },
    orderBy: { id: 'asc' },
  });
  if (existing) return existing;

  return tx.warehouse.create({
    data: { code: 'MAIN', name: 'Main Godown', isDefault: true },
  });
}

function normalizeStockKey({ gasCode, ownerCode }) {
  return {
    gasCode: gasCode || null,
    ownerCode: ownerCode ? normalizeOwnerCode(ownerCode) : null,
  };
}

function signedQuantity(direction, quantity) {
  if (direction === STOCK_DIRECTIONS.OUT) return -quantity;
  if (direction === STOCK_DIRECTIONS.IN) return quantity;
  return 0;
}

async function postInventoryMovement(tx, movement) {
  if (!movement || !STOCK_MOVEMENT_TYPES.has(movement.movementType)) return null;

  const direction = getMovementDirection(movement.movementType);
  if (!direction) return null;

  const warehouse = await getDefaultWarehouse(tx);
  const stockKey = normalizeStockKey({
    gasCode: movement.gasCode || movement.cylinder?.gasCode || null,
    ownerCode: movement.ownerCode || movement.cylinder?.ownerCode || null,
  });

  const quantityCyl = Number(movement.quantityCyl || 0);
  const quantityCum = round2(movement.quantityCum || 0);
  const deltaCyl = signedQuantity(direction, quantityCyl);
  const deltaCum = signedQuantity(direction, quantityCum);

  const existingBalance = await tx.inventoryBalance.findFirst({
    where: {
      warehouseId: warehouse.id,
      gasCode: stockKey.gasCode,
      ownerCode: stockKey.ownerCode,
    },
  });

  const nextQuantityCyl = (existingBalance?.quantityCyl || 0) + deltaCyl;
  const nextQuantityCum = round2(Number(existingBalance?.quantityCum || 0) + deltaCum);
  if (quantityCyl > 0 && nextQuantityCyl < 0) {
    throw new Error(`Negative stock blocked for ${stockKey.gasCode || 'UNKNOWN'} / ${stockKey.ownerCode || 'UNKNOWN'}`);
  }
  if (quantityCyl === 0 && quantityCum > 0 && nextQuantityCum < 0) {
    throw new Error(`Negative quantity stock blocked for ${stockKey.gasCode || 'UNKNOWN'} / ${stockKey.ownerCode || 'UNKNOWN'}`);
  }

  let updatedBalance;
  if (existingBalance) {
    updatedBalance = await tx.inventoryBalance.update({
      where: { id: existingBalance.id },
      data: {
        quantityCyl: nextQuantityCyl,
        quantityCum: nextQuantityCum,
      },
    });
  } else {
    updatedBalance = await tx.inventoryBalance.create({
      data: {
        warehouseId: warehouse.id,
        gasCode: stockKey.gasCode,
        ownerCode: stockKey.ownerCode,
        quantityCyl: deltaCyl,
        quantityCum: deltaCum,
      },
    });
  }

  return tx.stockLedger.create({
    data: {
      movementId: movement.id,
      warehouseId: warehouse.id,
      gasCode: stockKey.gasCode,
      ownerCode: stockKey.ownerCode,
      cylinderId: movement.cylinderId || null,
      direction,
      movementDate: movement.movementDate,
      quantityCyl,
      quantityCum,
      balanceCyl: updatedBalance.quantityCyl,
      balanceCum: updatedBalance.quantityCum,
      referenceType: movement.referenceType || null,
      referenceNumber: movement.referenceNumber || null,
      operatorId: movement.operatorId || null,
    },
  });
}

async function rebuildInventoryBalances(tx) {
  const warehouse = await getDefaultWarehouse(tx);
  await tx.inventoryBalance.deleteMany({ where: { warehouseId: warehouse.id } });
  await tx.stockLedger.deleteMany({ where: { warehouseId: warehouse.id } });

  const cylinders = await tx.cylinder.findMany({
    where: { isActive: true, status: { not: 'CONDEMNED' } },
    select: { id: true, gasCode: true, ownerCode: true, capacity: true },
  });
  const opening = new Map();
  for (const cylinder of cylinders) {
    const stockKey = normalizeStockKey({ gasCode: cylinder.gasCode, ownerCode: cylinder.ownerCode });
    const key = `${stockKey.gasCode || ''}|${stockKey.ownerCode || ''}`;
    const bucket = opening.get(key) || { ...stockKey, quantityCyl: 0, quantityCum: 0 };
    bucket.quantityCyl += 1;
    bucket.quantityCum = round2(bucket.quantityCum + Number(cylinder.capacity || 0));
    opening.set(key, bucket);
  }

  for (const bucket of opening.values()) {
    const balance = await tx.inventoryBalance.create({
      data: {
        warehouseId: warehouse.id,
        gasCode: bucket.gasCode,
        ownerCode: bucket.ownerCode,
        quantityCyl: bucket.quantityCyl,
        quantityCum: bucket.quantityCum,
      },
    });
    await tx.stockLedger.create({
      data: {
        warehouseId: warehouse.id,
        gasCode: bucket.gasCode,
        ownerCode: bucket.ownerCode,
        direction: STOCK_DIRECTIONS.ADJUSTMENT,
        movementDate: new Date('2000-01-01T00:00:00.000Z'),
        quantityCyl: bucket.quantityCyl,
        quantityCum: bucket.quantityCum,
        balanceCyl: balance.quantityCyl,
        balanceCum: balance.quantityCum,
        referenceType: 'OPENING',
        referenceNumber: 'OPENING-STOCK',
      },
    });
  }

  const movements = await tx.cylinderMovement.findMany({
    where: { movementType: { in: [...STOCK_MOVEMENT_TYPES] } },
    include: { cylinder: { select: { gasCode: true, ownerCode: true } } },
    orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
  });

  for (const movement of movements) {
    await postInventoryMovement(tx, movement);
  }
}

async function closeDailyStock(tx, closingDate = new Date()) {
  const warehouse = await getDefaultWarehouse(tx);
  const closeDate = new Date(closingDate);
  closeDate.setHours(0, 0, 0, 0);

  const balances = await tx.inventoryBalance.findMany({ where: { warehouseId: warehouse.id } });
  for (const balance of balances) {
    const existing = await tx.dailyClosingStock.findFirst({
      where: {
        closingDate: closeDate,
        warehouseId: warehouse.id,
        gasCode: balance.gasCode,
        ownerCode: balance.ownerCode,
      },
    });
    if (existing) {
      await tx.dailyClosingStock.update({
        where: { id: existing.id },
        data: { quantityCyl: balance.quantityCyl, quantityCum: balance.quantityCum },
      });
    } else {
      await tx.dailyClosingStock.create({
        data: {
          closingDate: closeDate,
          warehouseId: warehouse.id,
          gasCode: balance.gasCode,
          ownerCode: balance.ownerCode,
          quantityCyl: balance.quantityCyl,
          quantityCum: balance.quantityCum,
        },
      });
    }
  }
}

module.exports = {
  STOCK_DIRECTIONS,
  getDefaultWarehouse,
  postInventoryMovement,
  rebuildInventoryBalances,
  closeDailyStock,
};
