// Format date as DD/MM/YYYY
export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format currency in Indian format
export function formatINR(amount) {
  if (amount === null || amount === undefined) return "\u20B90";
  const num = parseFloat(amount);
  if (isNaN(num)) return "\u20B90";
  const formatted = num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `\u20B9${formatted}`;
}

// Format number in Indian format
export function formatNumber(num) {
  if (num === null || num === undefined) return "0";
  return parseFloat(num).toLocaleString("en-IN");
}

// Get current financial year string
export function getFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
}

// Today's date in YYYY-MM-DD format
export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// Status color mapping
export const cylinderStatusColors = {
  IN_STOCK: "bg-green-50 text-green-700 ring-green-600/20",
  WITH_CUSTOMER: "bg-blue-50 text-blue-700 ring-blue-600/20",
  IN_TRANSIT: "bg-sky-50 text-sky-700 ring-sky-600/20",
  DAMAGED: "bg-red-50 text-red-700 ring-red-600/10",
  UNDER_TEST: "bg-amber-50 text-amber-700 ring-amber-600/20",
  CONDEMNED: "bg-red-100 text-red-800 ring-red-700/20",
};

export const orderStatusColors = {
  ACTIVE: "bg-green-50 text-green-700 ring-green-600/20",
  CLOSED: "bg-slate-50 text-slate-600 ring-slate-500/10",
  CANCELLED: "bg-red-50 text-red-700 ring-red-600/10",
};
