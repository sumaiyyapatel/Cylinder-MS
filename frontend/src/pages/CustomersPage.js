import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

export default function CustomersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: "", name: "", title: "", address1: "", city: "", pin: "", phone: "", email: "", gstin: "", contactPerson: "", areaCode: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.get("/customers", { params: { search, limit: 100 } }).then((r) => r.data),
  });

  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: () => api.get("/areas").then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/customers/${editing.id}`, d) : api.post("/customers", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setDialogOpen(false); toast.success(editing ? "Customer updated" : "Customer created"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Customer deleted"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed to delete"),
  });

  const openNew = () => { setEditing(null); setForm({ code: "", name: "", title: "", address1: "", city: "", pin: "", phone: "", email: "", gstin: "", contactPerson: "", areaCode: "" }); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ code: c.code, name: c.name, title: c.title || "", address1: c.address1 || "", city: c.city || "", pin: c.pin || "", phone: c.phone || "", email: c.email || "", gstin: c.gstin || "", contactPerson: c.contactPerson || "", areaCode: c.areaCode || "" }); setDialogOpen(true); };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.code || !form.name) return toast.error("Code and name are required");
    const payload = { ...form };
    if (!payload.areaCode) delete payload.areaCode;
    saveMut.mutate(payload);
  };

  return (
    <div className="space-y-4" data-testid="customers-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Customers</h1>
        {hasRole("ADMIN", "MANAGER", "OPERATOR") && (
          <Button data-testid="add-customer-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> Add Customer
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input data-testid="customer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code, city..." className="pl-9 h-9" />
      </div>

      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="customers-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">GSTIN</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : (data?.data || []).length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No customers found</td></tr>
              ) : (
                (data?.data || []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{c.code}</td>
                    <td className="px-3 py-2 font-medium">{c.title ? `${c.title} ` : ""}{c.name}</td>
                    <td className="px-3 py-2 text-slate-600">{c.city || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{c.phone || "-"}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{c.area?.areaName || c.areaCode || "-"}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{c.gstin || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasRole("ADMIN", "MANAGER", "OPERATOR") && (
                          <button data-testid={`edit-customer-${c.id}`} onClick={() => openEdit(c)} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        {hasRole("ADMIN") && (
                          <button data-testid={`delete-customer-${c.id}`} onClick={() => { if (window.confirm("Delete this customer?")) delMut.mutate(c.id); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
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
            <span>Showing {data.data.length} of {data.total} customers</span>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Code *</Label>
              <Input data-testid="customer-code-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={5} className="h-9 mt-1" disabled={!!editing} required />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Title</Label>
              <Select value={form.title} onValueChange={(v) => setForm({ ...form, title: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="customer-title-select"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M/s">M/s</SelectItem>
                  <SelectItem value="Mr.">Mr.</SelectItem>
                  <SelectItem value="Dr.">Dr.</SelectItem>
                  <SelectItem value="Smt.">Smt.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Name *</Label>
              <Input data-testid="customer-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 mt-1" required />
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm font-medium text-slate-700">Address</Label>
              <Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">PIN</Label>
              <Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={6} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} maxLength={15} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Contact Person</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Area</Label>
              <Select value={form.areaCode} onValueChange={(v) => setForm({ ...form, areaCode: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="customer-area-select"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  {(areas || []).map((a) => (
                    <SelectItem key={a.areaCode} value={a.areaCode}>{a.areaCode} - {a.areaName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="customer-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
