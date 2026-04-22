import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "@/lib/api";

// Common PDF settings
const COMPANY_HEADER = {
  fontSize: 14,
  subFontSize: 9,
};

function getCompanyInfo() {
  // Read from localStorage settings cache, fallback to defaults
  try {
    const cached = localStorage.getItem("companySettings");
    if (cached) {
      const settings = JSON.parse(cached);
      // Map API response array to key-value if needed, but assuming it's already an object
      if (Array.isArray(settings)) {
        return settings.reduce((acc, curr) => {
          acc[curr.key] = curr.value;
          return acc;
        }, {});
      }
      return settings;
    }
  } catch {}
  return { 
    company_name: "PATEL & CO.", 
    company_address: "Industrial Estate", 
    company_city: "Vadodara", 
    company_gstin: "24AAAAA0000A1Z5", 
    company_phone: "9876543210" 
  };
}

function addHeader(doc, title, subtitle) {
  const co = getCompanyInfo();
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(COMPANY_HEADER.fontSize);
  doc.text(co.company_name || "[COMPANY NAME]", pw / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(COMPANY_HEADER.subFontSize);
  const addr = [co.company_address, co.company_city].filter(Boolean).join(", ");
  if (addr) doc.text(addr, pw / 2, 20, { align: "center" });
  if (co.company_gstin) doc.text(`GSTIN: ${co.company_gstin}`, pw / 2, 25, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, pw / 2, 33, { align: "center" });
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, pw / 2, 38, { align: "center" });
  }
  doc.setLineWidth(0.3);
  doc.line(10, subtitle ? 40 : 36, pw - 10, subtitle ? 40 : 36);
  return subtitle ? 44 : 40;
}

