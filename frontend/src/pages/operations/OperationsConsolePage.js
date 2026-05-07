import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  CreditCard,
  PackageCheck,
  RotateCcw,
  Truck,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux/workflow";

function Metric({ label, value, hint, tone = "blue" }) {
  const toneClass = {
    blue: "border-t-blue-400",
    amber: "border-t-amber-400",
    red: "border-t-red-400",
    emerald: "border-t-emerald-400",
  }[tone];

  return (
    <div className={`rounded-lg border border-border border-t-2 ${toneClass} bg-card px-4 py-3 shadow-sm`}>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function QueueTable({ title, rows, columns, empty }) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table text-left">
            <thead>
              <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.type || title}-${row.id || index}`}>
                  {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={empty} description="No operator action needed in this queue." className="rounded-none border-0 shadow-none" />
      )}
    </section>
  );
}

export default function OperationsConsolePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["operations-console"],
    queryFn: () => api.get("/operations/console").then((response) => response.data),
    refetchInterval: 30000,
  });

  const stats = data?.stats || {};
  const dispatchQueue = data?.dispatchQueue || [];
  const returnsQueue = data?.returnsQueue || [];
  const overdueCylinders = data?.overdueCylinders || [];
  const pendingPayments = data?.pendingPayments || [];

  if (isLoading) {
    return <div className="page-shell text-sm text-muted-foreground">Loading operations console...</div>;
  }

  return (
    <div className="page-shell" data-testid="operations-console-page">
      <section className="page-header">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Daily operations</div>
            <h1 className="page-title">Operator console</h1>
            <p className="page-subtitle">Dispatch, returns, overdue exposure, and payment pressure in one working screen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-10 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]">
              <Link to="/transactions"><ArrowRightLeft className="h-4 w-4" /> Issue</Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/ecr"><RotateCcw className="h-4 w-4" /> Return</Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/challans"><Truck className="h-4 w-4" /> Challan</Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/accounting/payment-receipt"><CreditCard className="h-4 w-4" /> Payment</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Dispatch queue" value={stats.pendingDeliveries || 0} hint={`${stats.todayIssues || 0} cylinders issued today`} tone="blue" />
        <Metric label="Return queue" value={stats.activeReturns || 0} hint={`${stats.todayReturns || 0} returns today`} tone="emerald" />
        <Metric label="Overdue cylinders" value={stats.overdueCylinders || 0} hint={`Threshold ${data?.thresholdDays || 30} days`} tone="red" />
        <Metric label="Pending payments" value={formatINR(stats.outstandingAmount || 0)} hint={`${stats.pendingPayments || 0} parties`} tone="amber" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <QueueTable
          title="Dispatch queue"
          rows={dispatchQueue}
          empty="Dispatch queue is clear"
          columns={[
            { key: "ref", label: "Ref", render: (row) => <span className="font-mono text-xs font-semibold">{row.refNumber}</span> },
            { key: "party", label: "Party", render: (row) => <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" to={`/customers/${row.customer?.id}/command`}>{row.customer?.code || "-"} - {row.customer?.name || "-"}</Link> },
            { key: "date", label: "Date", render: (row) => formatDate(row.date) },
            { key: "qty", label: "Qty", render: (row) => row.quantityCyl || "-" },
            { key: "type", label: "Type", render: (row) => <span className="rounded bg-muted px-2 py-1 text-xs font-semibold">{row.type}</span> },
          ]}
        />

        <QueueTable
          title="Pending payments"
          rows={pendingPayments}
          empty="No pending payments"
          columns={[
            { key: "party", label: "Party", render: (row) => <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" to={`/customers/${row.customerId}/command`}>{row.partyCode} - {row.partyName}</Link> },
            { key: "balance", label: "Balance", render: (row) => <span className="font-semibold text-amber-700 dark:text-amber-300">{formatINR(row.balance)}</span> },
          ]}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <QueueTable
          title="Return queue"
          rows={returnsQueue}
          empty="No active holdings"
          columns={[
            { key: "cyl", label: "Cylinder", render: (row) => <Link className="font-mono text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300" to={`/cylinders/${row.cylinder?.id}/timeline`}>{row.cylinder?.cylinderNumber || "-"}</Link> },
            { key: "party", label: "Party", render: (row) => row.customer?.code || "-" },
            { key: "issued", label: "Issued", render: (row) => formatDate(row.issuedAt) },
            { key: "days", label: "Days", render: (row) => <span className={row.overdue ? "font-semibold text-red-600" : "font-semibold"}>{row.holdDays}</span> },
          ]}
        />

        <QueueTable
          title="Overdue cylinders"
          rows={overdueCylinders}
          empty="No overdue cylinders"
          columns={[
            { key: "cyl", label: "Cylinder", render: (row) => <span className="font-mono text-xs font-semibold">{row.cylinder?.cylinderNumber || "-"}</span> },
            { key: "party", label: "Party", render: (row) => <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" to={`/customers/${row.customer?.id}/command`}>{row.customer?.code || "-"}</Link> },
            { key: "days", label: "Days", render: (row) => <span className="font-semibold text-red-600">{row.holdDays}</span> },
            { key: "flag", label: "Flag", render: () => <AlertTriangle className="h-4 w-4 text-red-600" /> },
          ]}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PackageCheck className="h-4 w-4" />
          Stock health
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {(data?.stockHealth || []).map((item) => (
            <div key={item.status} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
              <div className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.status.replace(/_/g, " ")}</div>
              <div className="mt-1 text-lg font-bold text-foreground">{item.count}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
