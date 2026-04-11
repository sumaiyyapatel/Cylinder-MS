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
import { Plus, Printer } from "lucide-react";
import { generateChallanPDF } from "@/lib/pdf-export";

export default function ChallansPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ challanDate: new Date().toISOString().split("T")[0], customerId: "", cylinderOwner: "COC", cylindersCount: "", quantityCum: "", vehicleNumber: "", transactionType: "DELIVERY" });

  const { data, isLoading } = useQuery({ queryKey: ["challans", page], queryFn: () => api.get("/challans", { params: { page, limit } }).then(r => r.data) });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/challans", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["challans"] }); setDialogOpen(false); toast.success("Challan created"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

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
                <th className="px-3 py-2">Owner</th><th className="px-3 py-2">Cyls</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No challans</td></tr> :
                (data?.data || []).map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{c.challanNumber}</td>
                    <td className="px-3 py-2">{formatDate(c.challanDate)}</td>
                    <td className="px-3 py-2">{c.customer?.name || "-"}</td>
                    <td className="px-3 py-2">{c.cylinderOwner || "-"}</td>
                    <td className="px-3 py-2">{c.cylindersCount || "-"}</td>
                    <td className="px-3 py-2">{c.vehicleNumber || "-"}</td>
                    <td className="px-3 py-2">{c.transactionType || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateChallanPDF(c, c.customer)}
                        className="h-7 px-2 text-xs"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1" /> Print
                      </Button>
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
          <form onSubmit={(e) => { e.preventDefault(); if (!form.customerId) return toast.error("Select customer"); saveMut.mutate({ ...form, customerId: parseInt(form.customerId) }); }} className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm">Date</Label><Input type="date" value={form.challanDate} onChange={(e) => setForm({ ...form, challanDate: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Customer *</Label><Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}><SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-sm">Owner</Label><Select value={form.cylinderOwner} onValueChange={(v) => setForm({ ...form, cylinderOwner: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent></Select></div>
            <div><Label className="text-sm">Cylinders Count</Label><Input value={form.cylindersCount} onChange={(e) => setForm({ ...form, cylindersCount: e.target.value })} type="number" className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Vehicle No</Label><Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Type</Label><Select value={form.transactionType} onValueChange={(v) => setForm({ ...form, transactionType: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DELIVERY">Delivery</SelectItem><SelectItem value="RETURN">Return</SelectItem></SelectContent></Select></div>
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
