import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Download } from "lucide-react";
import { 
  generateHoldingPDF, 
  generateDailyReportPDF, 
  generateCustomerStatementPDF, 
  generateTrialBalancePDF,
  generateTablePDF,
} from "@/lib/pdf-export";

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState("holding");
  const [filters, setFilters] = useState({
    customerId: "all",
    gasCode: "all",
    cylinderNumber: "",
    dateFrom: "",
    dateTo: "",
    date: new Date().toISOString().split("T")[0],
  });

  const normalizeSelectValue = (value) => {
    if (!value || value === "all") return undefined;
    return value;
  };

  const customerIdParam = normalizeSelectValue(filters.customerId);
  const gasCodeParam = normalizeSelectValue(filters.gasCode);
  const cylinderNumberParam = filters.cylinderNumber?.trim() || undefined;
  const dateFromParam = filters.dateFrom || undefined;
  const dateToParam = filters.dateTo || undefined;

  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const { data: holdingData, isLoading: holdingLoading } = useQuery({
    queryKey: ["report-holding", customerIdParam, gasCodeParam],
    queryFn: () => api.get("/reports/holding-statement", { params: { customerId: customerIdParam, gasCode: gasCodeParam } }).then(r => r.data),
    enabled: activeReport === "holding",
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["report-daily", filters.date],
    queryFn: () => api.get("/reports/daily-report", { params: { date: filters.date } }).then(r => r.data),
    enabled: activeReport === "daily",
  });

  const { data: customerStmt, isLoading: stmtLoading } = useQuery({
    queryKey: ["report-customer-stmt", customerIdParam, dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/customer-statement", { params: { customerId: customerIdParam, dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "customer-stmt" && !!customerIdParam,
  });

  const { data: trialBalance, isLoading: tbLoading } = useQuery({
    queryKey: ["report-trial-balance", dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/trial-balance", { params: { dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "trial-balance",
  });

  const { data: cylinderRotation, isLoading: rotationLoading } = useQuery({
    queryKey: ["report-cylinder-rotation", cylinderNumberParam, gasCodeParam],
    queryFn: () => api.get("/reports/cylinder-rotation", { params: { cylinderNumber: cylinderNumberParam, gasCode: gasCodeParam } }).then(r => r.data),
    enabled: activeReport === "cylinder-rotation",
  });

  const { data: saleTransactions, isLoading: salesTxnLoading } = useQuery({
    queryKey: ["report-sale-transactions", dateFromParam, dateToParam, customerIdParam, gasCodeParam],
    queryFn: () => api.get("/reports/sale-transactions", {
      params: { dateFrom: dateFromParam, dateTo: dateToParam, customerId: customerIdParam, gasCode: gasCodeParam },
    }).then(r => r.data),
    enabled: activeReport === "sale-txn",
  });

  const { data: outstandingData, isLoading: outstandingLoading } = useQuery({
    queryKey: ["report-outstanding"],
    queryFn: () => api.get("/reports/outstanding").then(r => r.data),
    enabled: activeReport === "outstanding",
  });

  const { data: salesSummary, isLoading: salesSummaryLoading } = useQuery({
    queryKey: ["report-sales-summary", dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/sales-summary", { params: { dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "sales-summary",
  });

  const { data: partyRental, isLoading: partyRentalLoading } = useQuery({
    queryKey: ["report-party-rental", customerIdParam, dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/party-rental", {
      params: { customerId: customerIdParam, dateFrom: dateFromParam, dateTo: dateToParam },
    }).then(r => r.data),
    enabled: activeReport === "party-rental",
  });

  const { data: cashBook, isLoading: cashBookLoading } = useQuery({
    queryKey: ["report-cash-book", dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/cash-book", { params: { dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "cash-book",
  });

  const { data: bankBook, isLoading: bankBookLoading } = useQuery({
    queryKey: ["report-bank-book", dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/bank-book", { params: { dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "bank-book",
  });

  const { data: journalBook, isLoading: journalBookLoading } = useQuery({
    queryKey: ["report-journal-book", dateFromParam, dateToParam],
    queryFn: () => api.get("/reports/journal-book", { params: { dateFrom: dateFromParam, dateTo: dateToParam } }).then(r => r.data),
    enabled: activeReport === "journal-book",
  });

  const countValue = (value) => {
    if (typeof value === "number") return value;
    if (value && typeof value === "object" && typeof value._all === "number") return value._all;
    return 0;
  };

  const rowsOrEmpty = (rows, columns) => (rows.length ? rows : [Array(columns).fill("-")]);

  const handlePrint = () => window.print();

  const handleExportPDF = () => {
    switch (activeReport) {
      case "holding":
        if (holdingData) generateHoldingPDF(holdingData);
        break;
      case "daily":
        if (dailyData) generateDailyReportPDF(dailyData);
        break;
      case "customer-stmt":
        if (customerStmt) generateCustomerStatementPDF(customerStmt);
        break;
      case "trial-balance":
        if (trialBalance) generateTrialBalancePDF(trialBalance);
        break;
      case "cylinder-rotation": {
        const rows = (cylinderRotation || []).flatMap((group) =>
          (group.history || []).map((h) => [
            group.cylinderNumber || "-",
            `${h.customerCode || "-"} - ${h.customerName || "-"}`,
            formatDate(h.issuedAt),
            h.returnedAt ? formatDate(h.returnedAt) : "-",
            h.holdDays ?? "-",
          ]),
        );
        generateTablePDF("Cylinder Rotation", ["Cylinder", "Customer", "Issue Date", "Return Date", "Days Held"], rowsOrEmpty(rows, 5), "l");
        break;
      }
      case "sale-txn": {
        const rows = (saleTransactions || []).map((t) => [
          t.billNumber || "-",
          formatDate(t.billDate),
          t.customer?.name || "-",
          t.cylinderNumber || "-",
          t.gasCode || "-",
          t.quantityCum ?? "-",
        ]);
        generateTablePDF("Sale Transactions", ["Bill Number", "Date", "Customer", "Cylinder", "Gas", "Cu.M"], rowsOrEmpty(rows, 6), "l");
        break;
      }
      case "outstanding": {
        const rows = (outstandingData || []).map((r) => [
          `${r.partyCode || "-"} - ${r.partyName || "-"}`,
          formatINR(r.debit || 0),
          formatINR(r.credit || 0),
          `${formatINR(Math.abs(r.balance || 0))} ${r.balance > 0 ? "Dr" : "Cr"}`,
          r.type || "-",
        ]);
        generateTablePDF("Outstanding Payments", ["Party", "Debit", "Credit", "Balance", "Type"], rowsOrEmpty(rows, 5), "l");
        break;
      }
      case "sales-summary": {
        const rows = [
          ...(salesSummary?.byGas || []).map((r) => ["Gas Type", r.gasCode || "-", countValue(r.count), r.totalCum ?? 0]),
          ...(salesSummary?.byCustomer || []).map((r) => ["Customer", `${r?.code || "-"} - ${r?.name || "-"}`, countValue(r?.count), r?.totalCum ?? 0]),
          ["Total", "Bills", salesSummary?.totalBills || 0, "-"],
        ];
        generateTablePDF("Sales Summary", ["Section", "Name", "Bills", "Total Cu.M"], rowsOrEmpty(rows, 4), "l");
        break;
      }
      case "party-rental": {
        const rows = (partyRental || []).map((r) => [
          `${r.partyCode || "-"} - ${r.partyName || "-"}`,
          r.count || 0,
          r.totalDays || 0,
          formatINR(r.totalRent || 0),
        ]);
        generateTablePDF("Party Wise Rental", ["Party", "Total Cylinders Returned", "Total Days", "Total Rent Owed"], rowsOrEmpty(rows, 4), "l");
        break;
      }
      case "cash-book": {
        const rows = (cashBook || []).map((e) => [
          e.voucherNumber || "-",
          formatDate(e.voucherDate),
          e.customer?.name || e.partyCode || "-",
          e.particular || "-",
          e.debitAmount ? formatINR(e.debitAmount) : "-",
          e.creditAmount ? formatINR(e.creditAmount) : "-",
          formatINR(e.runningBalance || 0),
        ]);
        generateTablePDF("Cash Book", ["Voucher No", "Date", "Party", "Particular", "Debit", "Credit", "Running Balance"], rowsOrEmpty(rows, 7), "l");
        break;
      }
      case "bank-book": {
        const rows = (bankBook || []).map((e) => [
          e.voucherNumber || "-",
          formatDate(e.voucherDate),
          e.customer?.name || e.partyCode || "-",
          e.particular || "-",
          e.debitAmount ? formatINR(e.debitAmount) : "-",
          e.creditAmount ? formatINR(e.creditAmount) : "-",
          formatINR(e.runningBalance || 0),
        ]);
        generateTablePDF("Bank Book", ["Voucher No", "Date", "Party", "Particular", "Debit", "Credit", "Running Balance"], rowsOrEmpty(rows, 7), "l");
        break;
      }
      case "journal-book": {
        const rows = (journalBook || []).map((e) => [
          e.voucherNumber || "-",
          formatDate(e.voucherDate),
          e.customer?.name || e.partyCode || "-",
          (e.transactionType || "-").replace(/_/g, " "),
          e.particular || "-",
          e.debitAmount ? formatINR(e.debitAmount) : "-",
          e.creditAmount ? formatINR(e.creditAmount) : "-",
        ]);
        generateTablePDF("Journal Book", ["Voucher No", "Date", "Party", "Type", "Particular", "Debit", "Credit"], rowsOrEmpty(rows, 7), "l");
        break;
      }
      default:
        console.warn("No PDF generator for this report");
    }
  };

  return (
    <div className="space-y-4" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs no-print"><Printer className="w-3.5 h-3.5 mr-1" /> Print</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 text-xs no-print">
            <Download className="w-3.5 h-3.5 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeReport} onValueChange={setActiveReport} className="no-print">
        <TabsList className="bg-slate-100 w-full justify-start overflow-x-auto">
          <TabsTrigger value="holding" data-testid="report-tab-holding">Holding Statement</TabsTrigger>
          <TabsTrigger value="daily" data-testid="report-tab-daily">Daily Report</TabsTrigger>
          <TabsTrigger value="customer-stmt" data-testid="report-tab-customer-stmt">Customer Statement</TabsTrigger>
          <TabsTrigger value="trial-balance" data-testid="report-tab-trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="cylinder-rotation" data-testid="report-tab-cylinder-rotation">Cylinder Rotation</TabsTrigger>
          <TabsTrigger value="sale-txn" data-testid="report-tab-sale-txn">Sale Transactions</TabsTrigger>
          <TabsTrigger value="outstanding" data-testid="report-tab-outstanding">Outstanding Payments</TabsTrigger>
          <TabsTrigger value="sales-summary" data-testid="report-tab-sales-summary">Sales Summary</TabsTrigger>
          <TabsTrigger value="party-rental" data-testid="report-tab-party-rental">Party Wise Rental</TabsTrigger>
          <TabsTrigger value="cash-book" data-testid="report-tab-cash-book">Cash Book</TabsTrigger>
          <TabsTrigger value="bank-book" data-testid="report-tab-bank-book">Bank Book</TabsTrigger>
          <TabsTrigger value="journal-book" data-testid="report-tab-journal-book">Journal Book</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap bg-white p-3 rounded-md border border-slate-200 no-print">
        {(activeReport === "holding" || activeReport === "customer-stmt" || activeReport === "sale-txn" || activeReport === "party-rental") && (
          <div>
            <Label className="text-xs">Customer</Label>
            <Select value={filters.customerId} onValueChange={(v) => setFilters({ ...filters, customerId: v })}>
              <SelectTrigger className="h-9 w-52 mt-1" data-testid="report-customer-filter"><SelectValue placeholder="All customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {(activeReport === "holding" || activeReport === "cylinder-rotation" || activeReport === "sale-txn") && (
          <div>
            <Label className="text-xs">Gas Type</Label>
            <Select value={filters.gasCode} onValueChange={(v) => setFilters({ ...filters, gasCode: v })}>
              <SelectTrigger className="h-9 w-40 mt-1"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {activeReport === "cylinder-rotation" && (
          <div>
            <Label className="text-xs">Cylinder Number</Label>
            <Input
              value={filters.cylinderNumber}
              onChange={(e) => setFilters({ ...filters, cylinderNumber: e.target.value })}
              className="h-9 mt-1 w-48"
              placeholder="Search cylinder"
            />
          </div>
        )}
        {activeReport === "daily" && (
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="h-9 mt-1 w-40" />
          </div>
        )}
        {(activeReport === "customer-stmt" || activeReport === "trial-balance" || activeReport === "sale-txn" || activeReport === "sales-summary" || activeReport === "party-rental" || activeReport === "cash-book" || activeReport === "bank-book" || activeReport === "journal-book") && (
          <>
            <div><Label className="text-xs">From</Label><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="h-9 mt-1 w-40" /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="h-9 mt-1 w-40" /></div>
          </>
        )}
      </div>

      {/* Holding Statement */}
      {activeReport === "holding" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>Holding Statement</CardTitle></CardHeader>
          <CardContent>
            {holdingLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              !holdingData?.length ? <div className="py-8 text-center text-slate-400">No holdings found</div> :
              holdingData.map(group => (
                <div key={group.customerCode} className="mb-6">
                  <div className="font-semibold text-slate-800 mb-2">{group.customerCode} - {group.customerName} ({group.cylinders.length} cylinders)</div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                        <th className="px-3 py-1.5">Cylinder</th><th className="px-3 py-1.5">Gas</th><th className="px-3 py-1.5">Owner</th>
                        <th className="px-3 py-1.5">Issued</th><th className="px-3 py-1.5">Bill No</th><th className="px-3 py-1.5 text-right">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.cylinders.map((c, i) => (
                        <tr key={i} className={`border-b border-slate-100 ${c.isOverdue ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-1.5 font-mono text-xs">{c.cylinderNumber}</td>
                          <td className="px-3 py-1.5">{c.gasCode}</td>
                          <td className="px-3 py-1.5">{c.ownerCode}</td>
                          <td className="px-3 py-1.5">{formatDate(c.issuedAt)}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{c.billNumber || "-"}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${c.isOverdue ? "text-red-600" : ""}`}>{c.holdDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            }
          </CardContent>
        </Card>
      )}

      {/* Daily Report */}
      {activeReport === "daily" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>Daily Report - {formatDate(dailyData?.date)}</CardTitle></CardHeader>
          <CardContent>
            {dailyLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> : (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-green-700">Issues ({dailyData?.issues?.length || 0})</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                      <th className="px-3 py-1.5">Bill No</th><th className="px-3 py-1.5">Customer</th><th className="px-3 py-1.5">Cylinder</th><th className="px-3 py-1.5">Gas</th>
                    </tr></thead>
                    <tbody>
                      {(dailyData?.issues || []).map(t => (
                        <tr key={t.id} className="border-b border-slate-100"><td className="px-3 py-1.5 font-mono text-xs">{t.billNumber}</td><td className="px-3 py-1.5">{t.customer?.name}</td><td className="px-3 py-1.5 font-mono text-xs">{t.cylinderNumber}</td><td className="px-3 py-1.5">{t.gasCode}</td></tr>
                      ))}
                      {!dailyData?.issues?.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No issues</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-blue-700">Returns ({dailyData?.returns?.length || 0})</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                      <th className="px-3 py-1.5">ECR No</th><th className="px-3 py-1.5">Customer</th><th className="px-3 py-1.5">Cylinder</th><th className="px-3 py-1.5">Days</th><th className="px-3 py-1.5">Rent</th>
                    </tr></thead>
                    <tbody>
                      {(dailyData?.returns || []).map(e => (
                        <tr key={e.id} className="border-b border-slate-100"><td className="px-3 py-1.5 font-mono text-xs">{e.ecrNumber}</td><td className="px-3 py-1.5">{e.customer?.name}</td><td className="px-3 py-1.5 font-mono text-xs">{e.cylinderNumber}</td><td className="px-3 py-1.5">{e.holdDays}</td><td className="px-3 py-1.5">{formatINR(e.rentAmount)}</td></tr>
                      ))}
                      {!dailyData?.returns?.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No returns</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer Statement */}
      {activeReport === "customer-stmt" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>Customer Statement {customerStmt?.customer ? `- ${customerStmt.customer.name}` : ""}</CardTitle></CardHeader>
          <CardContent>
            {!filters.customerId ? <div className="py-8 text-center text-slate-400">Select a customer</div> :
              stmtLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> : (
              <div className="space-y-4">
                <div><h3 className="font-semibold mb-1">Issues ({customerStmt?.issues?.length || 0})</h3>
                  <table className="w-full text-sm border-collapse"><thead><tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold"><th className="px-3 py-1.5">Bill No</th><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5">Cylinder</th><th className="px-3 py-1.5">Gas</th></tr></thead>
                    <tbody>{(customerStmt?.issues || []).map(t => (<tr key={t.id} className="border-b border-slate-100"><td className="px-3 py-1.5 font-mono text-xs">{t.billNumber}</td><td className="px-3 py-1.5">{formatDate(t.billDate)}</td><td className="px-3 py-1.5 font-mono text-xs">{t.cylinderNumber}</td><td className="px-3 py-1.5">{t.gasCode}</td></tr>))}</tbody></table>
                </div>
                <div><h3 className="font-semibold mb-1">Returns ({customerStmt?.returns?.length || 0})</h3>
                  <table className="w-full text-sm border-collapse"><thead><tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold"><th className="px-3 py-1.5">ECR No</th><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5">Cylinder</th><th className="px-3 py-1.5">Days</th><th className="px-3 py-1.5">Rent</th></tr></thead>
                    <tbody>{(customerStmt?.returns || []).map(e => (<tr key={e.id} className="border-b border-slate-100"><td className="px-3 py-1.5 font-mono text-xs">{e.ecrNumber}</td><td className="px-3 py-1.5">{formatDate(e.ecrDate)}</td><td className="px-3 py-1.5 font-mono text-xs">{e.cylinderNumber}</td><td className="px-3 py-1.5">{e.holdDays}</td><td className="px-3 py-1.5">{formatINR(e.rentAmount)}</td></tr>))}</tbody></table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trial Balance */}
      {activeReport === "trial-balance" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: 'var(--font-heading)' }}>Trial Balance</CardTitle></CardHeader>
          <CardContent>
            {tbLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                  <th className="px-3 py-1.5">Party Code</th><th className="px-3 py-1.5">Name</th><th className="px-3 py-1.5 text-right">Debit</th><th className="px-3 py-1.5 text-right">Credit</th><th className="px-3 py-1.5 text-right">Balance</th>
                </tr></thead>
                <tbody>
                  {(trialBalance || []).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100"><td className="px-3 py-1.5 font-mono text-xs">{r.partyCode || "-"}</td><td className="px-3 py-1.5">{r.partyName}</td><td className="px-3 py-1.5 text-right">{formatINR(r.debit)}</td><td className="px-3 py-1.5 text-right">{formatINR(r.credit)}</td><td className={`px-3 py-1.5 text-right font-medium ${r.balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatINR(Math.abs(r.balance))} {r.balance > 0 ? "Dr" : "Cr"}</td></tr>
                  ))}
                  {!trialBalance?.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No entries</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Cylinder Rotation */}
      {activeReport === "cylinder-rotation" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Cylinder Rotation</CardTitle></CardHeader>
          <CardContent>
            {rotationLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              !cylinderRotation?.length ? <div className="py-8 text-center text-slate-400">No cylinder rotation records</div> :
                cylinderRotation.map((group) => (
                  <div key={group.cylinderNumber} className="mb-6">
                    <div className="font-semibold text-slate-800 mb-2">
                      {group.cylinderNumber} - {group.gasCode || "-"}
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                          <th className="px-3 py-1.5">Customer</th>
                          <th className="px-3 py-1.5">Issue Date</th>
                          <th className="px-3 py-1.5">Return Date</th>
                          <th className="px-3 py-1.5 text-right">Days Held</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.history || []).map((h, idx) => (
                          <tr key={idx} className="border-b border-slate-100">
                            <td className="px-3 py-1.5">{h.customerCode} - {h.customerName}</td>
                            <td className="px-3 py-1.5">{formatDate(h.issuedAt)}</td>
                            <td className="px-3 py-1.5">{h.returnedAt ? formatDate(h.returnedAt) : "-"}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{h.holdDays ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
            }
          </CardContent>
        </Card>
      )}

      {/* Sale Transactions */}
      {activeReport === "sale-txn" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Sale Transactions</CardTitle></CardHeader>
          <CardContent>
            {salesTxnLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Bill Number</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Customer</th>
                    <th className="px-3 py-1.5">Cylinder</th>
                    <th className="px-3 py-1.5">Gas</th>
                    <th className="px-3 py-1.5 text-right">Cu.M</th>
                  </tr>
                </thead>
                <tbody>
                  {(saleTransactions || []).map((t) => (
                    <tr key={t.id} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-xs">{t.billNumber}</td>
                      <td className="px-3 py-1.5">{formatDate(t.billDate)}</td>
                      <td className="px-3 py-1.5">{t.customer?.name || "-"}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{t.cylinderNumber || "-"}</td>
                      <td className="px-3 py-1.5">{t.gasCode || "-"}</td>
                      <td className="px-3 py-1.5 text-right">{t.quantityCum ?? "-"}</td>
                    </tr>
                  ))}
                  {!saleTransactions?.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">No transactions</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Outstanding Payments */}
      {activeReport === "outstanding" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Outstanding Payments</CardTitle></CardHeader>
          <CardContent>
            {outstandingLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Party</th>
                    <th className="px-3 py-1.5 text-right">Debit</th>
                    <th className="px-3 py-1.5 text-right">Credit</th>
                    <th className="px-3 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(outstandingData || []).map((r) => (
                    <tr key={r.partyCode} className={`border-b border-slate-100 ${r.type === "RECEIVABLE" ? "bg-amber-50" : "bg-emerald-50"}`}>
                      <td className="px-3 py-1.5">{r.partyCode} - {r.partyName}</td>
                      <td className="px-3 py-1.5 text-right">{formatINR(r.debit)}</td>
                      <td className="px-3 py-1.5 text-right">{formatINR(r.credit)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${r.type === "RECEIVABLE" ? "text-amber-700" : "text-emerald-700"}`}>
                        {formatINR(Math.abs(r.balance))} {r.balance > 0 ? "Dr" : "Cr"}
                      </td>
                    </tr>
                  ))}
                  {!outstandingData?.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No outstanding balances</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Sales Summary */}
      {activeReport === "sales-summary" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Sales Summary</CardTitle></CardHeader>
          <CardContent>
            {salesSummaryLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> : (
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-2 rounded-md text-sm font-medium">
                  Total Bills: {salesSummary?.totalBills || 0}
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-slate-800">By Gas Type</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                        <th className="px-3 py-1.5">Gas</th>
                        <th className="px-3 py-1.5 text-right">Bills</th>
                        <th className="px-3 py-1.5 text-right">Total Cu.M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(salesSummary?.byGas || []).map((r) => (
                        <tr key={r.gasCode || "NA"} className="border-b border-slate-100">
                          <td className="px-3 py-1.5">{r.gasCode || "-"}</td>
                          <td className="px-3 py-1.5 text-right">{countValue(r.count)}</td>
                          <td className="px-3 py-1.5 text-right">{r.totalCum ?? 0}</td>
                        </tr>
                      ))}
                      {!salesSummary?.byGas?.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No gas summary</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-slate-800">By Customer</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                        <th className="px-3 py-1.5">Customer</th>
                        <th className="px-3 py-1.5 text-right">Bills</th>
                        <th className="px-3 py-1.5 text-right">Total Cu.M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(salesSummary?.byCustomer || []).map((r, idx) => (
                        <tr key={`${r?.code || "NA"}-${idx}`} className="border-b border-slate-100">
                          <td className="px-3 py-1.5">{r?.code || "-"} - {r?.name || "-"}</td>
                          <td className="px-3 py-1.5 text-right">{countValue(r?.count)}</td>
                          <td className="px-3 py-1.5 text-right">{r?.totalCum ?? 0}</td>
                        </tr>
                      ))}
                      {!salesSummary?.byCustomer?.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No customer summary</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Party Wise Rental */}
      {activeReport === "party-rental" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Party Wise Rental</CardTitle></CardHeader>
          <CardContent>
            {partyRentalLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Party</th>
                    <th className="px-3 py-1.5 text-right">Total Cylinders Returned</th>
                    <th className="px-3 py-1.5 text-right">Total Days</th>
                    <th className="px-3 py-1.5 text-right">Total Rent Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {(partyRental || []).map((r) => (
                    <tr key={r.partyCode} className="border-b border-slate-100">
                      <td className="px-3 py-1.5">{r.partyCode} - {r.partyName}</td>
                      <td className="px-3 py-1.5 text-right">{r.count || 0}</td>
                      <td className="px-3 py-1.5 text-right">{r.totalDays || 0}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatINR(r.totalRent || 0)}</td>
                    </tr>
                  ))}
                  {!partyRental?.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No rental records</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Cash Book */}
      {activeReport === "cash-book" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Cash Book</CardTitle></CardHeader>
          <CardContent>
            {cashBookLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Voucher No</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Party</th>
                    <th className="px-3 py-1.5">Particular</th>
                    <th className="px-3 py-1.5 text-right">Debit</th>
                    <th className="px-3 py-1.5 text-right">Credit</th>
                    <th className="px-3 py-1.5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(cashBook || []).map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-xs">{e.voucherNumber}</td>
                      <td className="px-3 py-1.5">{formatDate(e.voucherDate)}</td>
                      <td className="px-3 py-1.5">{e.customer?.name || e.partyCode || "-"}</td>
                      <td className="px-3 py-1.5">{e.particular || "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.debitAmount ? formatINR(e.debitAmount) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.creditAmount ? formatINR(e.creditAmount) : "-"}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatINR(e.runningBalance || 0)}</td>
                    </tr>
                  ))}
                  {!cashBook?.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No cash book entries</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Bank Book */}
      {activeReport === "bank-book" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Bank Book</CardTitle></CardHeader>
          <CardContent>
            {bankBookLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Voucher No</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Party</th>
                    <th className="px-3 py-1.5">Particular</th>
                    <th className="px-3 py-1.5 text-right">Debit</th>
                    <th className="px-3 py-1.5 text-right">Credit</th>
                    <th className="px-3 py-1.5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(bankBook || []).map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-xs">{e.voucherNumber}</td>
                      <td className="px-3 py-1.5">{formatDate(e.voucherDate)}</td>
                      <td className="px-3 py-1.5">{e.customer?.name || e.partyCode || "-"}</td>
                      <td className="px-3 py-1.5">{e.particular || "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.debitAmount ? formatINR(e.debitAmount) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.creditAmount ? formatINR(e.creditAmount) : "-"}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatINR(e.runningBalance || 0)}</td>
                    </tr>
                  ))}
                  {!bankBook?.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No bank book entries</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* Journal Book */}
      {activeReport === "journal-book" && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ fontFamily: "var(--font-heading)" }}>Journal Book</CardTitle></CardHeader>
          <CardContent>
            {journalBookLoading ? <div className="py-8 text-center text-slate-400">Loading...</div> :
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    <th className="px-3 py-1.5">Voucher No</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Party</th>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5">Particular</th>
                    <th className="px-3 py-1.5 text-right">Debit</th>
                    <th className="px-3 py-1.5 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(journalBook || []).map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-xs">{e.voucherNumber}</td>
                      <td className="px-3 py-1.5">{formatDate(e.voucherDate)}</td>
                      <td className="px-3 py-1.5">{e.customer?.name || e.partyCode || "-"}</td>
                      <td className="px-3 py-1.5">{(e.transactionType || "-").replace(/_/g, " ")}</td>
                      <td className="px-3 py-1.5">{e.particular || "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.debitAmount ? formatINR(e.debitAmount) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{e.creditAmount ? formatINR(e.creditAmount) : "-"}</td>
                    </tr>
                  ))}
                  {!journalBook?.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No journal entries</td></tr>}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}
    </div>
  );
}
