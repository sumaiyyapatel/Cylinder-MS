import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle,
  FileText,
  Package,
  Plus,
  ScanLine,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils-format";
import { generateBillPDF } from "@/lib/pdf-export";
import { addPendingRequest, useOfflineSync } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const createCylinderRow = () => ({ cylinderNumber: "", quantityCum: "" });

const createInitialForm = () => ({
  billDate: new Date().toISOString().split("T")[0],
  customerId: "",
  gasCode: "",
  cylinderOwner: "COC",
  orderNumber: "",
  transactionCode: "ISSUE",
  cylinders: [createCylinderRow()],
});

function formatQuantity(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [routeTrace, setRouteTrace] = useState([]);
  const [form, setForm] = useState(createInitialForm);
  const limit = 50;

  const onSynced = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [qc]);

  const { pendingCount } = useOfflineSync({ onSynced });

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page],
    queryFn: () => api.get("/transactions", { params: { page, limit } }).then((response) => response.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((response) => response.data),
  });

  const { data: gasTypes } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then((response) => response.data),
  });

  const resetForm = useCallback(() => {
    setForm(createInitialForm());
    setRouteTrace([]);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, [resetForm]);

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/transactions", payload),
    onSuccess: async (response) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Bill ${response.data.bill?.billNumber || ""} created`);
      if (routeTrace.length && response.data.bill?.id) {
        api.post(`/bills/${response.data.bill.id}/route-trace`, { route: routeTrace }).catch(() => {});
      }
      closeForm();
    },
    onError: (error) => toast.error(error.response?.data?.error || "Failed to create bill"),
  });

  const transactionRows = data?.data || [];
  const customerRows = customers?.data || [];
  const selectedCustomer = customerRows.find((customer) => customer.id === parseInt(form.customerId, 10));
  const selectedGas = (gasTypes || []).find((gas) => gas.gasCode === form.gasCode);
  const recentCustomers = customerRows.slice(0, 5);
  const validCylinders = form.cylinders.filter((cylinder) => cylinder.cylinderNumber.trim());
  const totalQuantity = validCylinders.reduce((sum, cylinder) => sum + (parseFloat(cylinder.quantityCum) || 0), 0);

  const duplicateCylinderNumbers = useMemo(() => {
    const counts = validCylinders.reduce((acc, cylinder) => {
      const number = cylinder.cylinderNumber.trim().toUpperCase();
      acc[number] = (acc[number] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([number]) => number);
  }, [validCylinders]);

  const addCylRow = () => {
    if (form.cylinders.length >= 20) {
      toast.error("Max 20 cylinders per bill");
      return;
    }
    setForm((current) => ({ ...current, cylinders: [...current.cylinders, createCylinderRow()] }));
  };

  const updateCyl = (index, field, value) => {
    setForm((current) => {
      const cylinders = [...current.cylinders];
      cylinders[index] = { ...cylinders[index], [field]: value };
      return { ...current, cylinders };
    });
  };

  const removeCyl = (index) => {
    if (form.cylinders.length <= 1) return;
    setForm((current) => ({
      ...current,
      cylinders: current.cylinders.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const handleCylinderEnter = (event, index) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const currentRow = form.cylinders[index];
    if (!currentRow.cylinderNumber.trim()) return;

    if (index === form.cylinders.length - 1) {
      addCylRow();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.customerId) {
      toast.error("Select a customer");
      return;
    }

    if (!validCylinders.length) {
      toast.error("At least one cylinder is required");
      return;
    }

    if (duplicateCylinderNumbers.length) {
      toast.error("Remove duplicate cylinder numbers before saving");
      return;
    }

    const payload = {
      ...form,
      customerId: parseInt(form.customerId, 10),
      cylinders: validCylinders,
    };

    if (!navigator.onLine) {
      addPendingRequest({ type: "BILL", url: "/transactions", data: payload })
        .then(() => {
          toast.success("Offline bill saved. It will sync when internet returns.");
          closeForm();
        })
        .catch(() => toast.error("Failed to save offline bill"));
      return;
    }

    saveMut.mutate(payload);
  };

  const normalizePhoneForWhatsApp = (phone) => {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const handleSendWhatsApp = async (bill) => {
    const customer = bill.customer;
    const phone = normalizePhoneForWhatsApp(customer?.phone);

    if (!phone) {
      toast.error("Customer phone number is missing");
      return;
    }

    const message = [
      `Hello ${customer?.name || "Customer"},`,
      `Bill ${bill.billNumber || "-"} dated ${formatDate(bill.billDate)} is ready.`,
      `Gas: ${bill.gasCode || "-"}, Cylinders: ${bill.totalCylinders || 0}, Quantity: ${bill.totalQuantity || "-"}.`,
      "Thank you.",
    ].join("\n");

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("Unable to open WhatsApp. Please allow popups.");
      return;
    }

    try {
      await api.patch(`/transactions/${bill.id}/whatsapp-sent`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("WhatsApp marked sent");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to mark WhatsApp sent");
    }
  };

  useEffect(() => {
    if (!showForm || !("geolocation" in navigator)) return undefined;

    let stopped = false;
    const capture = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (stopped) return;
          setRouteTrace((trace) => [
            ...trace.slice(-119),
            {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date().toISOString(),
            },
          ]);
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    };

    capture();
    const timer = window.setInterval(capture, 60000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [showForm]);

  const handleBillPdf = async (bill) => {
    try {
      await generateBillPDF(bill, bill.customer);
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || "Failed to generate PDF");
    }
  };

  return (
    <div className="page-shell" data-testid="transactions-page">
      <section className="page-header">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Transactions</div>
            <h1 className="page-title">Bill entry now follows a clear operator workflow.</h1>
            <p className="page-subtitle">
              Grouped inputs, scan-first cylinder entry, and a live summary reduce missed fields before posting.
            </p>
          </div>
          <Button
            data-testid="new-bill-btn"
            onClick={() => (showForm ? closeForm() : setShowForm(true))}
            className="h-11 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]"
          >
            <Plus className="mr-1 h-4 w-4" />
            {showForm ? "Close form" : "New Bill"}
          </Button>
        </div>
        {pendingCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {pendingCount} offline item{pendingCount === 1 ? "" : "s"} waiting to sync.
          </div>
        ) : null}
      </section>

      {showForm ? (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]" data-testid="bill-entry-form">
          <div className="space-y-6">
            <WorkflowSection
              step="1"
              title="Issue details"
              description="Capture the document date, customer, and stock ownership first."
              icon={CalendarDays}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="bill-date" className="text-sm">Bill Date *</Label>
                  <Input
                    id="bill-date"
                    name="billDate"
                    type="date"
                    value={form.billDate}
                    onChange={(event) => setForm((current) => ({ ...current, billDate: event.target.value }))}
                    className="mt-1 h-11"
                    required
                  />
                  <div className="mt-2 text-xs text-slate-500">Display format: {formatDate(form.billDate)}</div>
                </div>
                <div>
                  <Label className="text-sm">Party Code *</Label>
                  <Select value={form.customerId} onValueChange={(value) => setForm((current) => ({ ...current, customerId: value }))}>
                    <SelectTrigger className="mt-1 h-11" data-testid="bill-customer-select">
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
                  {selectedCustomer ? (
                    <InlineMessage tone="info">
                      {selectedCustomer.name}
                      {selectedCustomer.phone ? ` • ${selectedCustomer.phone}` : ""}
                    </InlineMessage>
                  ) : recentCustomers.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recentCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, customerId: String(customer.id) }))}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
                        >
                          {customer.code}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                  <Label className="text-sm">Gas Type</Label>
                  <Select value={form.gasCode} onValueChange={(value) => setForm((current) => ({ ...current, gasCode: value }))}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue placeholder="Select gas" />
                    </SelectTrigger>
                    <SelectContent>
                      {(gasTypes || []).map((gas) => (
                        <SelectItem key={gas.gasCode} value={gas.gasCode}>
                          {gas.gasCode} - {gas.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="order-number" className="text-sm">Order Number</Label>
                  <Input
                    id="order-number"
                    name="orderNumber"
                    value={form.orderNumber}
                    onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))}
                    className="mt-1 h-11"
                    placeholder="Optional reference"
                  />
                </div>
              </div>
            </WorkflowSection>

            <WorkflowSection
              step="2"
              title="Cylinder details"
              description="Scan or type cylinders. Press Enter on the last row to add the next line quickly."
              icon={ScanLine}
              headerRight={
                <Button type="button" variant="outline" size="sm" onClick={addCylRow}>
                  <Plus className="h-3.5 w-3.5" />
                  Add row
                </Button>
              }
            >
              <InlineMessage tone="info">Barcode scanner flow works best when the cursor stays in the cylinder field.</InlineMessage>
              {duplicateCylinderNumbers.length ? (
                <InlineMessage tone="danger">
                  Duplicate cylinder numbers: {duplicateCylinderNumbers.join(", ")}
                </InlineMessage>
              ) : null}

              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-3 py-3 text-left">#</th>
                      <th className="px-3 py-3 text-left">Cylinder Number</th>
                      <th className="px-3 py-3 text-left">Cu.M / Kgs</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.cylinders.map((cylinder, index) => {
                      const duplicate = cylinder.cylinderNumber && duplicateCylinderNumbers.includes(cylinder.cylinderNumber.trim().toUpperCase());
                      return (
                        <tr key={index} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-3 text-xs font-medium text-slate-500">{index + 1}</td>
                          <td className="px-3 py-3">
                            <Input
                              id={`cyl-number-${index}`}
                              name={`cylNumber-${index}`}
                              value={cylinder.cylinderNumber}
                              onChange={(event) => updateCyl(index, "cylinderNumber", event.target.value.toUpperCase())}
                              onKeyDown={(event) => handleCylinderEnter(event, index)}
                              className={`h-10 ${duplicate ? "border-red-300 focus-visible:ring-red-200" : ""}`}
                              placeholder="Scan or type cylinder"
                              data-testid={`cyl-number-${index}`}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              id={`cyl-qty-${index}`}
                              name={`cylQty-${index}`}
                              value={cylinder.quantityCum}
                              onChange={(event) => updateCyl(index, "quantityCum", event.target.value)}
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-10"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            {form.cylinders.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeCyl(index)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <MobileRecordList
                items={form.cylinders}
                className="mt-4"
                renderCard={(cylinder, index) => {
                  const duplicate = cylinder.cylinderNumber && duplicateCylinderNumbers.includes(cylinder.cylinderNumber.trim().toUpperCase());
                  return (
                    <Card key={`cylinder-card-${index}`} className="rounded-2xl border border-slate-200 shadow-none">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Cylinder {index + 1}</div>
                          {form.cylinders.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeCyl(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <div>
                          <Label htmlFor={`m-cyl-number-${index}`} className="text-sm">Cylinder Number</Label>
                          <Input
                            id={`m-cyl-number-${index}`}
                            name={`mCylNumber-${index}`}
                            value={cylinder.cylinderNumber}
                            onChange={(event) => updateCyl(index, "cylinderNumber", event.target.value.toUpperCase())}
                            onKeyDown={(event) => handleCylinderEnter(event, index)}
                            className={`mt-1 h-11 ${duplicate ? "border-red-300 focus-visible:ring-red-200" : ""}`}
                            placeholder="Scan or type cylinder"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`m-cyl-qty-${index}`} className="text-sm">Cu.M / Kgs</Label>
                          <Input
                            id={`m-cyl-qty-${index}`}
                            name={`mCylQty-${index}`}
                            value={cylinder.quantityCum}
                            onChange={(event) => updateCyl(index, "quantityCum", event.target.value)}
                            type="number"
                            step="0.01"
                            min="0"
                            className="mt-1 h-11"
                            placeholder="0.00"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                }}
              />
            </WorkflowSection>
          </div>

          <div className="space-y-6">
            <SummaryPanel
              title="Bill summary"
              description="Review before posting. This mirrors the final document."
              icon={Package}
              tone="amber"
              rows={[
                { label: "Date", value: formatDate(form.billDate) },
                { label: "Customer", value: selectedCustomer ? selectedCustomer.code : "Not selected" },
                { label: "Gas", value: selectedGas ? selectedGas.gasCode : "Not selected" },
                { label: "Owner", value: form.cylinderOwner },
                { label: "Cylinders", value: validCylinders.length, emphasis: true },
                { label: "Total quantity", value: formatQuantity(totalQuantity), emphasis: true },
              ]}
              footer={
                <div className="space-y-3">
                  {routeTrace.length ? (
                    <InlineMessage tone="success" className="mt-0">
                      Route breadcrumb is active for this document.
                    </InlineMessage>
                  ) : null}
                  <Button
                    type="submit"
                    data-testid="bill-save-btn"
                    className="h-11 w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]"
                    disabled={saveMut.isPending}
                  >
                    {saveMut.isPending ? "Saving..." : "Issue Bill"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 w-full" onClick={closeForm}>
                    Cancel
                  </Button>
                </div>
              }
            />

            {!selectedCustomer ? (
              <SummaryPanel
                title="Next action"
                description="Select a customer first. Recent customer chips above are faster than searching the full list."
                icon={UserRound}
                tone="blue"
                rows={[
                  { label: "Offline sync", value: pendingCount ? `${pendingCount} pending` : "Clear" },
                  { label: "Duplicates", value: duplicateCylinderNumbers.length || "None" },
                ]}
              />
            ) : null}
          </div>
        </form>
      ) : null}

      {!transactionRows.length && !isLoading ? (
        <EmptyState
          icon={FileText}
          title="No bills created yet"
          description="Create the first bill from this screen. The form now groups issue details, cylinder lines, and review into one flow."
          action={
            <Button onClick={() => setShowForm(true)} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]">
              <Plus className="mr-1 h-4 w-4" />
              New Bill
            </Button>
          }
        />
      ) : (
        <>
          <MobileRecordList
            items={transactionRows}
            empty={null}
            renderCard={(bill) => (
              <Card key={bill.id} className="rounded-2xl border border-slate-200 shadow-sm md:hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mono-value text-xs font-semibold text-slate-500">{bill.billNumber}</div>
                      <div className="mt-1 font-semibold text-slate-900">{bill.customer?.name || "-"}</div>
                      <div className="mt-1 text-sm text-slate-500">{formatDate(bill.billDate)}</div>
                    </div>
                    {bill.whatsappSent ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Gas</div>
                      <div className="mt-1 font-medium text-slate-800">{bill.gasCode || "-"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Quantity</div>
                      <div className="mt-1 font-medium text-slate-800">{bill.totalQuantity || "-"}</div>
                    </div>
                  </div>
                  {!!bill.items?.length ? (
                    <div className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      {bill.items.map((item) => item.cylinderNumber).join(", ")}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => handleBillPdf(bill)}>
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => handleSendWhatsApp(bill)}>
                      <Send className="h-3.5 w-3.5" />
                      WhatsApp
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          />

          <div className="data-table-shell hidden md:block">
            <div className="data-table-wrap">
              <table className="data-table text-left" data-testid="transactions-table">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Gas</th>
                    <th>Cylinders</th>
                    <th>Cu.M</th>
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
                    transactionRows.map((bill) => (
                      <tr key={bill.id}>
                        <td className="mono-value text-xs font-semibold">{bill.billNumber}</td>
                        <td>{formatDate(bill.billDate)}</td>
                        <td>{bill.customer?.name || "-"}</td>
                        <td>{bill.gasCode || "-"}</td>
                        <td>{bill.totalCylinders || bill.items?.length || 0}</td>
                        <td>{bill.totalQuantity || "-"}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {bill.whatsappSent ? (
                              <span className="inline-flex items-center text-green-600" title="WhatsApp sent">
                                <CheckCircle className="h-4 w-4" />
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleSendWhatsApp(bill)}
                              title="Send WhatsApp"
                              className="rounded p-1 text-green-600 hover:bg-slate-100"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBillPdf(bill)}
                              title="View PDF"
                              className="rounded p-1 text-blue-600 hover:bg-slate-100"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {!!bill.items?.length ? (
                            <div className="mt-1 text-[11px] text-slate-500">
                              {bill.items.map((item) => item.cylinderNumber).join(", ")}
                            </div>
                          ) : null}
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
                  Page {data.page || 1} of {data.totalPages || 1} - Showing {transactionRows.length} of {data.total} transactions
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
