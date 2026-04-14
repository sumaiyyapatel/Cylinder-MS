/**
 * Transfer Service — Inter-company stock transfers (Patel ↔ Jubilee).
 *
 * Business rules:
 * - Stock movement only — no purchase ledger entries
 * - Maintains source/destination company
 * - Updates cylinder owner codes
 * - Does NOT create bills or sales entries
 */

const { AppError } = require('../middleware/errorHandler');
const { generateTransferNumber } = require('./numberingService');
const { round2 } = require('./businessRules');
const { createAuditLog } = require('./auditService');

const COMPANY_CODES = {
  PATEL: 'POC',
  JUBILEE: 'COC',
};

/**
 * Create an inter-company transfer.
 * Moves stock between Patel (POC) and Jubilee (COC) — no purchase ledger.
 */
async function createTransfer(tx, opts = {}) {
  const {
    transferDate = new Date(),
    sourceCompany,
    destCompany,
    gasCode = null,
    cylindersCount = 0,
    quantityCum = null,
    vehicleNumber = null,
    notes = null,
    operatorId = null,
    cylinderNumbers = [],
  } = opts;

  if (!sourceCompany || !destCompany) {
    throw new AppError(400, 'Source and destination companies are required');
  }

  if (sourceCompany === destCompany) {
    throw new AppError(400, 'Source and destination companies cannot be the same');
  }

  // Validate company codes
  const validCodes = Object.values(COMPANY_CODES);
  if (!validCodes.includes(sourceCompany) && !['PATEL', 'JUBILEE'].includes(sourceCompany.toUpperCase())) {
    throw new AppError(400, `Invalid source company: ${sourceCompany}. Use POC (Patel) or COC (Jubilee)`);
  }
  if (!validCodes.includes(destCompany) && !['PATEL', 'JUBILEE'].includes(destCompany.toUpperCase())) {
    throw new AppError(400, `Invalid destination company: ${destCompany}. Use POC (Patel) or COC (Jubilee)`);
  }

  // Normalize company codes
  const src = COMPANY_CODES[sourceCompany.toUpperCase()] || sourceCompany;
  const dest = COMPANY_CODES[destCompany.toUpperCase()] || destCompany;

  const transferNumber = await generateTransferNumber(tx, transferDate);

  const effectiveCount = cylinderNumbers.length || cylindersCount;

  // If specific cylinders provided, update their owner codes
  if (cylinderNumbers.length > 0) {
    const dbCylinders = await tx.cylinder.findMany({
      where: { cylinderNumber: { in: cylinderNumbers }, isActive: true },
      select: { id: true, cylinderNumber: true, ownerCode: true, status: true },
    });

    const existingSet = new Set(dbCylinders.map((c) => c.cylinderNumber));
    const missing = cylinderNumbers.filter((num) => !existingSet.has(num));
    if (missing.length) {
      throw new AppError(400, `Cylinder(s) not found: ${missing.join(', ')}`);
    }

    // Verify cylinders belong to source company
    const wrongOwner = dbCylinders.filter((c) => c.ownerCode !== src);
    if (wrongOwner.length) {
      throw new AppError(400, `Cylinder(s) don't belong to source ${src}: ${wrongOwner.map((c) => c.cylinderNumber).join(', ')}`);
    }

    // Verify cylinders are in stock
    const notInStock = dbCylinders.filter((c) => c.status !== 'IN_STOCK');
    if (notInStock.length) {
      throw new AppError(400, `Cylinder(s) must be IN_STOCK for transfer: ${notInStock.map((c) => c.cylinderNumber).join(', ')}`);
    }

    // Update owner codes to destination
    for (const cyl of dbCylinders) {
      await tx.cylinder.update({
        where: { id: cyl.id },
        data: { ownerCode: dest },
      });
    }
  }

  // Create the transfer record (stock movement only — NO purchase ledger)
  const transfer = await tx.interCompanyTransfer.create({
    data: {
      transferNumber,
      transferDate,
      sourceCompany: src,
      destCompany: dest,
      gasCode,
      cylindersCount: effectiveCount,
      quantityCum: quantityCum != null ? round2(quantityCum) : null,
      vehicleNumber,
      notes,
      operatorId,
    },
  });

  await createAuditLog(tx, {
    action: 'INTER_COMPANY_TRANSFER',
    module: 'transfers',
    userId: operatorId,
    entityId: String(transfer.id),
    oldValue: null,
    newValue: {
      transferNumber,
      sourceCompany: src,
      destCompany: dest,
      cylindersCount: effectiveCount,
      cylinderNumbers: cylinderNumbers.length ? cylinderNumbers : undefined,
    },
  });

  return transfer;
}

module.exports = { createTransfer, COMPANY_CODES };
