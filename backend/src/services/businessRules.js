function getFinancialYearCode(date = new Date()) {
  const dt = new Date(date);
  const year = dt.getFullYear();
  const month = dt.getMonth(); // 0-11
  const fyStartYear = month >= 3 ? year : year - 1; // FY starts in April
  return fyStartYear.toString().slice(-2);
}

function atStartOfDay(date) {
  const dt = new Date(date);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// Excluding issue date and including return date for date-only values.
function calculateHoldDays(issueDate, returnDate) {
  const issued = atStartOfDay(issueDate);
  const returned = atStartOfDay(returnDate);
  const diffMs = returned.getTime() - issued.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function round2(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function normalizeOwnerCode(ownerCode) {
  const code = String(ownerCode || "").toUpperCase();
  if (code === "JU") return "COC";
  if (code === "PO") return "POC";
  return code;
}

function isPocOwner(ownerCode) {
  const code = normalizeOwnerCode(ownerCode);
  return code === "POC" || code.startsWith("PO");
}

function isHydroTestOverdue(cylinder, onDate = new Date()) {
  if (!cylinder?.nextTestDue) return false;
  return atStartOfDay(onDate) > atStartOfDay(cylinder.nextTestDue);
}

function addYears(date, years) {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setFullYear(dt.getFullYear() + years);
  return dt;
}

function deriveNextHydroDueDate(cylinder) {
  if (!cylinder) return null;
  if (cylinder.nextTestDue) return new Date(cylinder.nextTestDue);
  if (!cylinder.hydroTestDate) return null;
  return addYears(cylinder.hydroTestDate, 5);
}

function getGstinStateCode(gstin) {
  if (!gstin) return null;
  const clean = String(gstin).trim().toUpperCase();
  const match = clean.match(/^(\d{2})[A-Z0-9]{13}$/);
  if (!match) return null;
  return match[1];
}

function getGstMode(companyGstin, customerGstin) {
  const companyState = getGstinStateCode(companyGstin);
  const customerState = getGstinStateCode(customerGstin);

  // If GSTIN is missing/invalid on either side, default to intra-state
  // to preserve backward compatibility with legacy entries.
  if (!companyState || !customerState) {
    return "INTRA";
  }
  return companyState === customerState ? "INTRA" : "INTER";
}

function calculateGstBreakup(taxableAmount, gstRate, gstMode) {
  const taxable = round2(taxableAmount);
  const rate = Number(gstRate) || 0;
  if (rate <= 0 || taxable <= 0) {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      gstMode: gstMode || "INTRA",
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount: 0,
      totalAmount: taxable,
    };
  }

  const gstAmount = round2((taxable * rate) / 100);
  if (gstMode === "INTER") {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      gstMode,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstAmount,
      gstAmount,
      totalAmount: round2(taxable + gstAmount),
    };
  }

  const half = round2(gstAmount / 2);
  return {
    taxableAmount: taxable,
    gstRate: rate,
    gstMode: "INTRA",
    cgstAmount: half,
    sgstAmount: round2(gstAmount - half),
    igstAmount: 0,
    gstAmount,
    totalAmount: round2(taxable + gstAmount),
  };
}

module.exports = {
  getFinancialYearCode,
  calculateHoldDays,
  round2,
  normalizeOwnerCode,
  isPocOwner,
  isHydroTestOverdue,
  deriveNextHydroDueDate,
  getGstinStateCode,
  getGstMode,
  calculateGstBreakup,
};
