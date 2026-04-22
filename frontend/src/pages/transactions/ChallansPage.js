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
import { Plus, Printer, Trash2, FileText, ArrowRight } from "lucide-react";
import { generateChallanPDF } from "@/lib/pdf-export";

export default function ChallansPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    challanDate: new Date().toISOString().split("T")[0],
    customerId: "",
    cylinderOwner: "COC",
    cylindersCount: "",
    quantityCum: "",
    vehicleNumber: "",
    transactionType: "DELIVERY",
    linkedBillId: "",
    gasCode: "",
    cylinders: [{ cylinderNumber: "" }],
  });

  const { data, isLoading } = useQuery({ queryKey: ["challans", page], queryFn: () => api.get("/challans", { params: { page, limit } }).then(r => r.data) });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });
  const { data: bills } = useQuery({ queryKey: ["transaction-bills-list"], queryFn: () => api.get("/transactions", { params: { page: 1, limit: 200 } }).then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/challans", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
      setForm({
        challanDate: new Date().toISOString().split("T")[0],
        customerId: "",
        cylinderOwner: "COC",
        cylindersCount: "",
        quantityCum: "",
        vehicleNumber: "",
        transactionType: "DELIVERY",
        linkedBillId: "",
        gasCode: "",
        cylinders: [{ cylinderNumber: "" }],
      });
      toast.success("Challan created");
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const convertMut = useMutation({
    mutationFn: (id) => api.post(`/challans/${id}/convert-to-bill`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Converted to bill ${res.data.billNumber || ""}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || "Conversion failed"),
  });

  const addCylinderRow = () => setForm((f) => ({ ...f, cylinders: [...f.cylinders, { cylinderNumber: "" }] }));
  const updateCylinderRow = (idx, value) => {
    const cylinders = [...form.cylinders];
    cylinders[idx] = { cylinderNumber: value };
    setForm({ ...form, cylinders });
  };
  const removeCylinderRow = (idx) => {
    if (form.cylinders.length <= 1) return;
    setForm({ ...form, cylinders: form.cylinders.filter((_, i) => i !== idx) });
  };

  const getStatusBadge = (status, linkedBill) => {
    if (status === "BILLED" || linkedBill) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full bg-green-100 text-green-700">
          BILLED
          {linkedBill?.billNumber && <span className="ml-1 font-mono">({linkedBill.billNumber})</span>}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700">
        OPEN
      </span>
    );
  };

  const handleChallanPdf = async (challan) => {
    try {
      await generateChallanPDF(challan, challan.customer);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || "Failed to generate PDF");
    }
  };

  return (
    <div className="space-y-4" data-testid="challans-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Challans</h1>
        <Button data-testid="new-challan-btn" onClick={() => setDialogOpen(true)} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> New Challan</Button>
      </div>
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="challans-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Challan No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Owner</th><th className="px-3 py-2">Cyls</th><th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No challans</td></tr> :
                (data?.data || []).map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{c.challanNumber}</td>
                    <td className="px-3 py-2">{formatDate(c.challanDate)}</td>
                    <td className="px-3 py-2">{c.customer?.name || "-"}</td>
                    <td className="px-3 py-2">{c.cylinderOwner || "-"}</td>
                    <td className="px-3 py-2">{c.cylindersCount || "-"}</td>
                    <td className="px-3 py-2">{c.vehicleNumber || "-"}</td>
                    <td className="px-3 py-2">{c.transactionType || "-"}</td>
                    <td className="px-3 py-2">{getStatusBadge(c.status, c.linkedBill)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status !== "BILLED" && !c.linkedBillId && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Convert challan ${c.challanNumber} to a bill?`)) {
                                convertMut.mutate(c.id);
                              }
                            }}
                            className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                            disabled={convertMut.isPending}
                            title="Convert to Bill"
                          >
                            <ArrowRight className="w-3.5 h-3.5 mr-1" /> To Bill
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleChallanPdf(c)}
                          className="h-7 px-2 text-xs"
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" /> Print
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white text-xs text-slate-500">
            <span>
              Page {data.page || 1} of {data.totalPages || 1} - Showing {data.data.length} of {data.total} challans
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={(data.page || 1) <= 1}
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setPage((p) => p + 1)}
                disabled={(data.page || 1) >= (data.totalPages || 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>New Challan</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.customerId) return toast.error("Select customer");
              const validCylinders = form.cylinders.filter((c) => c.cylinderNumber.trim());
              saveMut.mutate({
                ...form,
                customerId: parseInt(form.customerId),
                linkedBillId: form.linkedBillId ? parseInt(form.linkedBillId) : undefined,
                cylinders: validCylinders.length ? validCylinders : undefined,
                cylindersCount: validCylinders.length || form.cylindersCount,
                gasCode: form.gasCode || undefined,
              });
            }}
            className="grid grid-cols-2 gap-4"
          >
            <div><Label className="text-sm">Date</Label><Input type="date" value={form.challanDate} onChange={(e) => setForm({ ...form, challanDate: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Customer *</Label><Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}><SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-sm">Owner</Label><Select value={form.cylinderOwner} onValueChange={(v) => setForm({ ...form, cylinderOwner: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent></Select></div>
            <div>
              <Label className="text-sm">Gas Type</Label>
              <Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Cylinders Count</Label><Input value={form.cylindersCount} onChange={(e) => setForm({ ...form, cylindersCount: e.target.value })} type="number" className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Vehicle No</Label><Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Type</Label><Select value={form.transactionType} onValueChange={(v) => setForm({ ...form, transactionType: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DELIVERY">Delivery</SelectItem><SelectItem value="RETURN">Return</SelectItem></SelectContent></Select></div>
            <div className="col-span-2">
              <Label className="text-sm">Linked Bill</Label>
              <Select value={form.linkedBillId} onValueChange={(v) => setForm({ ...form, linkedBillId: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {(bills?.data || []).map((bill) => (
                    <SelectItem key={bill.id} value={String(bill.id)}>
                      {bill.billNumber} - {bill.customer?.name || "-"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Cylinder Numbers</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCylinderRow} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {form.cylinders.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={row.cylinderNumber}
                      onChange={(e) => updateCylinderRow(idx, e.target.value)}
                      className="h-9"
                      placeholder="Cylinder number"
                    />
                    {form.cylinders.length > 1 && (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeCylinderRow(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="challan-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
