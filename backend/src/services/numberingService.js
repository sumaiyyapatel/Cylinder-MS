const { getFinancialYearCode } = require("./businessRules");

function parseSequence(serial) {
  if (!serial) return 0;
  const parts = String(serial).split("/");
  const seq = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(seq) ? seq : 0;
}

/**
 * Get next number in a series, scoped to prefix (which includes FY code).
 * Counter resets each financial year because the prefix changes (e.g. CA/25-26/ → CA/26-27/).
 */
async function getNextNumber(db, model, field, prefix) {
  const last = await db[model].findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: "desc" },
  });

  const nextSeq = parseSequence(last?.[field]) + 1;
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

/**
 * Bill numbering: CA/25-26/00001 (COC) or PA/25-26/00001 (POC)
 * Series prefix maps owner → CA or PA.
 * FY code resets counter automatically because prefix changes each year.
 */
async function generateBillNumber(db, ownerCode, forDate = new Date()) {
  const series = ownerCode === "COC" ? "CA" : "PA";
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "bill", "billNumber", `${series}/${year}/`);
}

async function generateSalesVoucherNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "salesBook", "voucherNumber", `SB/${year}/`);
}

async function generateLedgerVoucherNumber(db, transactionType, forDate = new Date(), fallbackCode = "JV") {
  const typeMap = {
    CASH_RECEIPT: "CR",
    CASH_PAYMENT: "CP",
    BANK_RECEIPT: "BR",
    BANK_PAYMENT: "BP",
    JOURNAL: "JV",
    CONTRA: "CT",
    DEBIT_NOTE: "DN",
    CREDIT_NOTE: "CN",
  };

  const year = getFinancialYearCode(forDate);
  const code = typeMap[transactionType] || fallbackCode;
  return getNextNumber(db, "ledgerEntry", "voucherNumber", `${code}/${year}/`);
}

/**
 * Challan numbering: CH/25-26/00001
 * Resets per financial year.
 */
async function generateChallanNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "challan", "challanNumber", `CH/${year}/`);
}

async function generateEcrNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "ecrRecord", "ecrNumber", `ER/${year}/`);
}

/**
 * Transfer numbering: TR/25-26/00001
 */
async function generateTransferNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "interCompanyTransfer", "transferNumber", `TR/${year}/`);
}

module.exports = {
  generateBillNumber,
  generateSalesVoucherNumber,
  generateLedgerVoucherNumber,
  generateChallanNumber,
  generateEcrNumber,
  generateTransferNumber,
};
