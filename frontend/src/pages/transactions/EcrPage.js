import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText } from "lucide-react";
import { generateEcrPDF } from "@/lib/pdf-export";

export default function EcrPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ecrDate: new Date().toISOString().split("T")[0],
    customerId: "",
    cylinderNumber: "",
    gasCode: "",
    cylinderOwner: "COC",
    challanNumber: "",
    vehicleNumber: "",
    quantityCum: "",
  });
  const [cylInfo, setCylInfo] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ecr", page],
    queryFn: () => api.get("/ecr", { params: { page, limit } }).then(r => r.data),
  });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/ecr", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ecr"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`ECR ${res.data.ecrNumber} created. Rent: ${formatINR(res.data.rentAmount)}`);
      setShowForm(false);
      setCylInfo(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const lookupCylinder = async (cylNum) => {
    if (!cylNum) return;
    try {
      const { data } = await api.get(`/ecr/cylinder-info/${cylNum}`);
      setCylInfo(data);
      if (data.cylinder?.gasCode) setForm(f => ({ ...f, gasCode: data.cylinder.gasCode, cylinderOwner: data.cylinder.ownerCode || "COC" }));
      if (data.holding?.customerId) setForm(f => ({ ...f, customerId: String(data.holding.customerId) }));
    } catch {
      setCylInfo(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customerId || !form.cylinderNumber) return toast.error("Customer and cylinder number required");
    saveMut.mutate({ ...form, customerId: parseInt(form.customerId), quantityCum: form.quantityCum ? parseFloat(form.quantityCum) : undefined });
  };

  const handleEcrPdf = async (record) => {
    try {
      await generateEcrPDF(record, record.customer);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || "Failed to generate PDF");
    }
  };

  return (
    <div className="space-y-4" data-testid="ecr-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>ECR (Empty Cylinder Returns)</h1>
        <Button data-testid="new-ecr-btn" onClick={() => setShowForm(!showForm)} className="h-9 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> {showForm ? "Cancel" : "New ECR"}
        </Button>
      </div>

      {showForm && (
        <Card className="border border-slate-200 shadow-sm" data-testid="ecr-entry-form">
          <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>ECR Entry</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">ECR Date</Label>
                  <Input type="date" value={form.ecrDate} onChange={(e) => setForm({ ...form, ecrDate: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Cylinder No *</Label>
                  <Input data-testid="ecr-cylinder-input" value={form.cylinderNumber} onChange={(e) => setForm({ ...form, cylinderNumber: e.target.value })} onBlur={(e) => lookupCylinder(e.target.value)} className="h-9 mt-1" required />
                </div>
                <div>
                  <Label className="text-sm">Party *</Label>
                  <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                    <SelectTrigger className="h-9 mt-1" data-testid="ecr-customer-select"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Owner</Label>
                  <Select value={form.cylinderOwner} onValueChange={(v) => setForm({ ...form, cylinderOwner: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="COC">COC</SelectItem><SelectItem value="POC">POC</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Challan No</Label>
                  <Input value={form.challanNumber} onChange={(e) => setForm({ ...form, challanNumber: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Vehicle No</Label>
                  <Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Quantity Cu.M</Label>
                  <Input value={form.quantityCum} onChange={(e) => setForm({ ...form, quantityCum: e.target.value })} type="number" step="0.01" className="h-9 mt-1" />
                </div>
              </div>

              {cylInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm" data-testid="ecr-cylinder-info">
                  <div className="font-semibold text-blue-800 mb-1">Cylinder Info</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-blue-700">
                    <div>Gas: <strong>{cylInfo.cylinder?.gasType?.name || "-"}</strong></div>
                    <div>Status: <strong>{cylInfo.cylinder?.status}</strong></div>
                    {cylInfo.holding && (
                      <>
                        <div>Issued: <strong>{formatDate(cylInfo.holding.issuedAt)}</strong></div>
                        <div>Days Held: <strong className={cylInfo.holding.holdDays > 30 ? "text-red-600" : ""}>{cylInfo.holding.holdDays}</strong></div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setCylInfo(null); }} className="h-9">Cancel</Button>
                <Button type="submit" data-testid="ecr-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving..." : "Save ECR"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ECR List */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="ecr-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">ECR No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Cylinder</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Rent</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No ECR records</td></tr> :
                (data?.data || []).map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{e.ecrNumber}</td>
                    <td className="px-3 py-2">{formatDate(e.ecrDate)}</td>
                    <td className="px-3 py-2">{e.customer?.name || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.cylinderNumber}</td>
                    <td className="px-3 py-2">{e.holdDays ?? "-"}</td>
                    <td className="px-3 py-2 font-medium">{formatINR(e.rentAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEcrPdf(e)}
                        className="h-7 px-2 text-xs"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" /> Print
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
              Page {data.page || 1} of {data.totalPages || 1} - Showing {data.data.length} of {data.total} ECR records
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
