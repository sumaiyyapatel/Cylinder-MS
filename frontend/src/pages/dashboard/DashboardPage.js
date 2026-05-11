import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  BookOpen,
  Clock3,
  CreditCard,
  FileText,
  IndianRupee,
  Package,
  RefreshCw,
  RotateCcw,
  Settings,
  Truck,
  UserCog,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLES, canAccessPath } from "@/lib/iam";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dashboardCopy = {
  ADMIN: {
    eyebrow: "Admin dashboard",
    title: "Access, audit pressure, money, and movement.",
    subtitle: "A single control view for exceptions that need owner action before daily closure.",
  },
  MANAGER: {
    eyebrow: "Manager dashboard",
    title: "Dispatch, returns, overdue exposure, and daily movement.",
    subtitle: "A focused operations view for flow, customer exposure, and report shortcuts.",
  },
  OPERATOR: {
    eyebrow: "Operator dashboard",
    title: "Today's issue, return, dispatch, and overdue work.",
    subtitle: "A workbench for daily cylinder actions with accounting and admin noise removed.",
  },
  ACCOUNTANT: {
    eyebrow: "Accountant dashboard",
    title: "Collections, receivables, bills, and ledger movement.",
    subtitle: "A finance view for receipt pressure, billing, and ledger follow-up.",
  },
  VIEWER: {
    eyebrow: "Viewer dashboard",
    title: "Operational status and reports.",
    subtitle: "Viewer access is limited to safe visibility with no posting or maintenance actions.",
  },
};

const actionsByRole = {
  ADMIN: [
    ["/operations", "Dispatch workflow", Truck],
    ["/reports/accounting", "Accounting report", BookOpen],
    ["/users", "Users", UserCog],
    ["/settings", "Settings", Settings],
  ],
  MANAGER: [
    ["/operations", "Dispatch workflow", Truck],
    ["/reports/operations", "Operations report", BarChart3],
    ["/reports/sales", "Sales report", FileText],
    ["/transfers", "Transfers", Package],
  ],
  OPERATOR: [
    ["/operations", "Dispatch workflow", Truck],
    ["/transactions", "Issue", Package],
    ["/ecr", "Return", RotateCcw],
    ["/challans", "Challan", FileText],
  ],
  ACCOUNTANT: [
    ["/accounting/payment-receipt", "Receipt", CreditCard],
    ["/accounting/ledger", "Ledger", BookOpen],
    ["/reports/accounting", "Accounting report", BarChart3],
    ["/reports/sales", "Sales report", FileText],
  ],
  VIEWER: [
    ["/reports/operations", "Operations report", BarChart3],
    ["/customers", "Customers", FileText],
    ["/cylinders", "Cylinders", Package],
  ],
};

function DashboardSkeleton() {
  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="h-3 w-28 rounded-full bg-white/15" />
        <div className="mt-4 h-9 max-w-lg rounded-lg bg-white/10" />
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card h-28 animate-pulse" />
        ))}
      </div>
    </div>
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
        <div className="min-w-0">
          <div className="metric-meta">{label}</div>
          <div className="metric-value mt-3 truncate">{value}</div>
          <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Comp>
  );
}

function QuickActions({ role, navigate }) {
  const actions = (actionsByRole[role] || actionsByRole.VIEWER).filter(([path]) => canAccessPath(role, path));
  if (!actions.length) return null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {actions.map(([path, label, Icon]) => (
        <button
          key={path}
          type="button"
          onClick={() => navigate(path)}
          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-muted"
        >
          <span className="truncate">{label}</span>
          <Icon className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        </button>
      ))}
    </section>
  );
}

