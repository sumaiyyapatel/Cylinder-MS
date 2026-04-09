import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cylinderStatusColors } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

const STATUSES = ["IN_STOCK", "WITH_CUSTOMER", "IN_TRANSIT", "DAMAGED", "UNDER_TEST", "CONDEMNED"];

export default function CylindersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ownerCode: "COC", cylinderNumber: "", particular: "", capacity: "", gasCode: "", status: "IN_STOCK" });

  const { data, isLoading } = useQuery({
    queryKey: ["cylinders", search, statusFilter, page],
    queryFn: () => api.get("/cylinders", { params: { search, status: statusFilter || undefined, page, limit } }).then((r) => r.data),
  });

  const { data: gasTypes } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/cylinders/${editing.id}`, d) : api.post("/cylinders", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cylinders"] }); setDialogOpen(false); toast.success(editing ? "Cylinder updated" : "Cylinder added"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/cylinders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cylinders"] }); toast.success("Cylinder deleted"); },
  });

  const openNew = () => { setEditing(null); setForm({ ownerCode: "COC", cylinderNumber: "", particular: "", capacity: "", gasCode: "", status: "IN_STOCK" }); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ownerCode: c.ownerCode, cylinderNumber: c.cylinderNumber, particular: c.particular || "", capacity: c.capacity || "", gasCode: c.gasCode || "", status: c.status }); setDialogOpen(true); };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.cylinderNumber) return toast.error("Cylinder number required");
    const payload = { ...form };
    if (payload.capacity) payload.capacity = parseFloat(payload.capacity);
    else delete payload.capacity;
    if (!payload.gasCode) delete payload.gasCode;
    saveMut.mutate(payload);
  };

  return (
    <div className="space-y-4" data-testid="cylinders-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Cylinders</h1>
        {hasRole("ADMIN", "MANAGER", "OPERATOR") && (
          <Button data-testid="add-cylinder-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> Add Cylinder
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            data-testid="cylinder-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="pl-9 h-9 w-64"
          />
        </div>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-48" data-testid="cylinder-status-filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="cylinders-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Cylinder No</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Gas</th>
                <th className="px-3 py-2">Capacity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Particular</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : (data?.data || []).length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No cylinders found</td></tr>
              ) : (
                (data?.data || []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{c.cylinderNumber}</td>
                    <td className="px-3 py-2">{c.ownerCode}</td>
                    <td className="px-3 py-2">{c.gasType?.name || c.gasCode || "-"}</td>
                    <td className="px-3 py-2">{c.capacity ? `${c.capacity} L` : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cylinderStatusColors[c.status] || "bg-slate-50 text-slate-600"}`}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{c.particular || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasRole("ADMIN", "MANAGER", "OPERATOR") && (
                          <button data-testid={`edit-cylinder-${c.id}`} onClick={() => openEdit(c)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        {hasRole("ADMIN") && (
                          <button data-testid={`delete-cylinder-${c.id}`} onClick={() => { if (window.confirm("Delete?")) delMut.mutate(c.id); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white text-xs text-slate-500">
            <span>
              Page {data.page || 1} of {data.totalPages || 1} - Showing {data.data.length} of {data.total} cylinders
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
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Cylinder" : "Add Cylinder"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Owner Code *</Label>
              <Select value={form.ownerCode} onValueChange={(v) => setForm({ ...form, ownerCode: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COC">COC</SelectItem>
                  <SelectItem value="POC">POC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Cylinder No *</Label>
              <Input data-testid="cylinder-number-input" value={form.cylinderNumber} onChange={(e) => setForm({ ...form, cylinderNumber: e.target.value })} className="h-9 mt-1" required />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Gas Type</Label>
              <Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(gasTypes || []).map((g) => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Capacity (L)</Label>
              <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} type="number" step="0.01" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Particular</Label>
              <Input value={form.particular} onChange={(e) => setForm({ ...form, particular: e.target.value })} className="h-9 mt-1" />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="cylinder-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
