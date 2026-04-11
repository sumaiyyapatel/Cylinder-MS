const { getFinancialYearCode } = require("./businessRules");

function parseSequence(serial) {
  if (!serial) return 0;
  const parts = String(serial).split("/");
  const seq = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(seq) ? seq : 0;
}

async function getNextNumber(db, model, field, prefix) {
  const last = await db[model].findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: "desc" },
  });

  const nextSeq = parseSequence(last?.[field]) + 1;
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

async function generateBillNumber(db, ownerCode, forDate = new Date()) {
  const series = ownerCode === "COC" ? "CA" : "PA";
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "transaction", "billNumber", `${series}/${year}/`);
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

async function generateChallanNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "challan", "challanNumber", `CH/${year}/`);
}

async function generateEcrNumber(db, forDate = new Date()) {
  const year = getFinancialYearCode(forDate);
  return getNextNumber(db, "ecrRecord", "ecrNumber", `ER/${year}/`);
}

module.exports = {
  generateBillNumber,
  generateSalesVoucherNumber,
  generateLedgerVoucherNumber,
  generateChallanNumber,
  generateEcrNumber,
};
