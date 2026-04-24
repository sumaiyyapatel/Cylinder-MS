import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  CreditCard,
  IndianRupee,
  LineChart,
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const chartColors = ["#1e3a5f", "#d97706", "#10b981", "#3b82f6", "#ef4444", "#a855f7"];

function DashboardSkeleton() {
  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="h-3 w-24 rounded-full bg-white/15" />
        <div className="mt-4 h-10 max-w-md rounded-2xl bg-white/10" />
        <div className="mt-3 h-5 max-w-2xl rounded-2xl bg-white/10" />
      </section>
      <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card h-32 animate-pulse bg-white/70" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="section-card h-[420px] animate-pulse" />
        <div className="section-card h-[420px] animate-pulse" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const rotationRef = useRef(null);
  const gasMixRef = useRef(null);
  const [rotationWidth, setRotationWidth] = useState(0);
  const [gasMixWidth, setGasMixWidth] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;

    const observers = [];

    if (rotationRef.current) {
      const observer = new ResizeObserver(([entry]) => {
        setRotationWidth(Math.floor(entry?.contentRect?.width || 0));
      });
      observer.observe(rotationRef.current);
      setRotationWidth(rotationRef.current.clientWidth || 0);
      observers.push(observer);
    }

    if (gasMixRef.current) {
      const observer = new ResizeObserver(([entry]) => {
        setGasMixWidth(Math.floor(entry?.contentRect?.width || 0));
      });
      observer.observe(gasMixRef.current);
      setGasMixWidth(gasMixRef.current.clientWidth || 0);
      observers.push(observer);
    }

    return () => observers.forEach((obs) => obs.disconnect());
  }, [activeTab]);

  const stats = data?.stats || {};

  const rotationChartData = useMemo(() => {
    const dateMap = {};
    (data?.dailyIssues || []).forEach((item) => {
      const key = formatDate(item.date);
      if (!dateMap[key]) dateMap[key] = { date: key, issues: 0, returns: 0 };
      dateMap[key].issues = item.count;
    });
    (data?.dailyReturns || []).forEach((item) => {
      const key = formatDate(item.date);
      if (!dateMap[key]) dateMap[key] = { date: key, issues: 0, returns: 0 };
      dateMap[key].returns = item.count;
    });

    return Object.values(dateMap).sort((a, b) => {
      const [ad, am, ay] = a.date.split("/");
      const [bd, bm, by] = b.date.split("/");
      return new Date(`${ay}-${am}-${ad}`) - new Date(`${by}-${bm}-${bd}`);
    });
  }, [data]);

  const gasMix = (data?.cylindersByGas || []).map((item) => ({
    name: item.gasCode,
    value: item.count,
  }));

  const recentBills = (data?.recentTransactions || data?.recentBills || []).slice(0, 6);
  const topCustomers = (data?.topCustomers || []).slice(0, 5);
  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Waiting for data";

  const statCards = [
    {
      label: "Cylinders out today",
      value: stats.cylindersOutToday || 0,
      meta: "Issued from plant",
      icon: Package,
      tone: "bg-[rgba(30,58,95,0.08)] text-[var(--color-steel)]",
    },
    {
      label: "Returned today",
      value: stats.cylindersReturnedToday || 0,
      meta: "Back into rotation",
      icon: RotateCcw,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Pending ECR",
      value: stats.pendingEcrs || 0,
      meta: "Need operator action",
      icon: Clock3,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Overdue cylinders",
      value: stats.overdueCylinders || 0,
      meta: "Priority follow-up",
      icon: AlertTriangle,
      tone: "bg-red-50 text-red-700",
      onClick: () => navigate("/reports?tab=holding&filter=overdue"),
    },
  ];

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="page-eyebrow">Operations overview</div>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="page-title">Live cylinder rotation and billing pulse.</h1>
            <p className="page-subtitle">
              Operators get a quick reading on issues, returns, overdue stock, and collection pressure before starting the next action.
            </p>
          </div>
          <div className="grid gap-3 sm:min-w-[340px]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900 text-whitepx-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">Cash today</div>
                <div className="mt-1 title-font text-xl font-bold">{formatINR(stats.cashCollectedToday)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900 text-whitepx-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">Outstanding</div>
                <div className="mt-1 title-font text-xl font-bold">{formatINR(stats.outstandingPayments)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900 text-whitepx-4 py-3 col-span-2 sm:col-span-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">Plant health</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-200">
                  <Truck className="h-4 w-4" />
                  Rotation active
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 text-whitepx-4 py-3 text-sm">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">Last updated</div>
                <div className="mt-1 font-medium text-white">{lastUpdatedLabel}</div>
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
        </div>
      </section>

      <section className="filter-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Dashboard focus</div>
            <div className="mt-1 text-sm text-slate-500">Show only the metrics needed for the current task.</div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-slate-100 p-1.5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="logistics">Logistics</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </section>

      {(activeTab === "overview" || activeTab === "sales" || activeTab === "logistics") && (
        <section className="stats-grid" data-testid="dashboard-stats">
          {statCards.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`stat-card text-left ${item.onClick ? "cursor-pointer" : "cursor-default"}`}
              onClick={item.onClick}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="metric-meta">{item.label}</div>
                  <div className="metric-value mt-3">{item.value}</div>
                  <div className="mt-2 text-sm text-slate-500">{item.meta}</div>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                  <item.icon className="h-5 w-5" />
                </div>
              </div>
              {item.onClick ? (
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700">
                  Review now
                  <ArrowRight className="h-4 w-4" />
                </div>
              ) : null}
            </button>
          ))}
        </section>
      )}

      {(activeTab === "overview" || activeTab === "sales" || activeTab === "logistics") && (
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
        <Card className="section-card overflow-hidden">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Rotation trend</CardTitle>
              <p className="section-copy">Issues vs returns over the last 30 days.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/transactions")}>
              New bill
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div ref={rotationRef} className="surface-muted h-[340px] px-2 py-3">
              {rotationChartData.length && rotationWidth > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={rotationChartData} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe2ea" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
                      }}
                    />
                    <Bar dataKey="issues" name="Issues" fill="#1e3a5f" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="returns" name="Returns" fill="#d97706" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No transaction trend available yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Gas mix</CardTitle>
              <p className="section-copy">Current cylinder distribution by gas type.</p>
            </div>
            <div className="status-pill status-pill-info">
              <BarChart3 className="mr-1 h-3.5 w-3.5" />
              Live split
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div ref={gasMixRef} className="surface-muted h-[240px] px-2 py-3">
              {gasMix.length && gasMixWidth > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={gasMix}
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {gasMix.map((entry, index) => (
                        <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No gas inventory data.
                </div>
              )}
            </div>

            <div className="grid gap-2">
              {gasMix.length ? (
                gasMix.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                      />
                      <span className="font-medium text-slate-700">{item.name}</span>
                    </div>
                    <span className="mono-value text-sm font-semibold text-slate-900">{item.value}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No gas breakup available.</div>
              )}
            </div>
          </CardContent>
        </Card>
        </section>
      )}

      {(activeTab === "overview" || activeTab === "sales" || activeTab === "finance" || activeTab === "logistics") && (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="section-card">
          <CardHeader className="section-header">
            <div>
              <CardTitle className="section-title">Recent billing activity</CardTitle>
              <p className="section-copy">Latest documents created by the operations desk.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/transactions")}>
              Open bills
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="data-table-shell border-0 shadow-none">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bill no</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.length ? (
                      recentBills.map((bill, index) => (
                        <tr key={bill.id || `${bill.billNumber}-${index}`}>
                          <td className="mono-value text-xs font-semibold">{bill.billNumber || "-"}</td>
                          <td>{formatDate(bill.billDate)}</td>
                          <td>{bill.customer?.name || "-"}</td>
                          <td className="text-right">{bill.totalQuantity || bill.quantityCum || "-"}</td>
                          <td className="text-right font-semibold">
                            {bill.totalAmount != null ? formatINR(bill.totalAmount) : "-"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No recent bills found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {(activeTab === "overview" || activeTab === "finance") && (
            <Card className="section-card">
            <CardHeader className="section-header">
              <div>
                <CardTitle className="section-title">Collection pressure</CardTitle>
                <p className="section-copy">Fast read on cash and outstanding amounts.</p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="surface-muted p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <IndianRupee className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="metric-meta">Cash collected today</div>
                    <div className="metric-value mt-2 text-xl">{formatINR(stats.cashCollectedToday)}</div>
                  </div>
                </div>
              </div>
              <div className="surface-muted p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="metric-meta">Outstanding</div>
                    <div className="metric-value mt-2 text-xl">{formatINR(stats.outstandingPayments)}</div>
                  </div>
                </div>
              </div>
            </CardContent>
            </Card>
          )}

          {(activeTab === "overview" || activeTab === "logistics") && (
            <Card className="section-card">
            <CardHeader className="section-header">
              <div>
                <CardTitle className="section-title">Top holding customers</CardTitle>
                <p className="section-copy">Parties currently holding the most cylinders.</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {topCustomers.length ? (
                topCustomers.map((customer, index) => (
                  <div key={`${customer.code}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div>
                      <div className="mono-value text-xs font-semibold text-slate-500">{customer.code}</div>
                      <div className="mt-1 font-medium text-slate-800">{customer.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="metric-value text-xl">{customer.cylindersHeld}</div>
                      <div className="text-xs text-slate-500">cylinders</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  No holding data yet.
                </div>
              )}
            </CardContent>
            </Card>
          )}

          {activeTab === "sales" && (
            <Card className="section-card">
              <CardHeader className="section-header">
                <div>
                  <CardTitle className="section-title">Sales pulse</CardTitle>
                  <p className="section-copy">Quick read of order flow, quantity mix, and follow-up actions.</p>
                </div>
                <div className="status-pill status-pill-info">
                  <LineChart className="mr-1 h-3.5 w-3.5" />
                  Live sales
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="surface-muted p-4">
                  <div className="metric-meta">Recent bills</div>
                  <div className="metric-value mt-2 text-xl">{recentBills.length}</div>
                  <div className="mt-2 text-sm text-slate-500">Documents visible in current feed.</div>
                </div>
                <div className="surface-muted p-4">
                  <div className="metric-meta">Gas types active</div>
                  <div className="metric-value mt-2 text-xl">{gasMix.length}</div>
                  <div className="mt-2 text-sm text-slate-500">Mix shown in current inventory split.</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        </section>
      )}
    </div>
  );
}
