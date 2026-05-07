import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Plus, Printer, Trash2 } from "lucide-react";
import { generateChallanPDF } from "@/lib/pdf-export";

const emptyForm = () => ({
  challanDate: new Date().toISOString().split("T")[0],
  customerId: "",
  cylinderOwner: "COC",
  cylindersCount: "",
  quantityCum: "",
  vehicleNumber: "",
  transactionType: "DELIVERY",
  gasCode: "",
  cylinders: [{ cylinderNumber: "" }],
});

function StatusBadge({ status, linkedBill }) {
  if (status === "BILLED" || linkedBill) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
        BILLED
        {linkedBill?.billNumber ? <span className="ml-1 font-mono">({linkedBill.billNumber})</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      OPEN
    </span>
  );
}

function ChallanTable({
  data,
  isLoading,
  page,
  setPage,
  onConvert,
  onPrint,
  converting,
}) {
  const rows = data?.data || [];

  return (
    <div className="data-table-shell">
      <div className="data-table-wrap">
        <table className="data-table text-left" data-testid="challans-table">
          <thead>
            <tr>
              <th>Challan No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Owner</th>
              <th>Cyls</th>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No challans</td></tr>
            ) : (
              rows.map((challan) => (
                <tr key={challan.id}>
                  <td className="font-mono text-xs font-semibold">{challan.challanNumber}</td>
                  <td>{formatDate(challan.challanDate)}</td>
                  <td>{challan.customer?.name || "-"}</td>
                  <td>{challan.cylinderOwner || "-"}</td>
                  <td>{challan.cylindersCount || "-"}</td>
                  <td>{challan.vehicleNumber || "-"}</td>
                  <td>{challan.transactionType || "-"}</td>
                  <td><StatusBadge status={challan.status} linkedBill={challan.linkedBill} /></td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {challan.status !== "BILLED" && !challan.linkedBillId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onConvert(challan)}
                          className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                          disabled={converting}
                          title="Convert to Bill"
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> To Bill
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" size="sm" onClick={() => onPrint(challan)} className="h-7 px-2 text-xs">
                        <Printer className="h-3.5 w-3.5" /> Print
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.total > 0 ? (
        <div className="flex items-center justify-between border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span>Page {data.page || 1} of {data.totalPages || 1} - Showing {rows.length} of {data.total} challans</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPage(Math.max(1, page - 1))} disabled={(data.page || 1) <= 1}>
              Prev
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPage(page + 1)} disabled={(data.page || 1) >= (data.totalPages || 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChallanFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  customers,
  gasTypes,
  onSubmit,
  saving,
}) {
  const addCylinderRow = () => setForm((current) => ({ ...current, cylinders: [...current.cylinders, { cylinderNumber: "" }] }));
  const updateCylinderRow = (index, value) => {
    setForm((current) => ({
      ...current,
      cylinders: current.cylinders.map((row, rowIndex) => rowIndex === index ? { cylinderNumber: value } : row),
    }));
  };
  const removeCylinderRow = (index) => {
    setForm((current) => ({
      ...current,
      cylinders: current.cylinders.length <= 1 ? current.cylinders : current.cylinders.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>New Challan</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Date</Label>
            <Input type="date" value={form.challanDate} onChange={(event) => setForm({ ...form, challanDate: event.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-sm">Customer *</Label>
            <Select value={form.customerId} onValueChange={(value) => setForm({ ...form, customerId: value })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{(customers?.data || []).map((customer) => <SelectItem key={customer.id} value={String(customer.id)}>{customer.code} - {customer.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Owner</Label>
            <Select value={form.cylinderOwner} onValueChange={(value) => setForm({ ...form, cylinderOwner: value })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Gas Type</Label>
            <Select value={form.gasCode} onValueChange={(value) => setForm({ ...form, gasCode: value })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{(gasTypes || []).map((gas) => <SelectItem key={gas.gasCode} value={gas.gasCode}>{gas.gasCode} - {gas.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Cylinders Count</Label>
            <Input value={form.cylindersCount} onChange={(event) => setForm({ ...form, cylindersCount: event.target.value })} type="number" className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-sm">Vehicle No</Label>
            <Input value={form.vehicleNumber} onChange={(event) => setForm({ ...form, vehicleNumber: event.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-sm">Type</Label>
            <Select value={form.transactionType} onValueChange={(value) => setForm({ ...form, transactionType: value })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="DELIVERY">Delivery</SelectItem><SelectItem value="RETURN">Return</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">Cylinder Numbers</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCylinderRow} className="h-7 text-xs">
                <Plus className="h-3 w-3" /> Add Row
              </Button>
            </div>
            <div className="space-y-2">
              {form.cylinders.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={row.cylinderNumber} onChange={(event) => updateCylinderRow(index, event.target.value.toUpperCase())} className="h-9" placeholder="Cylinder number" />
                  {form.cylinders.length > 1 ? (
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeCylinderRow(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
            <Button type="submit" data-testid="challan-save-btn" className="h-9 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ChallansPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingConvert, setPendingConvert] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["challans", page],
    queryFn: () => api.get("/challans", { params: { page, limit } }).then((response) => response.data),
  });
  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((response) => response.data),
  });
  const { data: gasTypes } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then((response) => response.data),
  });

  const resetForm = () => setForm(emptyForm());

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/challans", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
      resetForm();
      toast.success("Challan created");
    },
    onError: (error) => toast.error(error.response?.data?.error || "Failed"),
  });

  const convertMut = useMutation({
    mutationFn: (id) => api.post(`/challans/${id}/convert-to-bill`),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Converted to bill ${response.data.billNumber || ""}`);
    },
    onError: (error) => toast.error(error.response?.data?.error || "Conversion failed"),
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.customerId) {
      toast.error("Select customer");
      return;
    }

    const validCylinders = form.cylinders.filter((row) => row.cylinderNumber.trim());
    saveMut.mutate({
      ...form,
      customerId: parseInt(form.customerId, 10),
      cylinders: validCylinders.length ? validCylinders : undefined,
      cylindersCount: validCylinders.length || form.cylindersCount,
      gasCode: form.gasCode || undefined,
    });
  };

  const handleChallanPdf = async (challan) => {
    try {
      await generateChallanPDF(challan, challan.customer);
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || "Failed to generate PDF");
    }
  };

  return (
    <div className="page-shell" data-testid="challans-page">
      <section className="page-header">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Transport documents</div>
            <h1 className="page-title">Challans that stay easy to convert and track.</h1>
            <p className="page-subtitle">Dispatch teams can create, print, and convert documents without losing cylinder context.</p>
          </div>
          <Button data-testid="new-challan-btn" onClick={() => setDialogOpen(true)} className="h-11 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]">
            <Plus className="h-4 w-4" /> New Challan
          </Button>
        </div>
      </section>

      <ChallanTable
        data={data}
        isLoading={isLoading}
        page={page}
        setPage={setPage}
        onConvert={setPendingConvert}
        onPrint={handleChallanPdf}
        converting={convertMut.isPending}
      />

      <ChallanFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        customers={customers}
        gasTypes={gasTypes}
        onSubmit={handleSubmit}
        saving={saveMut.isPending}
      />

      <AlertDialog open={!!pendingConvert} onOpenChange={(open) => !open && setPendingConvert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert challan to bill?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConvert?.challanNumber} will be billed using cylinders linked to this challan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingConvert) return;
                convertMut.mutate(pendingConvert.id);
                setPendingConvert(null);
              }}
            >
              Convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
