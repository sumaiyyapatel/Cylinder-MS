import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MobileRecordList, SummaryPanel } from "@/components/ux/workflow";
import { generateReportPDF } from "@/lib/pdf-export";

const reportTabs = [
  ["holding", "Holding Statement"],
  ["daily", "Daily Report"],
  ["customer-stmt", "Customer Statement"],
  ["trial-balance", "Trial Balance"],
  ["cylinder-rotation", "Cylinder Rotation"],
  ["sale-txn", "Sale Transactions"],
  ["outstanding", "Outstanding Payments"],
  ["sales-summary", "Sales Summary"],
  ["party-rental", "Party Wise Rental"],
  ["cash-book", "Cash Book"],
  ["bank-book", "Bank Book"],
  ["journal-book", "Journal Book"],
  ["reconciliation", "Reconciliation"],
];

const reportCatalog = {
  holding: {
    title: "Holding Statement",
    description: "Customer-wise active cylinder holdings with overdue visibility.",
  },
  daily: {
    title: "Daily Report",
    description: "One-day issue and return snapshot.",
  },
  "customer-stmt": {
    title: "Customer Statement",
    description: "Issue and return history for one selected customer.",
  },
  "trial-balance": {
    title: "Trial Balance",
    description: "Debit, credit, and balance grouped by party.",
  },
  "cylinder-rotation": {
    title: "Cylinder Rotation",
    description: "Cylinder lifecycle history across issue and return events.",
  },
  "sale-txn": {
    title: "Sale Transactions",
    description: "Filtered sales transactions by date, customer, and gas.",
  },
  outstanding: {
    title: "Outstanding Payments",
    description: "Receivable and payable balances grouped by party.",
  },
  "sales-summary": {
    title: "Sales Summary",
    description: "Grouped totals by gas type and customer.",
  },
  "party-rental": {
    title: "Party Wise Rental",
    description: "Rental dues grouped by customer.",
  },
  "cash-book": {
    title: "Cash Book",
    description: "Cash movement with running balance.",
  },
  "bank-book": {
    title: "Bank Book",
    description: "Bank movement with running balance.",
  },
  "journal-book": {
    title: "Journal Book",
    description: "Manual journal-style accounting entries.",
  },
  reconciliation: {
    title: "Reconciliation",
    description: "Mismatch, missing ECR, and duplicate issue checks.",
  },
};

function normalizeSelectValue(value) {
  if (!value || value === "all") return undefined;
  return value;
}