function RoleFocusPanel({ role, stats, navigate }) {
  const focusByRole = {
    ADMIN: {
      title: "Admin control loop",
      copy: "Resolve the highest-risk blockers first: alerts, overdue cylinders, receivables, and access changes.",
      items: [
        ["Unresolved alerts", stats.unresolvedAlerts || 0, "Needs review", BellRing, "/notifications"],
        ["Overdue cylinders", stats.overdueCylinders || 0, "Operational risk", AlertTriangle, "/reports/operations?tab=holding&filter=overdue"],
        ["Outstanding", formatINR(stats.outstandingPayments || 0), "Collection exposure", CreditCard, "/reports/accounting?tab=outstanding"],
        ["User access", "Manage", "Admin only", UserCog, "/users"],
      ],
    },
    MANAGER: {
      title: "Manager operating view",
      copy: "Keep dispatch, returns, overdue holdings, and stock mix moving without opening accounting screens.",
      items: [
        ["Issued today", stats.cylindersOutToday || 0, "Dispatch throughput", Package, "/transactions"],
        ["Returned today", stats.cylindersReturnedToday || 0, "ECR throughput", RotateCcw, "/ecr"],
        ["Needs ECR", stats.pendingEcrs || 0, "Open holdings", Clock3, "/reports/operations?tab=holding"],
        ["Dispatch", "Open", "Plan and complete runs", Truck, "/operations"],
      ],
    },
    OPERATOR: {
      title: "Operator workbench",
      copy: "Start from the action needed now. Issue, return, challan, and dispatch stay one click away.",
      items: [
        ["Issue", "Open", "Bill cum challan", Package, "/transactions"],
        ["Return", "Open", "ECR entry", RotateCcw, "/ecr"],
        ["Challan", "Open", "Delivery note", FileText, "/challans"],
        ["Dispatch", "Open", "Queue and runs", Truck, "/operations"],
      ],
    },
    ACCOUNTANT: {
      title: "Accounts closing view",
      copy: "Follow cash, receivables, bills, and ledger movement without operational dispatch controls.",
      items: [
        ["Collected today", formatINR(stats.cashCollectedToday || 0), "Receipts posted", IndianRupee, "/reports/accounting?tab=cash-book"],
        ["Outstanding", formatINR(stats.outstandingPayments || 0), "Receivable pressure", CreditCard, "/reports/accounting?tab=outstanding"],
        ["Sales today", formatINR(stats.salesToday || 0), `${stats.billsToday || 0} bills`, FileText, "/reports/sales"],
        ["Ledger", "Open", "Account movement", BookOpen, "/accounting/ledger"],
      ],
    },
    VIEWER: {
      title: "Read-only status view",
      copy: "Safe visibility into cylinder movement and reports. Posting and maintenance actions stay hidden.",
      items: [
        ["Needs ECR", stats.pendingEcrs || 0, "Open holdings", Clock3, "/reports/operations?tab=holding"],
        ["Overdue", stats.overdueCylinders || 0, "Held past threshold", AlertTriangle, "/reports/operations?tab=holding&filter=overdue"],
        ["Issued today", stats.cylindersOutToday || 0, "Movement count", Package, "/reports/operations"],
        ["Cylinders", "Open", "Master visibility", Package, "/cylinders"],
      ],
    },
  };

  const focus = focusByRole[role] || focusByRole.VIEWER;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{focus.title}</h2>
          <p className="section-copy mt-1">{focus.copy}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
          {focus.items.map(([label, value, hint, Icon, path]) => {
            const target = path?.split("?")[0];
            const enabled = target ? canAccessPath(role, target) : false;
            const Comp = enabled ? "button" : "div";

            return (
              <Comp
                key={label}
                type={enabled ? "button" : undefined}
                onClick={enabled ? () => navigate(path) : undefined}
                className="rounded-lg border border-border bg-muted/45 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
                    <div className="mt-1 truncate text-base font-bold text-foreground">{value}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                </div>
              </Comp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EmptyTableRow({ colSpan, label }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

function WorkQueue({ rows }) {
  return (
    <Card className="section-card">
      <CardHeader className="section-header">
        <div>
          <CardTitle className="section-title">Work queue</CardTitle>
          <p className="section-copy">Open cylinder holdings that need attention.</p>
        </div>
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
                {rows.length ? rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="mono-value text-xs font-semibold">{item.cylinder?.cylinderNumber || "-"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.cylinder?.gasCode || "-"} / {item.cylinder?.ownerCode || "-"}</div>
                    </td>
                    <td>
                      <div className="font-medium text-foreground">{item.customer?.name || "-"}</div>
                      <div className="mono-value mt-1 text-xs text-muted-foreground">{item.customer?.code || "-"}</div>
                    </td>
                    <td>{formatDate(item.issuedAt)}</td>
                    <td className="text-right font-semibold">{item.holdDays || 0}</td>
                    <td>{item.status || "-"}</td>
                  </tr>
                )) : <EmptyTableRow colSpan={5} label="No overdue holdings." />}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CashPressure({ stats, rows, navigate }) {
  return (
    <Card className="section-card">
      <CardHeader className="section-header">
        <div>
          <CardTitle className="section-title">Cash pressure</CardTitle>
          <p className="section-copy">Collection status and largest outstanding parties.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/reports/accounting?tab=outstanding")}>
          Report
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-muted p-4">
            <div className="metric-meta">Collected today</div>
            <div className="metric-value mt-2 text-xl">{formatINR(stats.cashCollectedToday || 0)}</div>
          </div>
          <div className="surface-muted p-4">
            <div className="metric-meta">Outstanding</div>
            <div className="metric-value mt-2 text-xl">{formatINR(stats.outstandingPayments || 0)}</div>
          </div>
        </div>
        {rows.length ? rows.map((item) => (
          <div key={item.partyCode || item.partyName} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{item.partyName || "-"}</div>
              <div className="mono-value mt-1 text-xs text-muted-foreground">{item.partyCode || "-"}</div>
            </div>
            <div className="text-sm font-semibold text-foreground">{formatINR(item.balance || 0)}</div>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No outstanding balances.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentBills({ rows, navigate }) {
  return (
    <Card className="section-card">
      <CardHeader className="section-header">
        <div>
          <CardTitle className="section-title">Recent bills</CardTitle>
          <p className="section-copy">Latest finalized invoices.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/transactions")}>
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
                {rows.length ? rows.map((bill) => (
                  <tr key={bill.id}>
                    <td className="mono-value text-xs font-semibold">{bill.billNumber}</td>
                    <td>{formatDate(bill.billDate)}</td>
                    <td>{bill.customer?.name || "-"}</td>
                    <td className="text-right">{bill.totalCylinders || 0}</td>
                    <td className="text-right font-semibold">{formatINR(bill.totalAmount || 0)}</td>
                  </tr>
                )) : <EmptyTableRow colSpan={5} label="No recent bills." />}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StockHealth({ gasMix, topCustomers }) {
  const total = gasMix.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="section-card">
      <CardHeader className="section-header">
        <div>
          <CardTitle className="section-title">Stock health</CardTitle>
          <p className="section-copy">Gas mix and customers holding the most cylinders.</p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          {gasMix.length ? gasMix.map((item) => {
            const pct = total ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-foreground">{item.name}</span>
                  <span className="mono-value text-muted-foreground">{item.value} ({pct}%)</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No stock mix data.</div>
          )}
        </div>
        <div className="space-y-2">
          {topCustomers.length ? topCustomers.map((customer) => (
            <div key={customer.code} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{customer.name}</div>
                <div className="mono-value mt-1 text-xs text-muted-foreground">{customer.code}</div>
              </div>
              <div className="text-lg font-bold text-foreground">{customer.cylindersHeld}</div>
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No active holdings.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleDashboardSections({ role, stats, overdueHoldings, topOutstanding, gasMix, topCustomers, recentBills, navigate }) {
  if (role === ROLES.ACCOUNTANT) {
    return (
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <CashPressure stats={stats} rows={topOutstanding} navigate={navigate} />
        <RecentBills rows={recentBills} navigate={navigate} />
      </section>
    );
  }

  if (role === ROLES.OPERATOR) {
    return (
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <WorkQueue rows={overdueHoldings} />
        <StockHealth gasMix={gasMix} topCustomers={topCustomers} />
      </section>
    );
  }

  if (role === ROLES.MANAGER) {
    return (
      <>
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <WorkQueue rows={overdueHoldings} />
          <StockHealth gasMix={gasMix} topCustomers={topCustomers} />
        </section>
        <RecentBills rows={recentBills} navigate={navigate} />
      </>
    );
  }

  if (role === ROLES.ADMIN) {
    return (
      <>
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <CashPressure stats={stats} rows={topOutstanding} navigate={navigate} />
          <WorkQueue rows={overdueHoldings} />
        </section>
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <RecentBills rows={recentBills} navigate={navigate} />
          <StockHealth gasMix={gasMix} topCustomers={topCustomers} />
        </section>
      </>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <StockHealth gasMix={gasMix} topCustomers={topCustomers} />
      <WorkQueue rows={overdueHoldings} />
    </section>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || ROLES.VIEWER;
  const profile = dashboardCopy[role] || dashboardCopy.VIEWER;

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((response) => response.data),
    refetchInterval: 30000,
  });

  const stats = data?.stats || {};
  const recentBills = data?.recentBills || [];
  const overdueHoldings = data?.overdueHoldings || [];
  const topCustomers = data?.topCustomers || [];
  const topOutstanding = data?.topOutstanding || [];

  const gasMix = useMemo(() => {
    const sorted = (data?.cylindersByGas || [])
      .map((item) => ({ name: item.gasCode || "-", value: item.count || 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const visible = sorted.slice(0, 5);
    const others = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
    return others > 0 ? [...visible, { name: "Other", value: others }] : visible;
  }, [data]);

  const metricDefinitions = {
    issued: ["Issued today", stats.cylindersOutToday || 0, "Cylinder issue rows today", Package, "blue", "/transactions"],
    returned: ["Returned today", stats.cylindersReturnedToday || 0, "ECR rows created today", RotateCcw, "green", "/ecr"],
    needsEcr: ["Needs ECR", stats.pendingEcrs || 0, "Cylinder holdings still open", Clock3, "amber", "/reports/operations?tab=holding"],
    overdue: ["Overdue", stats.overdueCylinders || 0, `${stats.unresolvedAlerts || 0} unresolved alerts`, AlertTriangle, "red", "/reports/operations?tab=holding&filter=overdue"],
    cash: ["Collected today", formatINR(stats.cashCollectedToday || 0), "Cash and bank receipts", IndianRupee, "green", "/reports/accounting?tab=cash-book"],
    outstanding: ["Outstanding", formatINR(stats.outstandingPayments || 0), "Receivable pressure", CreditCard, "amber", "/reports/accounting?tab=outstanding"],
    sales: ["Sales today", formatINR(stats.salesToday || 0), `${stats.billsToday || 0} bills finalized`, FileText, "blue", "/reports/sales"],
    alerts: ["Alerts", stats.unresolvedAlerts || 0, "Unresolved notifications", BellRing, "red", "/notifications"],
  };

  const metricKeysByRole = {
    ADMIN: ["overdue", "outstanding", "issued", "alerts"],
    MANAGER: ["issued", "returned", "needsEcr", "overdue"],
    OPERATOR: ["issued", "returned", "needsEcr", "overdue"],
    ACCOUNTANT: ["cash", "outstanding", "sales", "alerts"],
    VIEWER: ["needsEcr", "overdue", "issued", "returned"],
  };

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "Waiting for data";

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="page-shell" data-testid="dashboard-page">
      <section className="page-header">
        <div className="page-eyebrow">{profile.eyebrow}</div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="page-title">{profile.title}</h1>
            <p className="page-subtitle">{profile.subtitle}</p>
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

      <QuickActions role={role} navigate={navigate} />
      <RoleFocusPanel role={role} stats={stats} navigate={navigate} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-stats">
        {(metricKeysByRole[role] || metricKeysByRole.VIEWER).map((key) => {
          const [label, value, hint, Icon, tone, path] = metricDefinitions[key];
          const canOpen = path ? canAccessPath(role, path.split("?")[0]) : false;
          return (
            <MetricCard
              key={key}
              label={label}
              value={value}
              hint={hint}
              icon={Icon}
              tone={tone}
              onClick={canOpen ? () => navigate(path) : undefined}
            />
          );
        })}
      </section>

      <RoleDashboardSections
        role={role}
        stats={stats}
        overdueHoldings={overdueHoldings}
        topOutstanding={topOutstanding}
        gasMix={gasMix}
        topCustomers={topCustomers}
        recentBills={recentBills}
        navigate={navigate}
      />
    </div>
  );
}
