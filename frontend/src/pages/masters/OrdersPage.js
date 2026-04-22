import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate, orderStatusColors } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";

export default function OrdersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ orderNumber: "", orderDate: new Date().toISOString().split("T")[0], customerId: "", gasCode: "", ownerCode: "COC", quantityCyl: "", rate: "", status: "ACTIVE" });

  const { data, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => api.get("/orders", { params: { limit: 100 } }).then(r => r.data) });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => editing ? api.put(`/orders/${editing.id}`, d) : api.post("/orders", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setDialogOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const openNew = () => { setEditing(null); setForm({ orderNumber: "", orderDate: new Date().toISOString().split("T")[0], customerId: "", gasCode: "", ownerCode: "COC", quantityCyl: "", rate: "", status: "ACTIVE" }); setDialogOpen(true); };

  const handleSave = (e) => {
    e.preventDefault();

    const orderNumber = form.orderNumber.trim();
    if (!orderNumber) return toast.error("Order number is required");
    if (!form.customerId) return toast.error("Customer is required");
    if (!form.orderDate) return toast.error("Order date is required");

    const parsedOrderDate = new Date(form.orderDate);
    if (Number.isNaN(parsedOrderDate.getTime())) return toast.error("Order date is invalid");

    const p = { ...form, orderNumber, customerId: parseInt(form.customerId, 10), orderDate: parsedOrderDate.toISOString() };
    if (p.quantityCyl) p.quantityCyl = parseInt(p.quantityCyl); else delete p.quantityCyl;
    if (p.rate) p.rate = parseFloat(p.rate); else delete p.rate;
    if (p.quantityCyl !== undefined && (!Number.isInteger(p.quantityCyl) || p.quantityCyl <= 0)) return toast.error("Quantity must be a positive integer");
    if (p.rate !== undefined && (!Number.isFinite(p.rate) || p.rate < 0)) return toast.error("Rate must be a non-negative number");
    if (!p.gasCode) delete p.gasCode;
    saveMut.mutate(p);
  };

  return (
    <div className="space-y-4" data-testid="orders-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Orders</h1>
        {hasRole("ADMIN", "MANAGER", "OPERATOR") && <Button data-testid="add-order-btn" onClick={openNew} className="h-9 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" /> New Order</Button>}
      </div>
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="orders-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Order No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Gas</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No orders</td></tr> :
                (data?.data || []).map(o => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{o.orderNumber}</td>
                    <td className="px-3 py-2">{formatDate(o.orderDate)}</td>
                    <td className="px-3 py-2">{o.gasCode || "-"}</td>
                    <td className="px-3 py-2">{o.ownerCode || "-"}</td>
                    <td className="px-3 py-2">{o.quantityCyl || "-"}</td>
                    <td className="px-3 py-2"><span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${orderStatusColors[o.status] || ""}`}>{o.status}</span></td>
                    <td className="px-3 py-2 text-right">
                      {hasRole("ADMIN", "MANAGER", "OPERATOR") && <button onClick={() => { setEditing(o); setForm({ ...o, orderDate: o.orderDate?.split("T")[0], customerId: String(o.customerId) }); setDialogOpen(true); }} className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>{editing ? "Edit Order" : "New Order"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm">Order Number *</Label><Input value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} className="h-9 mt-1" required /></div>
            <div><Label className="text-sm">Order Date *</Label><Input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} className="h-9 mt-1" required /></div>
            <div><Label className="text-sm">Customer *</Label>
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Gas Type</Label>
              <Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Owner</Label><Select value={form.ownerCode} onValueChange={(v) => setForm({ ...form, ownerCode: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent></Select></div>
            <div><Label className="text-sm">Quantity (Cyl)</Label><Input value={form.quantityCyl} onChange={(e) => setForm({ ...form, quantityCyl: e.target.value })} type="number" className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Rate</Label><Input value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} type="number" step="0.01" className="h-9 mt-1" /></div>
            <div><Label className="text-sm">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">ACTIVE</SelectItem><SelectItem value="CLOSED">CLOSED</SelectItem><SelectItem value="CANCELLED">CANCELLED</SelectItem></SelectContent></Select></div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
              <Button type="submit" data-testid="order-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