function countValue(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value._all === "number") return value._all;
  return 0;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(fileName, columns, rows) {
  const csv = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row[column.key] ?? ""))]
    .map((line) => line.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function createSection(title, columns, rows, options = {}) {
  return {
    title,
    columns,
    rows,
    loading: options.loading || false,
    emptyMessage: options.emptyMessage || "No records found",
    className: options.className || "",
  };
}

function ReportSection({ section }) {
  if (section.loading) {
    return (
      <Card className="section-card">
        <CardHeader className="section-header">
          <CardTitle className="section-title">{section.title}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-slate-500">Loading...</CardContent>
      </Card>
    );
  }

  if (!section.rows.length) {
    return (
      <Card className="section-card">
        <CardHeader className="section-header">
          <CardTitle className="section-title">{section.title}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-slate-500">{section.emptyMessage}</CardContent>
      </Card>
    );
  }

  return (
    <Card className={`section-card ${section.className}`}>
      <CardHeader className="section-header">
        <CardTitle className="section-title">{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <MobileRecordList
          items={section.rows}
          className="p-4"
          renderCard={(row, index) => (
            <Card key={`${section.title}-${index}`} className="rounded-2xl border border-slate-200 shadow-none">
              <CardContent className="space-y-2 p-4">
                {section.columns.map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-slate-500">{column.label}</span>
                    <span className={`text-right font-medium text-slate-900 ${column.className || ""}`}>{row[column.key]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        />
        <div className="data-table-shell hidden rounded-none border-0 shadow-none md:block">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {section.columns.map((column) => (
                    <th key={column.key} className={column.align === "right" ? "text-right" : ""}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={`${section.title}-row-${index}`}>
                    {section.columns.map((column) => (
                      <td key={column.key} className={`${column.align === "right" ? "text-right" : ""} ${column.className || ""}`}>
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeReport, setActiveReport] = useState("holding");
  const [filters, setFilters] = useState({
    customerId: "all",
    gasCode: "all",
    cylinderNumber: "",
    dateFrom: "",
    dateTo: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveReport(tab);
  }, [searchParams]);

  const customerIdParam = normalizeSelectValue(filters.customerId);
  const gasCodeParam = normalizeSelectValue(filters.gasCode);
  const cylinderNumberParam = filters.cylinderNumber?.trim() || undefined;
  const dateFromParam = filters.dateFrom || undefined;
  const dateToParam = filters.dateTo || undefined;

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((response) => response.data),
  });

  const { data: gasTypes } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then((response) => response.data),
  });

  const { data: holdingData, isLoading: holdingLoading } = useQuery({
    queryKey: ["report-holding", customerIdParam, gasCodeParam, searchParams.get("filter")],
    queryFn: () =>
      api
        .get("/reports/holding-statement", {
          params: {
            customerId: customerIdParam,
            gasCode: gasCodeParam,
            filter: searchParams.get("filter"),
          },
        })
        .then((response) => response.data),
    enabled: activeReport === "holding",
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["report-daily", filters.date],
    queryFn: () => api.get("/reports/daily-report", { params: { date: filters.date } }).then((response) => response.data),
    enabled: activeReport === "daily",
  });

  const { data: customerStmt, isLoading: stmtLoading } = useQuery({
    queryKey: ["report-customer-stmt", customerIdParam, dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/customer-statement", {
          params: { customerId: customerIdParam, dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "customer-stmt" && !!customerIdParam,
  });

  const { data: trialBalance, isLoading: tbLoading } = useQuery({
    queryKey: ["report-trial-balance", dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/trial-balance", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "trial-balance",
  });

  const { data: cylinderRotation, isLoading: rotationLoading } = useQuery({
    queryKey: ["report-cylinder-rotation", cylinderNumberParam, gasCodeParam],
    queryFn: () =>
      api
        .get("/reports/cylinder-rotation", {
          params: { cylinderNumber: cylinderNumberParam, gasCode: gasCodeParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "cylinder-rotation",
  });

  const { data: saleTransactions, isLoading: salesTxnLoading } = useQuery({
    queryKey: ["report-sale-transactions", dateFromParam, dateToParam, customerIdParam, gasCodeParam],
    queryFn: () =>
      api
        .get("/reports/sale-transactions", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam, customerId: customerIdParam, gasCode: gasCodeParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "sale-txn",
  });

  const { data: outstandingData, isLoading: outstandingLoading } = useQuery({
    queryKey: ["report-outstanding"],
    queryFn: () => api.get("/reports/outstanding").then((response) => response.data),
    enabled: activeReport === "outstanding",
  });

  const { data: salesSummary, isLoading: salesSummaryLoading } = useQuery({
    queryKey: ["report-sales-summary", dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/sales-summary", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "sales-summary",
  });

  const { data: partyRental, isLoading: partyRentalLoading } = useQuery({
    queryKey: ["report-party-rental", customerIdParam, dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/party-rental", {
          params: { customerId: customerIdParam, dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "party-rental",
  });

  const { data: cashBook, isLoading: cashBookLoading } = useQuery({
    queryKey: ["report-cash-book", dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/cash-book", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "cash-book",
  });

  const { data: bankBook, isLoading: bankBookLoading } = useQuery({
    queryKey: ["report-bank-book", dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/bank-book", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "bank-book",
  });

  const { data: journalBook, isLoading: journalBookLoading } = useQuery({
    queryKey: ["report-journal-book", dateFromParam, dateToParam],
    queryFn: () =>
      api
        .get("/reports/journal-book", {
          params: { dateFrom: dateFromParam, dateTo: dateToParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "journal-book",
  });

  const { data: reconciliationData, isLoading: reconciliationLoading } = useQuery({
    queryKey: ["report-reconciliation", customerIdParam, gasCodeParam],
    queryFn: () =>
      api
        .get("/reports/reconciliation", {
          params: { customerId: customerIdParam, gasCode: gasCodeParam },
        })
        .then((response) => response.data),
    enabled: activeReport === "reconciliation",
  });

  const reportSections = useMemo(() => {
    switch (activeReport) {
      case "holding":
        return (holdingData || []).map((group) =>
          createSection(
            `${group.customerCode} - ${group.customerName} (${group.cylinders?.length || 0} cylinders)`,
            [
              { key: "cylinderNumber", label: "Cylinder No", className: "mono-value text-xs" },
              { key: "gasCode", label: "Gas" },
              { key: "ownerCode", label: "Owner" },
              { key: "issuedAt", label: "Issued Date" },
              { key: "billNumber", label: "Bill No" },
              { key: "holdDays", label: "Hold Days", align: "right" },
            ],
            (group.cylinders || []).map((cylinder) => ({
              cylinderNumber: cylinder.cylinderNumber,
              gasCode: cylinder.gasCode,
              ownerCode: cylinder.ownerCode,
              issuedAt: formatDate(cylinder.issuedAt),
              billNumber: cylinder.billNumber || "-",
              holdDays: cylinder.holdDays,
            })),
            { loading: holdingLoading, emptyMessage: "No holdings found" }
          )
        );
      case "daily":
        return [
          createSection(
            `Issues (${dailyData?.issues?.length || 0})`,
            [
              { key: "billNumber", label: "Bill No", className: "mono-value text-xs" },
              { key: "customer", label: "Customer" },
              { key: "cylinder", label: "Cylinder" },
              { key: "gasCode", label: "Gas" },
              { key: "quantity", label: "Cu.M", align: "right" },
            ],
            (dailyData?.issues || []).map((item) => ({
              billNumber: item.billNumber,
              customer: item.customer?.name || "-",
              cylinder: item.cylinderNumber || "-",
              gasCode: item.gasCode || "-",
              quantity: item.quantityCum || "-",
            })),
            { loading: dailyLoading, emptyMessage: "No issues found for this date" }
          ),
          createSection(
            `Returns (${dailyData?.returns?.length || 0})`,
            [
              { key: "ecrNumber", label: "ECR No", className: "mono-value text-xs" },
              { key: "customer", label: "Customer" },
              { key: "cylinder", label: "Cylinder" },
              { key: "holdDays", label: "Days", align: "right" },
              { key: "rentAmount", label: "Rent", align: "right" },
            ],
            (dailyData?.returns || []).map((item) => ({
              ecrNumber: item.ecrNumber,
              customer: item.customer?.name || "-",
              cylinder: item.cylinderNumber || "-",
              holdDays: item.holdDays ?? "-",
              rentAmount: formatINR(item.rentAmount || 0),
            })),
            { loading: dailyLoading, emptyMessage: "No returns found for this date" }
          ),
        ];
      case "customer-stmt":
        return [
          createSection(
            `Issues (${customerStmt?.issues?.length || 0})`,
            [
              { key: "billNumber", label: "Bill No", className: "mono-value text-xs" },
              { key: "billDate", label: "Date" },
              { key: "cylinder", label: "Cylinder" },
              { key: "gasCode", label: "Gas" },
              { key: "quantity", label: "Cu.M", align: "right" },
            ],
            (customerStmt?.issues || []).map((item) => ({
              billNumber: item.billNumber,
              billDate: formatDate(item.billDate),
              cylinder: item.cylinderNumber || "-",
              gasCode: item.gasCode || "-",
              quantity: item.quantityCum || "-",
            })),
            { loading: stmtLoading, emptyMessage: "No issues found for this customer" }
          ),
          createSection(
            `Returns (${customerStmt?.returns?.length || 0})`,
            [
              { key: "ecrNumber", label: "ECR No", className: "mono-value text-xs" },
              { key: "ecrDate", label: "Date" },
              { key: "cylinder", label: "Cylinder" },
              { key: "holdDays", label: "Days", align: "right" },
              { key: "rentAmount", label: "Rent", align: "right" },
            ],
            (customerStmt?.returns || []).map((item) => ({
              ecrNumber: item.ecrNumber,
              ecrDate: formatDate(item.ecrDate),
              cylinder: item.cylinderNumber || "-",
              holdDays: item.holdDays ?? "-",
              rentAmount: formatINR(item.rentAmount || 0),
            })),
            { loading: stmtLoading, emptyMessage: "No returns found for this customer" }
          ),
        ];
      case "trial-balance":
        return [
          createSection(
            "Trial Balance",
            [
              { key: "partyCode", label: "Party Code" },
              { key: "partyName", label: "Party Name" },
              { key: "debit", label: "Debit", align: "right" },
              { key: "credit", label: "Credit", align: "right" },
              { key: "balance", label: "Balance", align: "right" },
            ],
            (trialBalance || []).map((entry) => ({
              partyCode: entry.partyCode || "-",
              partyName: entry.partyName || "-",
              debit: formatINR(entry.debit || 0),
              credit: formatINR(entry.credit || 0),
              balance: `${formatINR(Math.abs(entry.balance || 0))} ${entry.balance > 0 ? "Dr" : "Cr"}`,
            })),
            { loading: tbLoading, emptyMessage: "No balances found" }
          ),
        ];
      case "cylinder-rotation":
        return (cylinderRotation || []).map((group) =>
          createSection(
            `${group.cylinderNumber} (${group.currentStatus || "-"})`,
            [
              { key: "customer", label: "Customer" },
              { key: "billNumber", label: "Bill No", className: "mono-value text-xs" },
              { key: "issuedAt", label: "Issue Date" },
              { key: "returnedAt", label: "Return Date" },
              { key: "holdDays", label: "Days Held", align: "right" },
              { key: "status", label: "Status" },
            ],
            (group.history || []).map((item) => ({
              customer: `${item.customerCode || "-"} - ${item.customerName || "-"}`,
              billNumber: item.billNumber || "-",
              issuedAt: formatDate(item.issuedAt),
              returnedAt: item.returnedAt ? formatDate(item.returnedAt) : "-",
              holdDays: item.holdDays ?? "-",
              status: item.status || "-",
            })),
            { loading: rotationLoading, emptyMessage: "No rotation history found" }
          )
        );
      case "sale-txn":
        return [
          createSection(
            "Sale Transactions",
            [
              { key: "billNumber", label: "Bill Number", className: "mono-value text-xs" },
              { key: "billDate", label: "Date" },
              { key: "customer", label: "Customer" },
              { key: "cylinder", label: "Cylinder" },
              { key: "gasCode", label: "Gas" },
              { key: "quantity", label: "Cu.M", align: "right" },
            ],
            (saleTransactions || []).map((item) => ({
              billNumber: item.billNumber || "-",
              billDate: formatDate(item.billDate),
              customer: item.customer?.name || "-",
              cylinder: item.cylinderNumber || "-",
              gasCode: item.gasCode || "-",
              quantity: item.quantityCum ?? "-",
            })),
            { loading: salesTxnLoading, emptyMessage: "No sale transactions found" }
          ),
        ];
      case "outstanding":
        return [
          createSection(
            "Outstanding Payments",
            [
              { key: "party", label: "Party" },
              { key: "debit", label: "Debit", align: "right" },
              { key: "credit", label: "Credit", align: "right" },
              { key: "balance", label: "Balance", align: "right" },
              { key: "type", label: "Type" },
            ],
            (outstandingData || []).map((item) => ({
              party: `${item.partyCode || "-"} - ${item.partyName || "-"}`,
              debit: formatINR(item.debit || 0),
              credit: formatINR(item.credit || 0),
              balance: `${formatINR(Math.abs(item.balance || 0))} ${item.balance > 0 ? "Dr" : "Cr"}`,
              type: item.type || "-",
            })),
            { loading: outstandingLoading, emptyMessage: "No outstanding balances found" }
          ),
        ];
      case "sales-summary":
        return [
          createSection(
            "By Gas",
            [
              { key: "gasCode", label: "Gas" },
              { key: "count", label: "Bills", align: "right" },
              { key: "totalCum", label: "Total Cu.M", align: "right" },
            ],
            (salesSummary?.byGas || []).map((item) => ({
              gasCode: item.gasCode || "-",
              count: countValue(item.count),
              totalCum: item.totalCum ?? 0,
            })),
            { loading: salesSummaryLoading, emptyMessage: "No gas summary" }
          ),
          createSection(
            "By Customer",
            [
              { key: "customer", label: "Customer" },
              { key: "count", label: "Bills", align: "right" },
              { key: "totalCum", label: "Total Cu.M", align: "right" },
            ],
            (salesSummary?.byCustomer || []).map((item) => ({
              customer: `${item?.code || "-"} - ${item?.name || "-"}`,
              count: countValue(item?.count),
              totalCum: item?.totalCum ?? 0,
            })),
            { loading: salesSummaryLoading, emptyMessage: "No customer summary" }
          ),
        ];
      case "party-rental":
        return [
          createSection(
            "Party Wise Rental",
            [
              { key: "party", label: "Party" },
              { key: "count", label: "Returned Cylinders", align: "right" },
              { key: "totalDays", label: "Total Days", align: "right" },
              { key: "totalRent", label: "Total Rent", align: "right" },
            ],
            (partyRental || []).map((item) => ({
              party: `${item.partyCode || "-"} - ${item.partyName || "-"}`,
              count: item.count || 0,
              totalDays: item.totalDays || 0,
              totalRent: formatINR(item.totalRent || 0),
            })),
            { loading: partyRentalLoading, emptyMessage: "No rental records found" }
          ),
        ];
      case "cash-book":
      case "bank-book":
      case "journal-book": {
        const dataMap = {
          "cash-book": { rows: cashBook || [], loading: cashBookLoading, title: "Cash Book" },
          "bank-book": { rows: bankBook || [], loading: bankBookLoading, title: "Bank Book" },
          "journal-book": { rows: journalBook || [], loading: journalBookLoading, title: "Journal Book" },
        };
        const selected = dataMap[activeReport];
        return [
          createSection(
            selected.title,
            [
              { key: "voucherNumber", label: "Voucher No", className: "mono-value text-xs" },
              { key: "voucherDate", label: "Date" },
              { key: "party", label: "Party" },
              { key: "particular", label: "Particular" },
              { key: "debit", label: "Debit", align: "right" },
              { key: "credit", label: "Credit", align: "right" },
              ...(activeReport !== "journal-book" ? [{ key: "runningBalance", label: "Running Balance", align: "right" }] : []),
            ],
            selected.rows.map((item) => ({
              voucherNumber: item.voucherNumber || "-",
              voucherDate: formatDate(item.voucherDate),
              party: item.customer?.name || item.partyCode || "-",
              particular: item.particular || "-",
              debit: item.debitAmount ? formatINR(item.debitAmount) : "-",
              credit: item.creditAmount ? formatINR(item.creditAmount) : "-",
              runningBalance: item.runningBalance != null ? formatINR(item.runningBalance) : "-",
            })),
            { loading: selected.loading, emptyMessage: `No ${selected.title.toLowerCase()} entries found` }
          ),
        ];
      }
      case "reconciliation":
        return [
          createSection(
            `Mismatches (${reconciliationData?.mismatches?.length || 0})`,
            [
              { key: "customer", label: "Customer" },
              { key: "gasCode", label: "Gas" },
              { key: "ownerCode", label: "Owner" },
              { key: "issued", label: "Issued", align: "right" },
              { key: "returned", label: "Returned", align: "right" },
              { key: "balance", label: "Balance", align: "right" },
              { key: "activeHoldings", label: "Holdings", align: "right" },
              { key: "delta", label: "Delta", align: "right", className: "font-semibold text-red-600" },
            ],
            (reconciliationData?.mismatches || []).map((item) => ({
              customer: `${item.customerCode} - ${item.customerName}`,
              gasCode: item.gasCode,
              ownerCode: item.ownerCode,
              issued: item.issued,
              returned: item.returned,
              balance: item.balance,
              activeHoldings: item.activeHoldings,
              delta: `${item.delta > 0 ? "+" : ""}${item.delta}`,
            })),
            { loading: reconciliationLoading, emptyMessage: "No mismatches found" }
          ),
          createSection(
            `Missing ECR (${reconciliationData?.missingEcr?.length || 0})`,
            [
              { key: "customerCode", label: "Customer" },
              { key: "cylinderNumber", label: "Cylinder", className: "mono-value text-xs" },
              { key: "issuedAt", label: "Issued" },
              { key: "returnedAt", label: "Returned" },
            ],
            (reconciliationData?.missingEcr || []).map((item) => ({
              customerCode: item.customerCode,
              cylinderNumber: item.cylinderNumber,
              issuedAt: formatDate(item.issuedAt),
              returnedAt: item.returnedAt ? formatDate(item.returnedAt) : "-",
            })),
            { loading: reconciliationLoading, emptyMessage: "No missing ECR records" }
          ),
          createSection(
            `Duplicate Issues (${reconciliationData?.duplicateIssues?.length || 0})`,
            [
              { key: "cylinderNumber", label: "Cylinder", className: "mono-value text-xs" },
              { key: "count", label: "Active Holdings", align: "right" },
              { key: "customers", label: "Customers" },
            ],
            (reconciliationData?.duplicateIssues || []).map((item) => ({
              cylinderNumber: item.cylinderNumber,
              count: item.count,
              customers: item.records?.map((record) => record.customerCode).join(", ") || "-",
            })),
            { loading: reconciliationLoading, emptyMessage: "No duplicate issues found" }
          ),
        ];
      default:
        return [];
    }
  }, [
    activeReport,
    bankBook,
    bankBookLoading,
    cashBook,
    cashBookLoading,
    customerStmt,
    cylinderRotation,
    dailyData,
    holdingData,
    holdingLoading,
    journalBook,
    journalBookLoading,
    outstandingData,
    outstandingLoading,
    partyRental,
    partyRentalLoading,
    reconciliationData,
    reconciliationLoading,
    rotationLoading,
    saleTransactions,
    salesSummary,
    salesSummaryLoading,
    salesTxnLoading,
    stmtLoading,
    tbLoading,
    trialBalance,
    dailyLoading,
  ]);

  const activeReportMeta = reportCatalog[activeReport] || reportCatalog.holding;
  const appliedFilterCount = [
    customerIdParam,
    gasCodeParam,
    cylinderNumberParam,
    dateFromParam,
    dateToParam,
    activeReport === "daily" ? filters.date : null,
    searchParams.get("filter"),
  ].filter(Boolean).length;
  const activeRecordCount = reportSections.reduce((sum, section) => sum + section.rows.length, 0);

  const handlePrint = () => window.print();

  const reportExportParams = {
    customerId: customerIdParam,
    gasCode: gasCodeParam,
    cylinderNumber: cylinderNumberParam,
    dateFrom: dateFromParam,
    dateTo: dateToParam,
    date: activeReport === "daily" ? filters.date : undefined,
    filter: searchParams.get("filter") || undefined,
  };

  const handleExportPdf = async () => {
    try {
      await generateReportPDF(
        activeReport,
        reportExportParams,
        `${activeReportMeta.title.toLowerCase().replace(/\s+/g, "-")}.pdf`
      );
    } catch (error) {
      toast.error(error.message || "Failed to export report PDF");
    }
  };

  const handleExportCsv = () => {
    const exportColumns = [];
    reportSections.forEach((section) => {
      section.columns.forEach((column) => {
        if (!exportColumns.some((item) => item.key === column.key)) {
          exportColumns.push({ key: column.key, label: column.label });
        }
      });
    });
    if (!exportColumns.length) return;

    const rows = reportSections.flatMap((section) =>
      section.rows.map((row) => ({
        ...(reportSections.length > 1 ? { section: section.title } : {}),
        ...row,
      }))
    );

    const columns = reportSections.length > 1 ? [{ key: "section", label: "Section" }, ...exportColumns] : exportColumns;
    downloadCsv(`${activeReportMeta.title.toLowerCase().replace(/\s+/g, "-")}.csv`, columns, rows);
  };

  const handleReportChange = (nextReport) => {
    setActiveReport(nextReport);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextReport);
    if (nextReport !== "holding") nextParams.delete("filter");
    setSearchParams(nextParams, { replace: true });
  };

  const needsCustomer = activeReport === "customer-stmt" && !customerIdParam;

  return (
    <div className="page-shell" data-testid="reports-page">
      <section className="page-header">
        <div className="page-eyebrow">Reports and controls</div>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="page-title">Reports now stay focused around one question at a time.</h1>
            <p className="page-subtitle">
              Pick the report, apply only the necessary filters, then print or export a clean CSV without leaving the page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="no-print border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            >
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              className="no-print border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="no-print border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </section>

      <div className="filter-panel no-print">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
          <SearchCheck className="h-4 w-4 text-amber-600" />
          Report selector
        </div>
        <Tabs value={activeReport} onValueChange={handleReportChange}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-slate-100 p-1.5">
            {reportTabs.map(([value, label]) => (
              <TabsTrigger key={value} value={value} data-testid={`report-tab-${value}`}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px] no-print">
        <div className="filter-panel">
          <div className="mb-3 text-sm font-medium text-slate-700">Filters</div>
          <div className="flex flex-wrap items-end gap-3">
            {(activeReport === "holding" || activeReport === "customer-stmt" || activeReport === "sale-txn" || activeReport === "party-rental" || activeReport === "reconciliation") && (
              <div>
                <Label className="text-xs">Customer</Label>
                <Select value={filters.customerId} onValueChange={(value) => setFilters((current) => ({ ...current, customerId: value }))}>
                  <SelectTrigger className="mt-1 h-9 w-52" data-testid="report-customer-filter">
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {(customers?.data || []).map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.code} - {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(activeReport === "holding" || activeReport === "cylinder-rotation" || activeReport === "sale-txn" || activeReport === "reconciliation") && (
              <div>
                <Label className="text-xs">Gas Type</Label>
                <Select value={filters.gasCode} onValueChange={(value) => setFilters((current) => ({ ...current, gasCode: value }))}>
                  <SelectTrigger className="mt-1 h-9 w-40">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {(gasTypes || []).map((gas) => (
                      <SelectItem key={gas.gasCode} value={gas.gasCode}>
                        {gas.gasCode} - {gas.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeReport === "cylinder-rotation" && (
              <div>
                <Label htmlFor="report-cylinder-number" className="text-xs">Cylinder Number</Label>
                <Input
                  id="report-cylinder-number"
                  name="cylinderNumber"
                  value={filters.cylinderNumber}
                  onChange={(event) => setFilters((current) => ({ ...current, cylinderNumber: event.target.value }))}
                  className="mt-1 h-9 w-48"
                  placeholder="Search cylinder"
                />
              </div>
            )}

            {activeReport === "daily" && (
              <div>
                <Label htmlFor="report-date" className="text-xs">Date</Label>
                <Input
                  id="report-date"
                  name="date"
                  type="date"
                  value={filters.date}
                  onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
                  className="mt-1 h-9 w-40"
                />
              </div>
            )}

            {(activeReport === "customer-stmt" ||
              activeReport === "trial-balance" ||
              activeReport === "sale-txn" ||
              activeReport === "sales-summary" ||
              activeReport === "party-rental" ||
              activeReport === "cash-book" ||
              activeReport === "bank-book" ||
              activeReport === "journal-book") && (
              <>
                <div>
                  <Label htmlFor="report-date-from" className="text-xs">From</Label>
                  <Input
                    id="report-date-from"
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                    className="mt-1 h-9 w-40"
                  />
                </div>
                <div>
                  <Label htmlFor="report-date-to" className="text-xs">To</Label>
                  <Input
                    id="report-date-to"
                    name="dateTo"
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                    className="mt-1 h-9 w-40"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <SummaryPanel
          title={activeReportMeta.title}
          description={activeReportMeta.description}
          tone="blue"
          rows={[
            { label: "Sections", value: reportSections.length || 0 },
            { label: "Visible rows", value: activeRecordCount },
            { label: "Applied filters", value: appliedFilterCount },
          ]}
        />
      </div>

      {activeReport === "reconciliation" && reconciliationData?.summary ? (
        <section className="stats-grid">
          <div className="stat-card text-left">
            <div className="metric-meta">Total Groups</div>
            <div className="metric-value mt-3">{reconciliationData.summary.totalGroups || 0}</div>
          </div>
          <div className="stat-card text-left">
            <div className="metric-meta">Reconciled</div>
            <div className="metric-value mt-3">{reconciliationData.summary.reconciledCount || 0}</div>
          </div>
          <div className="stat-card text-left">
            <div className="metric-meta">Mismatches</div>
            <div className="metric-value mt-3">{reconciliationData.summary.mismatchCount || 0}</div>
          </div>
          <div className="stat-card text-left">
            <div className="metric-meta">Missing ECR</div>
            <div className="metric-value mt-3">{reconciliationData.summary.missingEcrCount || 0}</div>
          </div>
        </section>
      ) : null}

      {needsCustomer ? (
        <EmptyState
          title="Customer required"
          description="Select a customer in the filter bar to load the statement."
        />
      ) : reportSections.length ? (
        <div className="space-y-6">
          {reportSections.map((section) => (
            <ReportSection key={section.title} section={section} />
          ))}
        </div>
      ) : (
        <EmptyState title="No report data yet" description="Select a report and apply filters to load data." />
      )}
    </div>
  );
}
