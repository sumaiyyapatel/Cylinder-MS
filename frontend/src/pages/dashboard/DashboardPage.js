import { useMemo, useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  Clock3,
  CreditCard,
  FileText,
  IndianRupee,
  Package,
  RefreshCw,
  RotateCcw,
  Truck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const lightChartTheme = {
  grid: "#dbe2ea",
  axis: "#64748b",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
  tooltipText: "#0f172a",
  issue: "#2563eb",
  return: "#d97706",
  gas: ["#2563eb", "#d97706", "#10b981", "#ef4444", "#7c3aed", "#0891b2"],
};

const darkChartTheme = {
  grid: "rgba(148, 163, 184, 0.24)",
  axis: "#cbd5e1",
  tooltipBg: "#111827",
  tooltipBorder: "#334155",
  tooltipText: "#f8fafc",
  issue: "#60a5fa",
  return: "#f59e0b",
  gas: ["#60a5fa", "#f59e0b", "#34d399", "#f87171", "#a78bfa", "#22d3ee"],
};

function getLocalDateKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(key) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function useChartTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark ? darkChartTheme : lightChartTheme;
}

function DashboardSkeleton() {
  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="h-3 w-28 rounded-full bg-white/15" />
        <div className="mt-4 h-9 max-w-lg rounded-lg bg-white/10" />
        <div className="mt-3 h-5 max-w-2xl rounded-lg bg-white/10" />
      </section>
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card h-32 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="section-card h-[360px] animate-pulse" />
        <div className="section-card h-[360px] animate-pulse" />
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, label }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">
        {label}
      </td>
    </tr>
  );
}

