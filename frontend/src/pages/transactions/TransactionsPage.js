import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Send, FileText, CheckCircle } from "lucide-react";
import { generateBillPDF } from "@/lib/pdf-export";

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    billDate: new Date().toISOString().split("T")[0],
    customerId: "",
    gasCode: "",
    cylinderOwner: "COC",
    orderNumber: "",
    transactionCode: "ISSUE",
    cylinders: [{ cylinderNumber: "", quantityCum: "" }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page],
    queryFn: () => api.get("/transactions", { params: { page, limit } }).then(r => r.data),
  });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });
  const { data: gasTypes } = useQuery({ queryKey: ["gasTypes"], queryFn: () => api.get("/gas-types").then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/transactions", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Bill ${res.data.bill?.billNumber || ""} created`);
      setShowForm(false);
      setForm({ billDate: new Date().toISOString().split("T")[0], customerId: "", gasCode: "", cylinderOwner: "COC", orderNumber: "", transactionCode: "ISSUE", cylinders: [{ cylinderNumber: "", quantityCum: "" }] });
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const addCylRow = () => {
    if (form.cylinders.length >= 20) return toast.error("Max 20 cylinders");
    setForm({ ...form, cylinders: [...form.cylinders, { cylinderNumber: "", quantityCum: "" }] });
  };

  const updateCyl = (idx, field, val) => {
    const cyls = [...form.cylinders];
    cyls[idx] = { ...cyls[idx], [field]: val };
    setForm({ ...form, cylinders: cyls });
  };

  const removeCyl = (idx) => {
    if (form.cylinders.length <= 1) return;
    setForm({ ...form, cylinders: form.cylinders.filter((_, i) => i !== idx) });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("Select a customer");
    const validCyls = form.cylinders.filter(c => c.cylinderNumber);
    if (!validCyls.length) return toast.error("At least one cylinder required");
    saveMut.mutate({ ...form, customerId: parseInt(form.customerId), cylinders: validCyls });
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
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to mark WhatsApp sent");
    }
  };

  const handleBillPdf = async (bill) => {
    try {
      await generateBillPDF(bill, bill.customer);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || "Failed to generate PDF");
    }
  };

  const customerName = customers?.data?.find(c => c.id === parseInt(form.customerId))?.name || "";

  return (
    <div className="space-y-4" data-testid="transactions-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Bill Cum Challan</h1>
        <Button data-testid="new-bill-btn" onClick={() => setShowForm(!showForm)} className="h-9 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> {showForm ? "Cancel" : "New Bill"}
        </Button>
      </div>

      {showForm && (
        <Card className="border border-slate-200 shadow-sm" data-testid="bill-entry-form">
          <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>New Bill Cum Challan Entry</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Bill Date *</Label>
                  <Input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} className="h-9 mt-1" required />
                </div>
                <div>
                  <Label className="text-sm">Party Code *</Label>
                  <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                    <SelectTrigger className="h-9 mt-1" data-testid="bill-customer-select"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {customerName && <div className="text-xs text-blue-600 mt-1">{customerName}</div>}
                </div>
                <div>
                  <Label className="text-sm">Owner</Label>
                  <Select value={form.cylinderOwner} onValueChange={(v) => setForm({ ...form, cylinderOwner: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Gas Type</Label>
                  <Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cylinder Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Cylinders</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCylRow} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Row</Button>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wider font-semibold">
                        <th className="px-3 py-2 w-12">Sr</th>
                        <th className="px-3 py-2">Cylinder No</th>
                        <th className="px-3 py-2 w-32">Cu.M / Kgs</th>
                        <th className="px-3 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.cylinders.map((cyl, idx) => (
                        <tr key={idx} className="border-b border-slate-100">
                          <td className="px-3 py-1.5 text-center text-xs text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5">
                            <Input value={cyl.cylinderNumber} onChange={(e) => updateCyl(idx, "cylinderNumber", e.target.value)} className="h-8 text-sm" placeholder="Enter cylinder no" data-testid={`cyl-number-${idx}`} />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input value={cyl.quantityCum} onChange={(e) => updateCyl(idx, "quantityCum", e.target.value)} type="number" step="0.01" className="h-8 text-sm" />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {form.cylinders.length > 1 && <button type="button" onClick={() => removeCyl(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-4 mt-2 text-sm text-slate-600">
                  <span>Total Cylinders: <strong>{form.cylinders.filter(c => c.cylinderNumber).length}</strong></span>
                  <span>Total Cu.M: <strong>{form.cylinders.reduce((s, c) => s + (parseFloat(c.quantityCum) || 0), 0).toFixed(2)}</strong></span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-9">Cancel</Button>
                <Button type="submit" data-testid="bill-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving..." : "Save Bill"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transaction List */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" data-testid="transactions-table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-3 py-2">Bill No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Gas</th><th className="px-3 py-2">Cylinders</th><th className="px-3 py-2">Cu.M</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No transactions yet</td></tr> :
                (data?.data || []).map(t => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{t.billNumber}</td>
                    <td className="px-3 py-2">{formatDate(t.billDate)}</td>
                    <td className="px-3 py-2">{t.customer?.name || "-"}</td>
                    <td className="px-3 py-2">{t.gasCode || "-"}</td>
                    <td className="px-3 py-2">{t.totalCylinders || t.items?.length || 0}</td>
                    <td className="px-3 py-2">{t.totalQuantity || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.whatsappSent && (
                          <span className="inline-flex items-center text-green-600" title="WhatsApp sent">
                            <CheckCircle className="w-4 h-4" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(t)}
                          title="Send WhatsApp"
                          className="p-1 rounded hover:bg-slate-100 text-green-600"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBillPdf(t)}
                          title="View PDF"
                          className="p-1 rounded hover:bg-slate-100 text-blue-600"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!!t.items?.length && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {t.items.map((item) => item.cylinderNumber).join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white text-xs text-slate-500">
            <span>
              Page {data.page || 1} of {data.totalPages || 1} - Showing {data.data.length} of {data.total} transactions
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
    </div>
  );
}
