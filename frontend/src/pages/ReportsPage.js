import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Download } from "lucide-react";

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState("holding");
  const [filters, setFilters] = useState({ customerId: "", gasCode: "", dateFrom: "", dateTo: "", date: new Date().toISOString().split("T")[0] });

  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const { data: holdingData, isLoading: holdingLoading, refetch: refetchHolding } = useQuery({
    queryKey: ["report-holding", filters.customerId, filters.gasCode],
    queryFn: () => api.get("/reports/holding-statement", { params: { customerId: filters.customerId || undefined, gasCode: filters.gasCode || undefined } }).then(r => r.data),
    enabled: activeReport === "holding",
  });

  const { data: dailyData, isLoading: dailyLoading, refetch: refetchDaily } = useQuery({
    queryKey: ["report-daily", filters.date],
    queryFn: () => api.get("/reports/daily-report", { params: { date: filters.date } }).then(r => r.data),
    enabled: activeReport === "daily",
  });

  const { data: customerStmt, isLoading: stmtLoading, refetch: refetchStmt } = useQuery({
    queryKey: ["report-customer-stmt", filters.customerId, filters.dateFrom, filters.dateTo],
    queryFn: () => api.get("/reports/customer-statement", { params: { customerId: filters.customerId, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined } }).then(r => r.data),
    enabled: activeReport === "customer-stmt" && !!filters.customerId,
  });

  const { data: trialBalance, isLoading: tbLoading, refetch: refetchTB } = useQuery({
    queryKey: ["report-trial-balance", filters.dateFrom, filters.dateTo],
    queryFn: () => api.get("/reports/trial-balance", { params: { dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined } }).then(r => r.data),
    enabled: activeReport === "trial-balance",
  });

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs no-print"><Printer className="w-3.5 h-3.5 mr-1" /> Print</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs no-print"><Download className="w-3.5 h-3.5 mr-1" /> Export PDF</Button>
        </div>
      </div>

      <Tabs value={activeReport} onValueChange={setActiveReport} className="no-print">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="holding" data-testid="report-tab-holding">Holding Statement</TabsTrigger>
          <TabsTrigger value="daily" data-testid="report-tab-daily">Daily Report</TabsTrigger>
          <TabsTrigger value="customer-stmt" data-testid="report-tab-customer-stmt">Customer Statement</TabsTrigger>
          <TabsTrigger value="trial-balance" data-testid="report-tab-trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="sale-txn" data-testid="report-tab-sale-txn">Sale Transactions</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap bg-white p-3 rounded-md border border-slate-200 no-print">
        {(activeReport === "holding" || activeReport === "customer-stmt") && (
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
        {activeReport === "holding" && (
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
        {activeReport === "daily" && (
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="h-9 mt-1 w-40" />
          </div>
        )}
        {(activeReport === "customer-stmt" || activeReport === "trial-balance" || activeReport === "sale-txn") && (
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
    </div>
  );
}
