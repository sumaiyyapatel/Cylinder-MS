import api from "@/lib/api";

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

export async function generateBillPDF(txn, customer, options = {}) {
  const mode = options.mode || "view";
  return downloadServerPdf(
    `/bills/${txn.id}/pdf`,
    `Bill_${txn.billNumber?.replace(/\//g, "-") || txn.id}.pdf`,
    mode
  );
}

export async function generateEcrPDF(ecr, customer, options = {}) {
  const mode = options.mode || "print";
  return downloadServerPdf(
    `/ecr/${ecr.id}/pdf`,
    `ECR_${ecr.ecrNumber?.replace(/\//g, "-") || ecr.id}.pdf`,
    mode
  );
}

export async function generateChallanPDF(challan, customer, options = {}) {
  const mode = options.mode || "view";
  return downloadServerPdf(
    `/challans/${challan.id}/pdf`,
    `Challan_${challan.challanNumber?.replace(/\//g, "-") || challan.id}.pdf`,
    mode
  );
}

export async function generateReportPDF(type, params = {}, fileName = "report.pdf", options = {}) {
  const mode = options.mode || "download";
  const search = new URLSearchParams(
    Object.entries({ type, ...params }).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  return downloadServerPdf(`/reports/export?${search.toString()}`, fileName, mode);
}
