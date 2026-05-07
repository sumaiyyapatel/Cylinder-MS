import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, History, Package, RotateCcw, ShieldAlert } from "lucide-react";
import api from "@/lib/api";
import { cylinderStatusColors, formatDate } from "@/lib/utils-format";
import { EmptyState } from "@/components/ux/workflow";

const eventIcons = {
  CREATED: Package,
  ISSUED: Package,
  CHALLAN_ISSUED: Package,
  RETURNED: RotateCcw,
  ECR: RotateCcw,
  HYDRO_TESTED: FlaskConical,
  DAMAGED: ShieldAlert,
  CONDEMNED: ShieldAlert,
  UNDER_TEST: FlaskConical,
};

export default function CylinderTimelinePage() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["cylinder-timeline", id],
    queryFn: () => api.get(`/cylinders/${id}/timeline`).then((response) => response.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="page-shell text-sm text-muted-foreground">Loading cylinder timeline...</div>;
  if (!data) return <EmptyState title="Cylinder not found" description="Open a valid cylinder from the cylinder list." />;

  const cylinder = data.cylinder;

  return (
    <div className="page-shell" data-testid="cylinder-timeline-page">
      <section className="page-header">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Cylinder timeline</div>
            <h1 className="page-title">{cylinder.cylinderNumber}</h1>
            <p className="page-subtitle">{cylinder.ownerCode} / {cylinder.gasType?.name || cylinder.gasCode || "-"} / {cylinder.capacity || "-"} capacity</p>
          </div>
          <span className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-bold ring-1 ring-inset ${cylinderStatusColors[cylinder.status] || "bg-muted text-muted-foreground"}`}>
            {cylinder.status.replace(/_/g, " ")}
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Issues</div>
          <div className="mt-2 text-2xl font-bold">{data.summary?.totalIssues || 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Returns</div>
          <div className="mt-2 text-2xl font-bold">{data.summary?.totalReturns || 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Next hydro due</div>
          <div className="mt-2 text-2xl font-bold">{formatDate(cylinder.nextTestDue)}</div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <History className="h-4 w-4" />
          Movement history
        </div>
        {data.events?.length ? (
          <div className="divide-y divide-border">
            {data.events.map((event, index) => {
              const Icon = eventIcons[event.type] || History;
              return (
                <div key={`${event.type}-${event.date}-${index}`} className="grid gap-3 px-4 py-3 md:grid-cols-[160px_38px_minmax(0,1fr)_120px] md:items-center">
                  <div className="text-sm font-semibold text-foreground">{formatDate(event.date)}</div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">{event.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {event.detail || "-"}
                      {event.customer ? ` / ${event.customer.code} - ${event.customer.name}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground">{event.holdDays ? `${event.holdDays} days` : event.status || "-"}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No movement history" description="This cylinder has not moved yet." className="rounded-none border-0 shadow-none" />
        )}
      </section>

      <Link className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" to="/cylinders">Back to cylinders</Link>
    </div>
  );
}
