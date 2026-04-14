import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ArrowRightLeft, Trash2 } from "lucide-react";

const COMPANIES = [
  { value: "POC", label: "Patel (POC)" },
  { value: "COC", label: "Jubilee (COC)" },
];

export default function TransfersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    transferDate: new Date().toISOString().split("T")[0],
    sourceCompany: "POC",
    destCompany: "COC",
    gasCode: "",
    cylindersCount: "",
    quantityCum: "",
    vehicleNumber: "",
    notes: "",
    cylinderNumbers: [""],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["transfers", page],
    queryFn: () => api.get("/transfers", { params: { page, limit } }).then(r => r.data),
  });

  const { data: gasTypes } = useQuery({
    queryKey: ["gasTypes"],
    queryFn: () => api.get("/gas-types").then(r => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/transfers", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Transfer ${res.data.transfer?.transferNumber || ""} created`);
      setShowForm(false);
      setForm({
        transferDate: new Date().toISOString().split("T")[0],
        sourceCompany: "POC",
        destCompany: "COC",
        gasCode: "",
        cylindersCount: "",
        quantityCum: "",
        vehicleNumber: "",
        notes: "",
        cylinderNumbers: [""],
      });
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const addCylRow = () => {
    if (form.cylinderNumbers.length >= 50) return toast.error("Max 50 cylinders per transfer");
    setForm({ ...form, cylinderNumbers: [...form.cylinderNumbers, ""] });
  };

  const updateCylRow = (idx, val) => {
    const nums = [...form.cylinderNumbers];
    nums[idx] = val;
    setForm({ ...form, cylinderNumbers: nums });
  };

  const removeCylRow = (idx) => {
    if (form.cylinderNumbers.length <= 1) return;
    setForm({ ...form, cylinderNumbers: form.cylinderNumbers.filter((_, i) => i !== idx) });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.sourceCompany === form.destCompany) return toast.error("Source and destination must be different");

    const validCyls = form.cylinderNumbers.filter(n => n.trim());
    saveMut.mutate({
      ...form,
      cylindersCount: validCyls.length || parseInt(form.cylindersCount) || 0,
      cylinderNumbers: validCyls.length ? validCyls : undefined,
      gasCode: form.gasCode || undefined,
      quantityCum: form.quantityCum || undefined,
    });
  };

  const getCompanyLabel = (code) => {
    const company = COMPANIES.find(c => c.value === code);
    return company?.label || code;
  };

  return (
    <div className="space-y-4" data-testid="transfers-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>
          Inter-Company Transfers
        </h1>
        <Button data-testid="new-transfer-btn" onClick={() => setShowForm(!showForm)} className="h-9 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> {showForm ? "Cancel" : "New Transfer"}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
        <ArrowRightLeft className="w-4 h-4 inline mr-2" />
        <strong>Stock movement only</strong> — Inter-company transfers between Patel (POC) and Jubilee (COC) do not create purchase ledger entries.
        Cylinder ownership codes are updated automatically.
      </div>

      {showForm && (
        <Card className="border border-slate-200 shadow-sm" data-testid="transfer-entry-form">
          <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>New Inter-Company Transfer</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Transfer Date *</Label>
                  <Input type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} className="h-9 mt-1" required />
                </div>
                <div>
                  <Label className="text-sm">Source Company *</Label>
                  <Select value={form.sourceCompany} onValueChange={(v) => setForm({ ...form, sourceCompany: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPANIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Destination Company *</Label>
                  <Select value={form.destCompany} onValueChange={(v) => setForm({ ...form, destCompany: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPANIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Gas Type</Label>
                  <Select value={form.gasCode} onValueChange={(v) => setForm({ ...form, gasCode: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {(gasTypes || []).map(g => <SelectItem key={g.gasCode} value={g.gasCode}>{g.gasCode} - {g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Vehicle No</Label>
                  <Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} className="h-9 mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-sm">Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={1} className="mt-1" placeholder="Optional notes" />
                </div>
              </div>

              {/* Cylinder Numbers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Cylinder Numbers (optional — updates ownership)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCylRow} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Row</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {form.cylinderNumbers.map((num, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        value={num}
                        onChange={(e) => updateCylRow(idx, e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Cylinder no"
                      />
                      {form.cylinderNumbers.length > 1 && (
                        <button type="button" onClick={() => removeCylRow(idx)} className="text-red-400 hover:text-red-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {form.cylinderNumbers.filter(n => n.trim()).length} cylinder(s) specified
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-9">Cancel</Button>
                <Button type="submit" data-testid="transfer-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving..." : "Create Transfer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transfer List */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="transfers-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Transfer No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Gas</th>
                <th className="px-3 py-2">Cylinders</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No transfers yet</td></tr> :
                (data?.data || []).map(t => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{t.transferNumber}</td>
                    <td className="px-3 py-2">{formatDate(t.transferDate)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full bg-orange-100 text-orange-700">
                        {getCompanyLabel(t.sourceCompany)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full bg-purple-100 text-purple-700">
                        {getCompanyLabel(t.destCompany)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{t.gasCode || "-"}</td>
                    <td className="px-3 py-2">{t.cylindersCount || "-"}</td>
                    <td className="px-3 py-2">{t.vehicleNumber || "-"}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate">{t.notes || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white text-xs text-slate-500">
            <span>
              Page {data.page || 1} of {data.totalPages || 1} - Showing {data.data.length} of {data.total} transfers
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={(data.page || 1) <= 1}>
                Prev
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPage((p) => p + 1)} disabled={(data.page || 1) >= (data.totalPages || 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