function addFooter(doc) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.text(`Page ${i} of ${pages}`, pw / 2, ph - 8, { align: "center" });
    doc.text(`Printed: ${new Date().toLocaleDateString("en-IN")}`, 10, ph - 8);
  }
}

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtINR(n) {
  if (n == null) return "0.00";
  return parseFloat(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Convert number to words (Indian numbering system)
function numberToWords(num) {
  if (num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertLessThanThousand(n) {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
  }

  function convert(num) {
    if (num === 0) return "";

    let result = "";
    let crore = Math.floor(num / 10000000);
    let lakh = Math.floor((num % 10000000) / 100000);
    let thousand = Math.floor((num % 100000) / 1000);
    let remainder = num % 1000;

    if (crore > 0) result += convertLessThanThousand(crore) + " Crore ";
    if (lakh > 0) result += convertLessThanThousand(lakh) + " Lakh ";
    if (thousand > 0) result += convertLessThanThousand(thousand) + " Thousand ";
    if (remainder > 0) result += convertLessThanThousand(remainder);

    return result.trim();
  }

  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);

  let result = "Rupees " + convert(rupees);
  if (paise > 0) {
    result += " and " + convertLessThanThousand(paise) + " Paise";
  }
  result += " Only";

  return result;
}

function presentPDF(doc, fileName, mode = "download") {
  if (mode === "download") {
    doc.save(fileName);
    return;
  }

  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);
  if (mode === "print") {
    const opened = window.open(blobUrl, "_blank");
    if (!opened) {
      URL.revokeObjectURL(blobUrl);
      doc.save(fileName);
      return;
    }
    setTimeout(() => {
      try {
        opened.focus();
        opened.print();
      } catch {}
    }, 700);
  } else {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

async function downloadServerPdf(url, fileName, mode = "download") {
  const response = await api.get(url, { responseType: "blob" });
  const blob = new Blob([response.data], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);

  if (mode === "view" || mode === "print") {
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("Popup blocked");
    }
    if (mode === "print") {
      setTimeout(() => {
        try {
          opened.focus();
          opened.print();
        } catch {}
      }, 700);
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return;
  }

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

// ===== BILL CUM CHALLAN PDF =====
export async function generateBillPDF(txn, customer, options = {}) {
  const mode = options.mode || "view";
  return downloadServerPdf(
    `/bills/${txn.id}/pdf`,
    `Bill_${txn.billNumber?.replace(/\//g, "-") || txn.id}.pdf`,
    mode
  );
}

// ===== ECR PDF =====
export async function generateEcrPDF(ecr, customer, options = {}) {
  const mode = options.mode || "print";
  return downloadServerPdf(
    `/ecr/${ecr.id}/pdf`,
    `ECR_${ecr.ecrNumber?.replace(/\//g, "-") || ecr.id}.pdf`,
    mode
  );
}

// ===== CHALLAN PDF =====
export async function generateChallanPDF(challan, customer, options = {}) {
  const mode = options.mode || "view";
  return downloadServerPdf(
    `/challans/${challan.id}/pdf`,
    `Challan_${challan.challanNumber?.replace(/\//g, "-") || challan.id}.pdf`,
    mode
  );
}

// ===== HOLDING STATEMENT PDF =====
export function generateHoldingPDF(holdingData) {
  const doc = new jsPDF("l");
  const y = addHeader(doc, "HOLDING STATEMENT", `As on ${new Date().toLocaleDateString("en-IN")}`);

  let startY = y;
  (holdingData || []).forEach((group) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${group.customerCode} - ${group.customerName} (${group.cylinders.length} cylinders)`, 14, startY + 2);

    autoTable(doc, {
      startY: startY + 6,
      head: [["Cylinder No", "Gas", "Owner", "Issued Date", "Bill No", "Hold Days"]],
      body: group.cylinders.map((c) => [
        c.cylinderNumber, c.gasCode, c.ownerCode, fmtDate(c.issuedAt), c.billNumber || "-", c.holdDays,
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const days = parseInt(data.cell.raw);
          if (days > 30) data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
    startY = doc.lastAutoTable.finalY + 8;
  });

  addFooter(doc);
  doc.save("Holding_Statement.pdf");
}

// ===== DAILY REPORT PDF =====
export function generateDailyReportPDF(dailyData) {
  const doc = new jsPDF();
  const y = addHeader(doc, "DAILY REPORT", `Date: ${fmtDate(dailyData?.date)}`);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Issues (${dailyData?.issues?.length || 0})`, 14, y + 4);

  autoTable(doc, {
    startY: y + 8,
    head: [["Bill No", "Customer", "Cylinder", "Gas", "Cu.M"]],
    body: (dailyData?.issues || []).map((t) => [
      t.billNumber, t.customer?.name || "-", t.cylinderNumber || "-", t.gasCode || "-", t.quantityCum || "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: [22, 163, 74], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  const ry = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Returns (${dailyData?.returns?.length || 0})`, 14, ry);

  autoTable(doc, {
    startY: ry + 4,
    head: [["ECR No", "Customer", "Cylinder", "Days", "Rent"]],
    body: (dailyData?.returns || []).map((e) => [
      e.ecrNumber, e.customer?.name || "-", e.cylinderNumber || "-", e.holdDays ?? "-", `Rs. ${fmtINR(e.rentAmount)}`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`Daily_Report_${fmtDate(dailyData?.date)?.replace(/\//g, "-")}.pdf`);
}

// ===== CUSTOMER STATEMENT PDF =====
export function generateCustomerStatementPDF(stmtData) {
  const doc = new jsPDF();
  const cust = stmtData?.customer;
  const y = addHeader(doc, "CUSTOMER STATEMENT", `${cust?.code || ""} - ${cust?.name || ""}`);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Issues (${stmtData?.issues?.length || 0})`, 14, y + 4);

  autoTable(doc, {
    startY: y + 8,
    head: [["Bill No", "Date", "Cylinder", "Gas", "Cu.M"]],
    body: (stmtData?.issues || []).map((t) => [
      t.billNumber, fmtDate(t.billDate), t.cylinderNumber || "-", t.gasCode || "-", t.quantityCum || "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: [22, 163, 74], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  const ry = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text(`Returns (${stmtData?.returns?.length || 0})`, 14, ry);

  autoTable(doc, {
    startY: ry + 4,
    head: [["ECR No", "Date", "Cylinder", "Days", "Rent"]],
    body: (stmtData?.returns || []).map((e) => [
      e.ecrNumber, fmtDate(e.ecrDate), e.cylinderNumber || "-", e.holdDays ?? "-", `Rs. ${fmtINR(e.rentAmount)}`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`Customer_Statement_${cust?.code || "report"}.pdf`);
}

// ===== TRIAL BALANCE PDF =====
export function generateTrialBalancePDF(tbData) {
  const doc = new jsPDF();
  const y = addHeader(doc, "TRIAL BALANCE", "");

  const totalDr = (tbData || []).reduce((s, r) => s + (r.debit || 0), 0);
  const totalCr = (tbData || []).reduce((s, r) => s + (r.credit || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [["Party Code", "Party Name", "Debit (Rs.)", "Credit (Rs.)", "Balance"]],
    body: [
      ...(tbData || []).map((r) => [
        r.partyCode || "-",
        r.partyName || "-",
        fmtINR(r.debit),
        fmtINR(r.credit),
        `${fmtINR(Math.abs(r.balance))} ${r.balance > 0 ? "Dr" : "Cr"}`,
      ]),
      ["", "TOTAL", fmtINR(totalDr), fmtINR(totalCr), ""],
    ],
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.row.index === (tbData || []).length && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  addFooter(doc);
  doc.save("Trial_Balance.pdf");
}

// ===== LEDGER PDF =====
export function generateLedgerPDF(ledgerData, partyName) {
  const doc = new jsPDF("l");
  const y = addHeader(doc, "LEDGER", partyName ? `Party: ${partyName}` : "All Parties");

  autoTable(doc, {
    startY: y,
    head: [["Voucher No", "Date", "Type", "Party", "Particular", "Debit (Rs.)", "Credit (Rs.)", "Balance (Rs.)"]],
    body: (ledgerData || []).map((e) => [
      e.voucherNumber,
      fmtDate(e.voucherDate),
      e.transactionType?.replace(/_/g, " ") || "-",
      e.customer?.name || e.partyCode || "-",
      e.particular || "-",
      e.debitAmount ? fmtINR(e.debitAmount) : "-",
      e.creditAmount ? fmtINR(e.creditAmount) : "-",
      fmtINR(e.runningBalance),
    ]),
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 10, right: 10 },
  });

  addFooter(doc);
  doc.save("Ledger.pdf");
}

// ===== GENERIC TABLE PDF =====
export function generateTablePDF(title, headers, rows, orientation = "p") {
  const doc = new jsPDF(orientation);
  const y = addHeader(doc, title, "");

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
}