function MetricCard({ label, value, hint, icon: Icon, tone = "blue", onClick }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  };

  const Comp = onClick ? "button" : "div";

  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className="stat-card text-left">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="metric-meta">{label}</div>
          <div className="metric-value mt-3">{value}</div>
          <div className="mt-2 text-sm text-slate-500">{hint}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {onClick ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Open
          <ArrowRight className="h-4 w-4" />
        </div>
      ) : null}
    </Comp>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const rotationRef = useRef(null);
  const gasMixRef = useRef(null);
  const [rotationWidth, setRotationWidth] = useState(0);
  const [gasMixWidth, setGasMixWidth] = useState(0);
  const chartTheme = useChartTheme();

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((response) => response.data),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observers = [];

    if (rotationRef.current) {
      const observer = new ResizeObserver(([entry]) => setRotationWidth(Math.max(0, Math.floor(entry?.contentRect?.width || 0))));
      observer.observe(rotationRef.current);
      setRotationWidth(rotationRef.current.clientWidth || 0);
      observers.push(observer);
    }

    if (gasMixRef.current) {
      const observer = new ResizeObserver(([entry]) => setGasMixWidth(Math.max(0, Math.floor(entry?.contentRect?.width || 0))));
      observer.observe(gasMixRef.current);
      setGasMixWidth(gasMixRef.current.clientWidth || 0);
      observers.push(observer);
    }

    return () => observers.forEach((observer) => observer.disconnect());
  }, [dataUpdatedAt]);

  const stats = data?.stats || {};
  const recentBills = data?.recentBills || [];
  const overdueHoldings = data?.overdueHoldings || [];
  const topCustomers = data?.topCustomers || [];
  const topOutstanding = data?.topOutstanding || [];

  const rotationChartData = useMemo(() => {
    const dateMap = new Map();
    const today = new Date();

    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = getLocalDateKey(date);
      dateMap.set(key, { key, date: formatShortDate(key), issues: 0, returns: 0 });
    }

    (data?.dailyIssues || []).forEach((item) => {
      const key = getLocalDateKey(item.date);
      if (dateMap.has(key)) {
        dateMap.set(key, { ...dateMap.get(key), issues: item.count || 0 });
      }
    });

    (data?.dailyReturns || []).forEach((item) => {
      const key = getLocalDateKey(item.date);
      if (dateMap.has(key)) {
        dateMap.set(key, { ...dateMap.get(key), returns: item.count || 0 });
      }
    });

    return Array.from(dateMap.values());
  }, [data]);

  const gasMix = useMemo(() => {
    const sorted = (data?.cylindersByGas || [])
      .map((item) => ({ name: item.gasCode || "-", value: item.count || 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const visible = sorted.slice(0, 5);
    const others = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
    return others > 0 ? [...visible, { name: "Other", value: others }] : visible;
  }, [data]);

  const totalGasCylinders = gasMix.reduce((sum, item) => sum + item.value, 0);
  const rotationChartWidth = Math.max(320, rotationWidth - 16);
  const gasMixChartWidth = Math.max(260, gasMixWidth - 16);

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "Waiting for data";

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="page-eyebrow">Operations command</div>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="page-title">Today, exceptions, money, and movement in one view.</h1>
            <p className="page-subtitle">
              The dashboard now separates work queues from summaries, so repeated values do not occupy the same space.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900 px-4 py-3 text-white">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">Last updated</div>
              <div className="mt-1 text-sm font-medium">{lastUpdatedLabel}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-stats">
        <MetricCard
          label="Issued today"
          value={stats.cylindersOutToday || 0}
          hint={`${stats.billsToday || 0} bills, ${formatINR(stats.salesToday || 0)} value`}
          icon={Package}
          tone="blue"
          onClick={() => navigate("/transactions")}
        />
        <MetricCard
          label="Returned today"
          value={stats.cylindersReturnedToday || 0}
          hint="ECR rows created today"
          icon={RotateCcw}
          tone="green"
          onClick={() => navigate("/ecr")}
        />
        <MetricCard
          label="Needs ECR"
          value={stats.pendingEcrs || 0}
          hint="Cylinder holdings still open"
          icon={Clock3}
          tone="amber"
          onClick={() => navigate("/reports/operations?tab=holding")}
        />
        <MetricCard
          label="Overdue"
          value={stats.overdueCylinders || 0}
          hint={`${stats.unresolvedAlerts || 0} unresolved alerts`}
          icon={AlertTriangle}
          tone="red"
          onClick={() => navigate("/reports/operations?tab=holding&filter=overdue")}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Work queue</CardTitle>
              <p className="section-copy">Items that need action instead of another metric card.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/reports/operations?tab=holding&filter=overdue")}>
              Overdue report
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="data-table-shell border-0 shadow-none">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cylinder</th>
                      <th>Customer</th>
                      <th>Issued</th>
                      <th className="text-right">Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueHoldings.length ? (
                      overdueHoldings.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="mono-value text-xs font-semibold">{item.cylinder?.cylinderNumber || "-"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.cylinder?.gasCode || "-"} / {item.cylinder?.ownerCode || "-"}</div>
                          </td>
                          <td>
                            <div className="font-medium text-slate-900">{item.customer?.name || "-"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.customer?.code || "-"}</div>
                          </td>
                          <td>{formatDate(item.issuedAt)}</td>
                          <td className="text-right font-semibold">{item.holdDays || 0}</td>
                          <td>{item.status || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={5} label="No overdue holdings." />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Cash pressure</CardTitle>
              <p className="section-copy">Collection status without repeating today cards.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="surface-muted p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <IndianRupee className="h-5 w-5" />
                </div>
                <div>
                  <div className="metric-meta">Collected today</div>
                  <div className="metric-value mt-2 text-xl">{formatINR(stats.cashCollectedToday || 0)}</div>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => navigate("/reports/accounting?tab=outstanding")} className="surface-muted w-full p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <div className="metric-meta">Outstanding receivable</div>
                  <div className="metric-value mt-2 text-xl">{formatINR(stats.outstandingPayments || 0)}</div>
                </div>
              </div>
            </button>
            <div className="space-y-2">
              {topOutstanding.length ? (
                topOutstanding.map((item) => (
                  <div key={item.partyCode} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{item.partyName || "-"}</div>
                      <div className="mono-value mt-1 text-xs text-slate-500">{item.partyCode || "-"}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{formatINR(item.balance || 0)}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-slate-500">
                  No outstanding balances.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Recent bills</CardTitle>
              <p className="section-copy">Latest invoices actually returned by the dashboard API.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/transactions")}>
              <FileText className="h-3.5 w-3.5" />
              Bills
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="data-table-shell border-0 shadow-none">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th className="text-right">Cyl</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.length ? (
                      recentBills.map((bill) => (
                        <tr key={bill.id}>
                          <td className="mono-value text-xs font-semibold">{bill.billNumber}</td>
                          <td>{formatDate(bill.billDate)}</td>
                          <td>{bill.customer?.name || "-"}</td>
                          <td className="text-right">{bill.totalCylinders || 0}</td>
                          <td className="text-right font-semibold">{formatINR(bill.totalAmount || 0)}</td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={5} label="No recent bills." />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Top holders</CardTitle>
              <p className="section-copy">Customers with the most cylinders currently out.</p>
            </div>
            <BellRing className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {topCustomers.length ? (
              topCustomers.map((customer) => (
                <div key={customer.code} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{customer.name}</div>
                    <div className="mono-value mt-1 text-xs text-slate-500">{customer.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="metric-value text-xl">{customer.cylindersHeld}</div>
                    <div className="text-xs text-slate-500">cylinders</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-slate-500">
                No active holdings.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="section-card overflow-hidden">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Thirty day movement</CardTitle>
              <p className="section-copy">Cylinder issue and return volume by day.</p>
            </div>
            <Truck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="p-5">
            <div ref={rotationRef} className="surface-muted h-[300px] px-2 py-3">
              {rotationChartData.length && rotationWidth >= 320 ? (
                  <BarChart width={rotationChartWidth} height={270} data={rotationChartData} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTheme.axis }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} />
                    <YAxis tick={{ fontSize: 11, fill: chartTheme.axis }} tickLine={false} axisLine={{ stroke: chartTheme.grid }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: chartTheme.grid }}
                      contentStyle={{
                        borderRadius: 8,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        background: chartTheme.tooltipBg,
                        color: chartTheme.tooltipText,
                      }}
                      labelStyle={{ color: chartTheme.tooltipText }}
                    />
                    <Bar dataKey="issues" name="Issues" fill={chartTheme.issue} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="returns" name="Returns" fill={chartTheme.return} radius={[6, 6, 0, 0]} />
                  </BarChart>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No movement trend available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Gas mix</CardTitle>
              <p className="section-copy">Current stock distribution.</p>
            </div>
            <div className="text-sm font-semibold text-slate-700">{totalGasCylinders} cylinders</div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div ref={gasMixRef} className="surface-muted h-[220px] px-2 py-3">
              {gasMix.length && gasMixWidth >= 260 ? (
                  <BarChart width={gasMixChartWidth} height={190} data={gasMix} layout="vertical" margin={{ top: 4, right: 18, left: 2, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={58}
                      tick={{ fontSize: 12, fill: chartTheme.axis }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: chartTheme.grid }}
                      formatter={(value) => [`${value} cylinders`, "Stock"]}
                      contentStyle={{
                        borderRadius: 8,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        background: chartTheme.tooltipBg,
                        color: chartTheme.tooltipText,
                      }}
                      labelStyle={{ color: chartTheme.tooltipText }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {gasMix.map((entry, index) => (
                        <Cell key={entry.name} fill={chartTheme.gas[index % chartTheme.gas.length]} />
                      ))}
                    </Bar>
                  </BarChart>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No gas mix data.
                </div>
              )}
            </div>
            <div className="grid gap-2">
              {gasMix.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartTheme.gas[index % chartTheme.gas.length] }} />
                    <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  </div>
                  <span className="mono-value text-sm font-semibold text-slate-900">
                    {item.value}
                    {totalGasCylinders ? ` (${Math.round((item.value / totalGasCylinders) * 100)}%)` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
