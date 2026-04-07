import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

const VOUCHER_TYPES = [
  { value: "CASH_RECEIPT", label: "Cash Receipt" },
  { value: "CASH_PAYMENT", label: "Cash Payment" },
  { value: "BANK_RECEIPT", label: "Bank Receipt" },
  { value: "BANK_PAYMENT", label: "Bank Payment" },
  { value: "JOURNAL", label: "Journal Entry" },
  { value: "CONTRA", label: "Contra" },
  { value: "DEBIT_NOTE", label: "Debit Note" },
  { value: "CREDIT_NOTE", label: "Credit Note" },
];

export default function LedgerPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [partyFilter, setPartyFilter] = useState("");
  const [form, setForm] = useState({ voucherDate: new Date().toISOString().split("T")[0], transactionType: "CASH_RECEIPT", partyCode: "", particular: "", narration: "", debitAmount: "", creditAmount: "", chequeNumber: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["ledger", partyFilter],
    queryFn: () => api.get("/ledger", { params: { partyCode: partyFilter || undefined, limit: 100 } }).then(r => r.data),
  });
  const { data: customers } = useQuery({ queryKey: ["customers-list"], queryFn: () => api.get("/customers", { params: { limit: 200 } }).then(r => r.data) });

  const saveMut = useMutation({
    mutationFn: (d) => api.post("/ledger", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Voucher ${res.data.voucherNumber} created`);
      setShowForm(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.debitAmount && !payload.creditAmount) return toast.error("Enter debit or credit amount");
    if (!payload.partyCode) delete payload.partyCode;
    saveMut.mutate(payload);
  };

  const canEdit = hasRole("ADMIN", "MANAGER", "ACCOUNTANT");

  return (
    <div className="space-y-4" data-testid="ledger-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>Ledger / Vouchers</h1>
        {canEdit && (
          <Button data-testid="new-voucher-btn" onClick={() => setShowForm(!showForm)} className="h-9 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> {showForm ? "Cancel" : "New Voucher"}
          </Button>
        )}
      </div>

      {showForm && canEdit && (
        <Card className="border border-slate-200 shadow-sm" data-testid="voucher-entry-form">
          <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: 'var(--font-heading)' }}>Voucher Entry</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Voucher Type *</Label>
                  <Select value={form.transactionType} onValueChange={(v) => setForm({ ...form, transactionType: v })}>
                    <SelectTrigger className="h-9 mt-1" data-testid="voucher-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{VOUCHER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Date</Label>
                  <Input type="date" value={form.voucherDate} onChange={(e) => setForm({ ...form, voucherDate: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Party</Label>
                  <Select value={form.partyCode} onValueChange={(v) => setForm({ ...form, partyCode: v })}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select party" /></SelectTrigger>
                    <SelectContent>{(customers?.data || []).map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Cheque No</Label>
                  <Input value={form.chequeNumber} onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Particular</Label>
                  <Input value={form.particular} onChange={(e) => setForm({ ...form, particular: e.target.value })} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Debit Amount</Label>
                  <Input value={form.debitAmount} onChange={(e) => setForm({ ...form, debitAmount: e.target.value })} type="number" step="0.01" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Credit Amount</Label>
                  <Input value={form.creditAmount} onChange={(e) => setForm({ ...form, creditAmount: e.target.value })} type="number" step="0.01" className="h-9 mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Narration</Label>
                <Textarea value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} rows={2} className="mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-9">Cancel</Button>
                <Button type="submit" data-testid="voucher-save-btn" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>{saveMut.isPending ? "Saving..." : "Save"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={partyFilter} onValueChange={setPartyFilter}>
          <SelectTrigger className="h-9 w-64" data-testid="ledger-party-filter"><SelectValue placeholder="Filter by party" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Parties</SelectItem>
            {(customers?.data || []).map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="ledger-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-3 py-2">Voucher No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Party</th><th className="px-3 py-2">Particular</th>
                <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr> :
                (data?.data || []).length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No entries</td></tr> :
                (data?.data || []).map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{e.voucherNumber}</td>
                    <td className="px-3 py-2">{formatDate(e.voucherDate)}</td>
                    <td className="px-3 py-2 text-xs">{e.transactionType?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">{e.customer?.name || e.partyCode || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{e.particular || "-"}</td>
                    <td className="px-3 py-2 text-right">{e.debitAmount ? formatINR(e.debitAmount) : "-"}</td>
                    <td className="px-3 py-2 text-right">{e.creditAmount ? formatINR(e.creditAmount) : "-"}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatINR(e.runningBalance)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
