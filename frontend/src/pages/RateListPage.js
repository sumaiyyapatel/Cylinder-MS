import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function RateListPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const defaultForm = { gasCode: "", ownerCode: "COC", cylinderType: "", ratePerUnit: "", rentalFreeDays: "7", rentalRate1: "", rentalDaysFrom1: "", rentalDaysTo1: "", rentalRate2: "", rentalDaysFrom2: "", rentalDaysTo2: "", rentalRate3: "", rentalDaysFrom3: "", rentalDaysTo3: "", gstRate: "" };
  const [form, setForm] = useState(defaultForm);

  const { data: rates, isLoading } = useQuery({ queryKey: ["rateList"], queryFn: () => api.get("/rate-list").then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/rate-list/${editing.id}`, d) : api.post("/rate-list", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rateList"] }); setDialogOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/rate-list/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rateList"] }); toast.success("Deleted"); },
  });

  const openNew = () => { setEditing(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ gasCode: r.gasCode, ownerCode: r.ownerCode, cylinderType: r.cylinderType || "", ratePerUnit: r.ratePerUnit || "", rentalFreeDays: r.rentalFreeDays ?? "7", rentalRate1: r.rentalRate1 || "", rentalDaysFrom1: r.rentalDaysFrom1 || "", rentalDaysTo1: r.rentalDaysTo1 || "", rentalRate2: r.rentalRate2 || "", rentalDaysFrom2: r.rentalDaysFrom2 || "", rentalDaysTo2: r.rentalDaysTo2 || "", rentalRate3: r.rentalRate3 || "", rentalDaysFrom3: r.rentalDaysFrom3 || "", rentalDaysTo3: r.rentalDaysTo3 || "", gstRate: r.gstRate || "" });
    setDialogOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const p = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v === "" || v === null) return;
      if (["ratePerUnit", "rentalRate1", "rentalRate2", "rentalRate3", "gstRate"].includes(k)) p[k] = parseFloat(v);
      else if (["rentalFreeDays", "rentalDaysFrom1", "rentalDaysTo1", "rentalDaysFrom2", "rentalDaysTo2", "rentalDaysFrom3", "rentalDaysTo3"].includes(k)) p[k] = parseInt(v);
      else p[k] = v;
    });
    saveMut.mutate(p);
  };

  return (
    <div className="space-y-4" data-testid="rate-list-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Rate List</h1>
        {hasRole("ADMIN", "MANAGER") && <Button data-testid="add-rate-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> Add Rate</Button>}
      </div>
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="rate-list-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Gas</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Rate/Unit</th>
                <th className="px-3 py-2">Free Days</th><th className="px-3 py-2">Tier 1</th><th className="px-3 py-2">Tier 2</th><th className="px-3 py-2">Tier 3</th>
                <th className="px-3 py-2">GST%</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (rates || []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.gasType?.name || r.gasCode}</td>
                    <td className="px-3 py-2">{r.ownerCode}</td>
                    <td className="px-3 py-2">{r.cylinderType || "-"}</td>
                    <td className="px-3 py-2">{formatINR(r.ratePerUnit)}</td>
                    <td className="px-3 py-2">{r.rentalFreeDays ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{r.rentalRate1 ? `₹${r.rentalRate1}/d (${r.rentalDaysFrom1}-${r.rentalDaysTo1}d)` : "-"}</td>
                    <td className="px-3 py-2 text-xs">{r.rentalRate2 ? `₹${r.rentalRate2}/d (${r.rentalDaysFrom2}-${r.rentalDaysTo2}d)` : "-"}</td>
                    <td className="px-3 py-2 text-xs">{r.rentalRate3 ? `₹${r.rentalRate3}/d (${r.rentalDaysFrom3}+d)` : "-"}</td>
                    <td className="px-3 py-2">{r.gstRate ? `${r.gstRate}%` : "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasRole("ADMIN", "MANAGER") && <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}
                        {hasRole("ADMIN") && <button onClick={() => { if (window.confirm("Delete?")) delMut.mutate(r.id); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Rate" : "Add Rate"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><Label className="text-sm">Gas Type *</Label><Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}><SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-sm">Owner *</Label><Select value={form.ownerCode} onValueChange={(v) => setForm({ ...form, ownerCode: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent></Select></div>
              <div><Label className="text-sm">Cylinder Type</Label><Input value={form.cylinderType} onChange={(e) => setForm({ ...form, cylinderType: e.target.value })} className="h-9 mt-1" /></div>
              <div><Label className="text-sm">Rate/Unit</Label><Input value={form.ratePerUnit} onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })} type="number" step="0.01" className="h-9 mt-1" /></div>
            </div>
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-2">Rental Tiers</h4>
              <div className="grid grid-cols-4 gap-3">
                <div><Label className="text-xs">Free Days</Label><Input value={form.rentalFreeDays} onChange={(e) => setForm({ ...form, rentalFreeDays: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 1 Rate/day</Label><Input value={form.rentalRate1} onChange={(e) => setForm({ ...form, rentalRate1: e.target.value })} type="number" step="0.01" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 1 From Day</Label><Input value={form.rentalDaysFrom1} onChange={(e) => setForm({ ...form, rentalDaysFrom1: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 1 To Day</Label><Input value={form.rentalDaysTo1} onChange={(e) => setForm({ ...form, rentalDaysTo1: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div><Label className="text-xs">Tier 2 Rate/day</Label><Input value={form.rentalRate2} onChange={(e) => setForm({ ...form, rentalRate2: e.target.value })} type="number" step="0.01" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 2 From</Label><Input value={form.rentalDaysFrom2} onChange={(e) => setForm({ ...form, rentalDaysFrom2: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 2 To</Label><Input value={form.rentalDaysTo2} onChange={(e) => setForm({ ...form, rentalDaysTo2: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div><Label className="text-xs">Tier 3 Rate/day</Label><Input value={form.rentalRate3} onChange={(e) => setForm({ ...form, rentalRate3: e.target.value })} type="number" step="0.01" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 3 From</Label><Input value={form.rentalDaysFrom3} onChange={(e) => setForm({ ...form, rentalDaysFrom3: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
                <div><Label className="text-xs">Tier 3 To</Label><Input value={form.rentalDaysTo3} onChange={(e) => setForm({ ...form, rentalDaysTo3: e.target.value })} type="number" className="h-8 mt-1 text-sm" /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4"><div><Label className="text-sm">GST Rate %</Label><Input value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} type="number" step="0.01" className="h-9 mt-1" /></div></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="rate-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
