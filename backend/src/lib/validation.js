const { AppError } = require("../middleware/errorHandler");

function parseRequiredInt(value, fieldName) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(400, `${fieldName} must be a non-negative number`);
  }
  return parsed;
}

function parseDate(value, fieldName, { required = false } = {}) {
  if (!value) {
    if (required) throw new AppError(400, `${fieldName} is required`);
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${fieldName} is invalid`);
  }
  return parsed;
}

function parseDateRange(dateFrom, dateTo, fieldName) {
  const from = parseDate(dateFrom, "dateFrom");
  const to = parseDate(dateTo, "dateTo");

  if (from && to && from > to) {
    throw new AppError(400, "dateFrom must be <= dateTo");
  }

  if (!from && !to) return {};

  const range = {};
  if (from) range.gte = from;
  if (to) {
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    range.lte = end;
  }

  return { [fieldName]: range };
}

function validateGstin(value, fieldName = "gstin") {
  if (value === undefined || value === null || value === "") return null;

  const normalized = String(value).trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalized)) {
    throw new AppError(400, `${fieldName} must be a valid GSTIN`);
  }

  return normalized;
}

function validateCylinderNumber(value, fieldName = "cylinderNumber") {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    throw new AppError(400, `${fieldName} is required`);
  }
  if (!/^[A-Z0-9\/-]{3,30}$/.test(normalized)) {
    throw new AppError(400, `${fieldName} format is invalid`);
  }
  return normalized;
}

function validateCylinderNumbersUnique(numbers) {
  const seen = new Set();
  const duplicates = [];

  for (const number of numbers) {
    if (seen.has(number)) duplicates.push(number);
    seen.add(number);
  }

  if (duplicates.length) {
    throw new AppError(400, `Duplicate cylinder numbers in request: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function validateGstRate(value, fieldName = "gstRate") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new AppError(400, `${fieldName} must be between 0 and 100`);
  }
  return parsed;
}

module.exports = {
  parseRequiredInt,
  parseOptionalNonNegativeNumber,
  parseDate,
  parseDateRange,
  validateGstin,
  validateCylinderNumber,
  validateCylinderNumbersUnique,
  validateGstRate,
};
