import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Clock3, Filter, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const alertTypeLabels = {
  OVERDUE: "Overdue cylinder",
  TEST_DUE: "Hydro test due",
  WHATSAPP_FAILED: "WhatsApp failed",
};

function formatAlertType(type) {
  return alertTypeLabels[type] || String(type || "Alert").replace(/_/g, " ");
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [resolved, setResolved] = useState("false");
  const [type, setType] = useState("all");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts", resolved, type],
    queryFn: () =>
      api
        .get("/alerts", {
          params: {
            resolved,
            type: type === "all" ? undefined : type,
          },
        })
        .then((response) => response.data),
    refetchInterval: resolved === "false" ? 30000 : false,
  });

  const alertTypes = useMemo(
    () => Array.from(new Set(alerts.map((alert) => alert.type).filter(Boolean))),
    [alerts]
  );

  const resolveMut = useMutation({
    mutationFn: (id) => api.patch(`/alerts/${id}/resolve`),
    onSuccess: () => {
      toast.success("Notification resolved");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-unresolved"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error.response?.data?.error || "Failed to resolve notification"),
  });

  return (
    <div className="page-shell" data-testid="notifications-page">
      <section className="page-header">
        <div className="page-eyebrow">Notification center</div>
        <h1 className="page-title">Actionable alerts are now separate from reports.</h1>
        <p className="page-subtitle">
          Overdue cylinder and test-due alerts live here, so report badges no longer feel ambiguous.
        </p>
      </section>

      <section className="filter-panel">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="h-4 w-4 text-amber-600" />
              Status
            </div>
            <Select value={resolved} onValueChange={setResolved}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Active</SelectItem>
                <SelectItem value="true">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-slate-900">Type</div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {alertTypes.map((item) => (
                  <SelectItem key={item} value={item}>
                    {formatAlertType(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto rounded-lg border border-border bg-muted px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Visible</div>
            <div className="text-lg font-bold text-slate-900">{alerts.length}</div>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">{resolved === "false" ? "Active notifications" : "Resolved notifications"}</h2>
            <p className="section-copy">Each row explains the alert source, related party, and cylinder.</p>
          </div>
          <BellRing className="h-4 w-4 text-amber-600" />
        </div>

        <div className="data-table-shell rounded-none border-0 shadow-none">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Customer</th>
                  <th>Cylinder</th>
                  <th>Sent</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">Loading notifications...</td>
                  </tr>
                ) : alerts.length ? (
                  alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {formatAlertType(alert.type)}
                        </span>
                      </td>
                      <td>{alert.message || "-"}</td>
                      <td>{alert.customer ? `${alert.customer.code} - ${alert.customer.name}` : "-"}</td>
                      <td>{alert.cylinder ? `${alert.cylinder.cylinderNumber} / ${alert.cylinder.gasCode || "-"}` : "-"}</td>
                      <td>
                        <div>{formatDate(alert.sentAt)}</div>
                        {alert.resolvedAt ? <div className="mt-1 text-xs text-slate-500">Resolved {formatDate(alert.resolvedAt)}</div> : null}
                      </td>
                      <td className="text-right">
                        {alert.isResolved ? (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Done
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveMut.mutate(alert.id)}
                            disabled={resolveMut.isPending}
                          >
                            <Clock3 className="h-3.5 w-3.5" />
                            Resolve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">No notifications found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
