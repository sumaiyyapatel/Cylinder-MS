import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, PackageCheck, Plus, RotateCcw, ScanLine, Truck } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { generateEcrPDF } from "@/lib/pdf-export";
import { addPendingRequest, useOfflineSync } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  InlineMessage,
  MobileRecordList,
  SummaryPanel,
  WorkflowSection,
} from "@/components/ux/workflow";

const createInitialForm = () => ({
  ecrDate: new Date().toISOString().split("T")[0],
  customerId: "",
  cylinderNumber: "",
  gasCode: "",
  cylinderOwner: "COC",
  challanNumber: "",
  vehicleNumber: "",
  quantityCum: "",
});

export default function EcrPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(createInitialForm);
  const [cylInfo, setCylInfo] = useState(null);
  const [lookupState, setLookupState] = useState("idle");
  const limit = 50;

  const onSynced = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["ecr"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [qc]);

  const { pendingCount } = useOfflineSync({ onSynced });

  const { data, isLoading } = useQuery({
    queryKey: ["ecr", page],
    queryFn: () => api.get("/ecr", { params: { page, limit } }).then((response) => response.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((response) => response.data),
  });

  const customerRows = customers?.data || [];
  const selectedCustomer = customerRows.find((customer) => customer.id === parseInt(form.customerId, 10));

  const resetForm = useCallback(() => {
    setForm(createInitialForm());
    setCylInfo(null);
    setLookupState("idle");
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, [resetForm]);

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/ecr", payload),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["ecr"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`ECR ${response.data.ecrNumber} created. Rent: ${formatINR(response.data.rentAmount)}`);
      closeForm();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Failed to save ECR"),
  });

  const lookupCylinder = async (cylinderNumber) => {
    const trimmed = cylinderNumber.trim();
    if (!trimmed) {
      setCylInfo(null);
      setLookupState("idle");
      return;
    }

    try {
      const response = await api.get(`/ecr/cylinder-info/${trimmed}`);
      const info = response.data;
      setCylInfo(info);
      setLookupState(info.holding ? "hit" : "empty");
      if (info.cylinder?.gasCode) {
        setForm((current) => ({
          ...current,
          gasCode: info.cylinder.gasCode,
          cylinderOwner: info.cylinder.ownerCode || current.cylinderOwner,
          customerId: info.holding?.customerId ? String(info.holding.customerId) : current.customerId,
        }));
      }
    } catch {
      setCylInfo(null);
      setLookupState("miss");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.customerId || !form.cylinderNumber.trim()) {
      toast.error("Customer and cylinder number are required");
      return;
    }

    const payload = {
      ...form,
      customerId: parseInt(form.customerId, 10),
      quantityCum: form.quantityCum ? parseFloat(form.quantityCum) : undefined,
    };

    if (!navigator.onLine) {
      addPendingRequest({ type: "ECR", url: "/ecr", data: payload })
        .then(() => {
          toast.success("Offline ECR saved. It will sync when internet returns.");
          closeForm();
        })
        .catch(() => toast.error("Failed to save offline ECR"));
      return;
    }

    saveMut.mutate(payload);
  };

  const handleEcrPdf = async (record) => {
    try {
      await generateEcrPDF(record, record.customer);
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || "Failed to generate PDF");
    }
  };

  const ecrRows = data?.data || [];

  return (
    <div className="page-shell" data-testid="ecr-page">
      <section className="page-header">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Returns</div>
            <h1 className="page-title">ECR return entry now shows the active holding before save.</h1>
            <p className="page-subtitle">
              Operators can verify customer, hold days, and movement details before closing the return.
            </p>
          </div>
          <Button
            data-testid="new-ecr-btn"
            onClick={() => (showForm ? closeForm() : setShowForm(true))}
            className="h-11 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-1 h-4 w-4" />
            {showForm ? "Close form" : "New ECR"}
          </Button>
        </div>
        {pendingCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {pendingCount} offline item{pendingCount === 1 ? "" : "s"} waiting to sync.
          </div>
        ) : null}
      </section>

      {showForm ? (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_340px]" data-testid="ecr-entry-form">
          <div className="space-y-6">
            <WorkflowSection
              step="1"
              title="Return details"
              description="Start with the document date and the cylinder you are receiving back."
              icon={CalendarDays}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="ecr-date" className="text-sm">ECR Date *</Label>
                  <Input
                    id="ecr-date"
                    name="ecrDate"
                    type="date"
                    value={form.ecrDate}
                    onChange={(event) => setForm((current) => ({ ...current, ecrDate: event.target.value }))}
                    className="mt-1 h-11"
                    required
                  />
                  <div className="mt-2 text-xs text-slate-500">Display format: {formatDate(form.ecrDate)}</div>
                </div>
                <div>
                  <Label htmlFor="ecr-cylinder-number" className="text-sm">Cylinder Number *</Label>
                  <Input
                    id="ecr-cylinder-number"
                    name="cylinderNumber"
                    data-testid="ecr-cylinder-input"
                    value={form.cylinderNumber}
                    onChange={(event) => setForm((current) => ({ ...current, cylinderNumber: event.target.value.toUpperCase() }))}
                    onBlur={(event) => lookupCylinder(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        lookupCylinder(form.cylinderNumber);
                      }
                    }}
                    className="mt-1 h-11"
                    placeholder="Scan or type cylinder"
                    required
                  />
                </div>
              </div>
              <InlineMessage tone="info">Lookup runs on blur or Enter so scanner-based entry stays fast.</InlineMessage>
              {lookupState === "miss" ? (
                <InlineMessage tone="danger">Cylinder not found. Check the cylinder number before saving.</InlineMessage>
              ) : null}
              {lookupState === "empty" ? (
                <InlineMessage tone="warning">Cylinder exists but no active holding was found for it.</InlineMessage>
              ) : null}
            </WorkflowSection>

            <WorkflowSection
              step="2"
              title="Party and movement"
              description="Confirm the customer, owner, and transport details after the lookup."
              icon={ScanLine}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-sm">Party *</Label>
                  <Select value={form.customerId} onValueChange={(value) => setForm((current) => ({ ...current, customerId: value }))}>
                    <SelectTrigger className="mt-1 h-11" data-testid="ecr-customer-select">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerRows.map((customer) => (
                        <SelectItem key={customer.id} value={String(customer.id)}>
                          {customer.code} - {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Owner</Label>
                  <Select value={form.cylinderOwner} onValueChange={(value) => setForm((current) => ({ ...current, cylinderOwner: value }))}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COC">COC</SelectItem>
                      <SelectItem value="POC">POC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ecr-gas-code" className="text-sm">Gas Type</Label>
                  <Input id="ecr-gas-code" name="gasCode" value={form.gasCode} className="mt-1 h-11" readOnly placeholder="Filled from cylinder lookup" />
                </div>
                <div>
                  <Label htmlFor="ecr-quantity" className="text-sm">Quantity Cu.M</Label>
                  <Input
                    id="ecr-quantity"
                    name="quantityCum"
                    value={form.quantityCum}
                    onChange={(event) => setForm((current) => ({ ...current, quantityCum: event.target.value }))}
                    type="number"
                    step="0.01"
                    min="0"
                    className="mt-1 h-11"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="ecr-challan-number" className="text-sm">Challan Number</Label>
                  <Input
                    id="ecr-challan-number"
                    name="challanNumber"
                    value={form.challanNumber}
                    onChange={(event) => setForm((current) => ({ ...current, challanNumber: event.target.value }))}
                    className="mt-1 h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="ecr-vehicle-number" className="text-sm">Vehicle Number</Label>
                  <Input
                    id="ecr-vehicle-number"
                    name="vehicleNumber"
                    value={form.vehicleNumber}
                    onChange={(event) => setForm((current) => ({ ...current, vehicleNumber: event.target.value.toUpperCase() }))}
                    className="mt-1 h-11"
                  />
                </div>
              </div>
            </WorkflowSection>

            {cylInfo ? (
              <WorkflowSection
                step="3"
                title="Holding check"
                description="Confirm the active issue before posting the return."
                icon={PackageCheck}
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="ecr-cylinder-info">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Gas</div>
                    <div className="mt-1 font-semibold text-slate-900">{cylInfo.cylinder?.gasType?.name || cylInfo.cylinder?.gasCode || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Status</div>
                    <div className="mt-1 font-semibold text-slate-900">{cylInfo.cylinder?.status || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Issued</div>
                    <div className="mt-1 font-semibold text-slate-900">{cylInfo.holding?.issuedAt ? formatDate(cylInfo.holding.issuedAt) : "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Days held</div>
                    <div className={`mt-1 font-semibold ${cylInfo.holding?.holdDays > 30 ? "text-red-600" : "text-slate-900"}`}>
                      {cylInfo.holding?.holdDays ?? "-"}
                    </div>
                  </div>
                </div>
              </WorkflowSection>
            ) : null}
          </div>

          <div className="space-y-6">
            <SummaryPanel
              title="Return summary"
              description="Post only after the lookup and party match look correct."
              icon={RotateCcw}
              tone="emerald"
              rows={[
                { label: "Date", value: formatDate(form.ecrDate) },
                { label: "Cylinder", value: form.cylinderNumber || "Not entered" },
                { label: "Customer", value: selectedCustomer ? selectedCustomer.code : "Not selected" },
                { label: "Hold days", value: cylInfo?.holding?.holdDays ?? "-" },
                { label: "Issue ref", value: cylInfo?.holding?.issueNumber || "-" },
                { label: "Vehicle", value: form.vehicleNumber || "-" },
              ]}
              footer={
                <div className="space-y-3">
                  <Button
                    type="submit"
                    data-testid="ecr-save-btn"
                    className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={saveMut.isPending}
                  >
                    {saveMut.isPending ? "Saving..." : "Save ECR"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 w-full" onClick={closeForm}>
                    Cancel
                  </Button>
                </div>
              }
            />

            <SummaryPanel
              title="Field note"
              description="Use the same operator flow every time to avoid mismatched returns."
              icon={Truck}
              tone="blue"
              rows={[
                { label: "Pending sync", value: pendingCount ? `${pendingCount} pending` : "Clear" },
                { label: "Lookup status", value: lookupState === "hit" ? "Holding found" : lookupState === "miss" ? "Cylinder missing" : "Waiting" },
              ]}
            />
          </div>
        </form>
      ) : null}

      {!ecrRows.length && !isLoading ? (
        <EmptyState
          icon={RotateCcw}
          title="No ECR records yet"
          description="Create the first return from this screen. The updated flow now checks the active holding before save."
          action={
            <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-1 h-4 w-4" />
              New ECR
            </Button>
          }
        />
      ) : (
        <>
          <MobileRecordList
            items={ecrRows}
            renderCard={(record) => (
              <Card key={record.id} className="rounded-2xl border border-slate-200 shadow-sm md:hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mono-value text-xs font-semibold text-slate-500">{record.ecrNumber}</div>
                      <div className="mt-1 font-semibold text-slate-900">{record.customer?.name || "-"}</div>
                      <div className="mt-1 text-sm text-slate-500">{formatDate(record.ecrDate)}</div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleEcrPdf(record)}>
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Cylinder</div>
                      <div className="mt-1 mono-value text-xs font-semibold text-slate-800">{record.cylinderNumber}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Rent</div>
                      <div className="mt-1 font-semibold text-slate-800">{formatINR(record.rentAmount)}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                    Hold days: <span className="font-semibold text-slate-900">{record.holdDays ?? "-"}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          />

          <div className="data-table-shell hidden md:block">
            <div className="data-table-wrap">
              <table className="data-table text-left" data-testid="ecr-table">
                <thead>
                  <tr>
                    <th>ECR No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Cylinder</th>
                    <th>Days</th>
                    <th>Rent</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        Loading...
                      </td>
                    </tr>
                  ) : (
                    ecrRows.map((record) => (
                      <tr key={record.id}>
                        <td className="mono-value text-xs font-semibold">{record.ecrNumber}</td>
                        <td>{formatDate(record.ecrDate)}</td>
                        <td>{record.customer?.name || "-"}</td>
                        <td className="mono-value text-xs">{record.cylinderNumber}</td>
                        <td>{record.holdDays ?? "-"}</td>
                        <td className="font-semibold">{formatINR(record.rentAmount)}</td>
                        <td className="text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleEcrPdf(record)} className="h-8">
                            <FileText className="h-3.5 w-3.5" />
                            Print
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data?.total > 0 ? (
              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                <span>
                  Page {data.page || 1} of {data.totalPages || 1} - Showing {ecrRows.length} of {data.total} ECR records
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={(data.page || 1) <= 1}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={(data.page || 1) >= (data.totalPages || 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
