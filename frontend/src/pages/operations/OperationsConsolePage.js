import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  PackageCheck,
  Play,
  RotateCcw,
  Route,
  ScanLine,
  Truck,
  UserRound,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canAccessPath } from "@/lib/iam";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ux/workflow";

const statusClass = {
  PLANNED: "bg-muted text-muted-foreground",
  ASSIGNED: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200",
  LOADED: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-200",
  OUT_FOR_DELIVERY: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-200",
};

function Metric({ label, value, hint, tone = "blue" }) {
  const toneClass = {
    blue: "border-t-blue-400",
    amber: "border-t-amber-400",
    red: "border-t-red-400",
    emerald: "border-t-emerald-400",
  }[tone];

  return (
    <div className={`rounded-lg border border-border border-t-2 ${toneClass} bg-card px-3 py-2 shadow-sm`}>
      <div className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xl font-bold text-foreground">{value}</div>
      {hint ? <div className="truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${statusClass[status] || statusClass.PLANNED}`}>
      {String(status || "-").replace(/_/g, " ")}
    </span>
  );
}

function QueueTable({ title, rows, columns, empty, maxHeight = "max-h-[290px]" }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length ? (
        <div className={`${maxHeight} overflow-auto`}>
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

function DispatchQueue({ rows, selected, onToggle }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold text-foreground">Dispatch queue</h2>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length ? (
        <div className="max-h-[330px] overflow-auto">
          <table className="data-table text-left">
            <thead>
              <tr>
                <th className="w-10"></th>
                <th>Ref</th>
                <th>Party</th>
                <th>Date</th>
                <th>Qty</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.type}:${row.id}`;
                const checked = Boolean(selected[key]);
                return (
                  <tr key={key} className={checked ? "bg-accent/10" : ""}>
                    <td>
                      <input
                        aria-label={`Select ${row.refNumber}`}
                        checked={checked}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                        type="checkbox"
                        onChange={() => onToggle(row)}
                      />
                    </td>
                    <td><span className="font-mono text-xs font-semibold">{row.refNumber}</span></td>
                    <td>
                      <Link className="font-semibold text-[var(--color-accent)] hover:underline" to={`/customers/${row.customer?.id}/command`}>
                        {row.customer?.code || "-"} - {row.customer?.name || "-"}
                      </Link>
                    </td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.quantityCyl || row.quantityCum || "-"}</td>
                    <td><span className="rounded bg-muted px-2 py-1 text-xs font-semibold">{row.type}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Dispatch queue is clear" description="No operator action needed in this queue." className="rounded-none border-0 shadow-none" />
      )}
    </section>
  );
}

function DispatchRuns({ runs, onAssign, onStart, onCompleteItem, onCompleteRun, onReconcile, busy }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold text-foreground">Active dispatch</h2>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{runs.length}</span>
      </div>

      {runs.length ? (
        <div className="max-h-[430px] space-y-3 overflow-auto p-3">
          {runs.map((run) => {
            const allItemsDone = run.items?.length > 0 && run.items.every((item) => item.status === "COMPLETED");
            return (
              <div key={run.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">{run.dispatchNumber}</span>
                      <StatusPill status={run.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDate(run.dispatchDate)}</span>
                      <span>{run.vehicleNumber || "No vehicle"}</span>
                      <span>{run.driverName || "No driver"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy || run.status !== "PLANNED"} onClick={() => onAssign(run)}>
                      <UserRound className="h-4 w-4" /> Assign
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy || run.status === "OUT_FOR_DELIVERY"} onClick={() => onStart(run)}>
                      <Play className="h-4 w-4" /> Start
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onReconcile(run)}>
                      <Route className="h-4 w-4" /> Reconcile
                    </Button>
                    <Button size="sm" disabled={busy || !allItemsDone} onClick={() => onCompleteRun(run)}>
                      <CheckCircle2 className="h-4 w-4" /> Complete
                    </Button>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="data-table text-left">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Party</th>
                        <th>Status</th>
                        <th className="w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(run.items || []).map((item) => (
                        <tr key={item.id}>
                          <td><span className="font-mono text-xs font-semibold">{item.refNumber}</span></td>
                          <td>{item.customer?.code || "-"} - {item.customer?.name || "-"}</td>
                          <td><StatusPill status={item.status} /></td>
                          <td>
                            <Button size="sm" variant="outline" disabled={busy || item.status === "COMPLETED"} onClick={() => onCompleteItem(item)}>
                              Done
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No active dispatch runs" description="Plan a run from selected queue items." className="rounded-none border-0 shadow-none" />
      )}
    </section>
  );
}

function ReconciliationPanel({ reconciliation }) {
  if (!reconciliation) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Return reconciliation</h2>
        <span className="font-mono text-xs font-semibold text-muted-foreground">{reconciliation.dispatchNumber}</span>
      </div>
      <div className="max-h-[220px] overflow-auto">
        <table className="data-table text-left">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Issued</th>
              <th>Returned</th>
              <th>Missing</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(reconciliation.rows || []).map((row) => (
              <tr key={`${row.sourceType}-${row.itemId}`}>
                <td><span className="font-mono text-xs font-semibold">{row.refNumber}</span></td>
                <td>{row.issueQty}</td>
                <td>{row.returnedQty}</td>
                <td className={row.missingReturnQty ? "font-semibold text-red-600 dark:text-red-300" : ""}>{row.missingReturnQty}</td>
                <td><span className="rounded bg-muted px-2 py-1 text-[11px] font-bold">{String(row.status).replace(/_/g, " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function OperationsConsolePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scanRef = useRef(null);
  const [scanValue, setScanValue] = useState("");
  const [selected, setSelected] = useState({});
  const [assignment, setAssignment] = useState({ driverName: "", driverPhone: "", vehicleNumber: "" });
  const [reconciliation, setReconciliation] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["operations-console"],
    queryFn: () => api.get("/operations/console").then((response) => response.data),
    refetchInterval: 30000,
  });

  const stats = data?.stats || {};
  const dispatchQueue = useMemo(() => data?.dispatchQueue || [], [data?.dispatchQueue]);
  const activeDispatchRuns = data?.activeDispatchRuns || [];
  const returnsQueue = data?.returnsQueue || [];
  const overdueCylinders = data?.overdueCylinders || [];
  const pendingPayments = data?.pendingPayments || [];
  const canOpenPayments = canAccessPath(user?.role, "/accounting/payment-receipt");

  const selectedItems = useMemo(() => {
    return dispatchQueue.filter((row) => selected[`${row.type}:${row.id}`]);
  }, [dispatchQueue, selected]);

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (event.key === "/" && tag !== "input" && tag !== "textarea") {
        event.preventDefault();
        scanRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelected({});
        setScanValue("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function invalidateConsole() {
    queryClient.invalidateQueries({ queryKey: ["operations-console"] });
  }

  const planDispatchMutation = useMutation({
    mutationFn: () => api.post("/operations/dispatch-runs", {
      items: selectedItems.map((row) => ({ sourceType: row.type, sourceId: row.id })),
      driverName: assignment.driverName || undefined,
      driverPhone: assignment.driverPhone || undefined,
      vehicleNumber: assignment.vehicleNumber || undefined,
    }),
    onSuccess: () => {
      toast.success("Dispatch planned");
      setSelected({});
      setReconciliation(null);
      invalidateConsole();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Could not plan dispatch"),
  });

  const assignMutation = useMutation({
    mutationFn: (run) => api.patch(`/operations/dispatch-runs/${run.id}/assign`, assignment),
    onSuccess: () => {
      toast.success("Dispatch assigned");
      invalidateConsole();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Could not assign dispatch"),
  });

  const startMutation = useMutation({
    mutationFn: (run) => api.patch(`/operations/dispatch-runs/${run.id}/start`),
    onSuccess: () => {
      toast.success("Dispatch started");
      invalidateConsole();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Could not start dispatch"),
  });

  const completeItemMutation = useMutation({
    mutationFn: (item) => api.patch(`/operations/dispatch-items/${item.id}/complete`),
    onSuccess: () => {
      toast.success("Item completed");
      invalidateConsole();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Could not complete item"),
  });

  const completeRunMutation = useMutation({
    mutationFn: (run) => api.patch(`/operations/dispatch-runs/${run.id}/complete`),
    onSuccess: (response) => {
      toast.success("Dispatch completed");
      setReconciliation(response.data.reconciliation || null);
      invalidateConsole();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Could not complete dispatch"),
  });

  const reconcileMutation = useMutation({
    mutationFn: (run) => api.get(`/operations/dispatch-runs/${run.id}/reconciliation`),
    onSuccess: (response) => setReconciliation(response.data),
    onError: (error) => toast.error(error.response?.data?.error || "Could not reconcile dispatch"),
  });

  const busy = planDispatchMutation.isPending
    || assignMutation.isPending
    || startMutation.isPending
    || completeItemMutation.isPending
    || completeRunMutation.isPending
    || reconcileMutation.isPending;

  function toggleSelected(row) {
    const key = `${row.type}:${row.id}`;
    setSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleScanSubmit(event) {
    event.preventDefault();
    const normalized = scanValue.trim().toUpperCase();
    if (!normalized) return;

    const match = dispatchQueue.find((row) => {
      return row.refNumber?.toUpperCase() === normalized || `${row.type}:${row.id}` === normalized;
    });

    if (!match) {
      toast.error("No queue item found");
      return;
    }

    setSelected((current) => ({ ...current, [`${match.type}:${match.id}`]: true }));
    setScanValue("");
    toast.success(`${match.refNumber} selected`);
  }

  if (isLoading) {
    return <div className="page-shell text-sm text-muted-foreground">Loading operations console...</div>;
  }

  return (
    <div className="page-shell" data-testid="operations-console-page">
      <section className="page-header">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Daily operations</div>
            <h1 className="page-title">Dispatch workflow</h1>
            <p className="page-subtitle">Plan dispatch runs, close return queues, and reconcile overdue cylinders.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-9 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]">
              <Link to="/transactions"><ArrowRightLeft className="h-4 w-4" /> Issue</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link to="/ecr"><RotateCcw className="h-4 w-4" /> Return</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link to="/challans"><Truck className="h-4 w-4" /> Challan</Link>
            </Button>
            {canOpenPayments ? (
              <Button asChild variant="outline" className="h-9">
                <Link to="/accounting/payment-receipt"><CreditCard className="h-4 w-4" /> Payment</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`grid gap-3 md:grid-cols-2 ${canOpenPayments ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <Metric label="Dispatch queue" value={stats.pendingDeliveries || 0} hint={`${stats.todayIssues || 0} cylinders issued today`} tone="blue" />
        <Metric label="Return queue" value={stats.activeReturns || 0} hint={`${stats.todayReturns || 0} returns today`} tone="emerald" />
        <Metric label="Overdue cylinders" value={stats.overdueCylinders || 0} hint={`Threshold ${data?.thresholdDays || 30} days`} tone="red" />
        {canOpenPayments ? (
          <Metric label="Pending payments" value={formatINR(stats.outstandingAmount || 0)} hint={`${stats.pendingPayments || 0} parties`} tone="amber" />
        ) : null}
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-sm xl:grid-cols-[minmax(240px,1fr)_minmax(220px,0.8fr)_auto]">
        <form className="relative" onSubmit={handleScanSubmit}>
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            value={scanValue}
            onChange={(event) => setScanValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleScanSubmit(event);
            }}
            className="h-10 pl-9"
            placeholder="Scan order or challan number"
          />
        </form>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={assignment.driverName} onChange={(event) => setAssignment({ ...assignment, driverName: event.target.value })} className="h-10" placeholder="Driver" />
          <Input value={assignment.driverPhone} onChange={(event) => setAssignment({ ...assignment, driverPhone: event.target.value })} className="h-10" placeholder="Phone" />
          <Input value={assignment.vehicleNumber} onChange={(event) => setAssignment({ ...assignment, vehicleNumber: event.target.value.toUpperCase() })} className="h-10" placeholder="Vehicle" />
        </div>
        <Button className="h-10" disabled={!selectedItems.length || busy} onClick={() => planDispatchMutation.mutate()}>
          <ClipboardList className="h-4 w-4" /> Plan {selectedItems.length || ""}
        </Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <DispatchQueue rows={dispatchQueue} selected={selected} onToggle={toggleSelected} />
        <DispatchRuns
          runs={activeDispatchRuns}
          busy={busy}
          onAssign={(run) => assignMutation.mutate(run)}
          onStart={(run) => startMutation.mutate(run)}
          onCompleteItem={(item) => completeItemMutation.mutate(item)}
          onCompleteRun={(run) => completeRunMutation.mutate(run)}
          onReconcile={(run) => reconcileMutation.mutate(run)}
        />
      </section>

      <ReconciliationPanel reconciliation={reconciliation} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <QueueTable
          title="Return queue"
          rows={returnsQueue}
          empty="No active holdings"
          columns={[
            { key: "cyl", label: "Cylinder", render: (row) => <Link className="font-mono text-xs font-semibold text-[var(--color-accent)] hover:underline" to={`/cylinders/${row.cylinder?.id}/timeline`}>{row.cylinder?.cylinderNumber || "-"}</Link> },
            { key: "party", label: "Party", render: (row) => row.customer?.code || "-" },
            { key: "issued", label: "Issued", render: (row) => formatDate(row.issuedAt) },
            { key: "days", label: "Days", render: (row) => <span className={row.overdue ? "font-semibold text-red-600 dark:text-red-300" : "font-semibold"}>{row.holdDays}</span> },
          ]}
        />

        {canOpenPayments ? (
          <QueueTable
            title="Pending payments"
            rows={pendingPayments}
            empty="No pending payments"
            columns={[
              { key: "party", label: "Party", render: (row) => <Link className="font-semibold text-[var(--color-accent)] hover:underline" to={`/customers/${row.customerId}/command`}>{row.partyCode} - {row.partyName}</Link> },
              { key: "balance", label: "Balance", render: (row) => <span className="font-semibold text-amber-700 dark:text-amber-300">{formatINR(row.balance)}</span> },
            ]}
          />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <QueueTable
          title="Overdue cylinders"
          rows={overdueCylinders}
          empty="No overdue cylinders"
          maxHeight="max-h-[240px]"
          columns={[
            { key: "cyl", label: "Cylinder", render: (row) => <span className="font-mono text-xs font-semibold">{row.cylinder?.cylinderNumber || "-"}</span> },
            { key: "party", label: "Party", render: (row) => <Link className="font-semibold text-[var(--color-accent)] hover:underline" to={`/customers/${row.customer?.id}/command`}>{row.customer?.code || "-"}</Link> },
            { key: "days", label: "Days", render: (row) => <span className="font-semibold text-red-600 dark:text-red-300">{row.holdDays}</span> },
            { key: "flag", label: "Flag", render: () => <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-300" /> },
          ]}
        />

        <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PackageCheck className="h-4 w-4" />
            Stock health
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(data?.stockHealth || []).map((item) => (
              <div key={item.status} className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                <div className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.status.replace(/_/g, " ")}</div>
                <div className="mt-1 text-lg font-bold text-foreground">{item.count}</div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
