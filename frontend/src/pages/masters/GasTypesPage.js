import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function GasTypesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ gasCode: "", name: "", chemicalName: "", formula: "", hsnCode: "", gstRate: "", itemCode: "" });

  const { data: gasTypes, isLoading } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/gas-types/${editing.id}`, d) : api.post("/gas-types", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gasTypes"] }); setDialogOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/gas-types/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gasTypes"] }); toast.success("Deleted"); },
  });

  const openNew = () => { setEditing(null); setForm({ gasCode: "", name: "", chemicalName: "", formula: "", hsnCode: "", gstRate: "", itemCode: "" }); setDialogOpen(true); };
  const openEdit = (g) => { setEditing(g); setForm({ gasCode: g.gasCode, name: g.name, chemicalName: g.chemicalName || "", formula: g.formula || "", hsnCode: g.hsnCode || "", gstRate: g.gstRate || "", itemCode: g.itemCode || "" }); setDialogOpen(true); };

  const handleSave = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (payload.gstRate) payload.gstRate = parseFloat(payload.gstRate);
    else delete payload.gstRate;
    saveMut.mutate(payload);
  };

  return (
    <div className="space-y-4" data-testid="gas-types-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Gas Types</h1>
        {hasRole("ADMIN", "MANAGER") && (
          <Button data-testid="add-gas-type-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> Add Gas Type</Button>
        )}
      </div>

      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left" data-testid="gas-types-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Chemical Name</th>
              <th className="px-3 py-2">Formula</th>
              <th className="px-3 py-2">HSN Code</th>
              <th className="px-3 py-2">GST %</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : (gasTypes || []).map((g) => (
              <tr key={g.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs font-medium">{g.gasCode}</td>
                <td className="px-3 py-2 font-medium">{g.name}</td>
                <td className="px-3 py-2 text-slate-600">{g.chemicalName || "-"}</td>
                <td className="px-3 py-2 text-slate-600">{g.formula || "-"}</td>
                <td className="px-3 py-2 font-mono text-xs">{g.hsnCode || "-"}</td>
                <td className="px-3 py-2">{g.gstRate != null ? `${g.gstRate}%` : "-"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {hasRole("ADMIN", "MANAGER") && <button onClick={() => openEdit(g)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}
                    {hasRole("ADMIN") && <button onClick={() => { if (window.confirm("Delete?")) delMut.mutate(g.id); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Gas Type" : "Add Gas Type"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm font-medium text-slate-700">Gas Code *</Label><Input value={form.gasCode} onChange={(e) => setForm({ ...form, gasCode: e.target.value.toUpperCase() })} maxLength={2} className="h-9 mt-1" required disabled={!!editing} /></div>
            <div><Label className="text-sm font-medium text-slate-700">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 mt-1" required /></div>
            <div><Label className="text-sm font-medium text-slate-700">Chemical Name</Label><Input value={form.chemicalName} onChange={(e) => setForm({ ...form, chemicalName: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm font-medium text-slate-700">Formula</Label><Input value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm font-medium text-slate-700">HSN Code</Label><Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} className="h-9 mt-1" /></div>
            <div><Label className="text-sm font-medium text-slate-700">GST Rate %</Label><Input value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} type="number" step="0.01" className="h-9 mt-1" /></div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="gas-type-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
