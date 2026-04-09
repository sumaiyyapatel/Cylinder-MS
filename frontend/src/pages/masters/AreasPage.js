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

export default function AreasPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ areaCode: "", areaName: "" });

  const { data: areas, isLoading } = useQuery({
    queryKey: ["areas"],
    queryFn: () => api.get("/areas").then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/areas/${editing.id}`, d) : api.post("/areas", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["areas"] }); setDialogOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/areas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["areas"] }); toast.success("Deleted"); },
  });

  const openNew = () => { setEditing(null); setForm({ areaCode: "", areaName: "" }); setDialogOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ areaCode: a.areaCode, areaName: a.areaName }); setDialogOpen(true); };

  return (
    <div className="space-y-4" data-testid="areas-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Areas</h1>
        {hasRole("ADMIN", "MANAGER") && <Button data-testid="add-area-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> Add Area</Button>}
      </div>
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden max-w-lg">
        <table className="w-full text-sm text-left" data-testid="areas-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
              <th className="px-3 py-2">Code</th><th className="px-3 py-2">Area Name</th><th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
              (areas || []).map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-sm font-medium">{a.areaCode}</td>
                  <td className="px-3 py-2">{a.areaName}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {hasRole("ADMIN", "MANAGER") && <button onClick={() => openEdit(a)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}
                      {hasRole("ADMIN") && <button onClick={() => { if (window.confirm("Delete?")) delMut.mutate(a.id); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Area" : "Add Area"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-4">
            <div><Label className="text-sm font-medium text-slate-700">Area Code *</Label><Input value={form.areaCode} onChange={(e) => setForm({ ...form, areaCode: e.target.value.toUpperCase() })} maxLength={1} className="h-9 mt-1" required disabled={!!editing} /></div>
            <div><Label className="text-sm font-medium text-slate-700">Area Name *</Label><Input value={form.areaName} onChange={(e) => setForm({ ...form, areaName: e.target.value })} className="h-9 mt-1" required /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="area-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
