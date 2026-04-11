import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreditNotePage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("ADMIN", "MANAGER", "ACCOUNTANT");

  const [form, setForm] = useState({
    voucherDate: new Date().toISOString().split("T")[0],
    partyCode: "",
    amount: "",
    narration: "",
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((r) => r.data),
  });

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/ledger", payload),
    onSuccess: (res) => {
      toast.success(`Voucher ${res.data.voucherNumber} created`);
      setForm({
        voucherDate: new Date().toISOString().split("T")[0],
        partyCode: "",
        amount: "",
        narration: "",
      });
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed to save credit note"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.partyCode) return toast.error("Select party");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter valid amount");

    saveMut.mutate({
      voucherDate: form.voucherDate,
      transactionType: "CREDIT_NOTE",
      partyCode: form.partyCode,
      particular: "Credit note",
      narration: form.narration || undefined,
      debitAmount: null,
      creditAmount: amount,
    });
  };

  if (!canEdit) {
    return <div className="text-sm text-slate-500">You do not have access to voucher entry.</div>;
  }

  return (
    <div className="space-y-4" data-testid="credit-note-page">
      <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-heading)" }}>Credit Note</h1>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)" }}>Credit Note Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm">Date *</Label>
                <Input type="date" value={form.voucherDate} onChange={(e) => setForm({ ...form, voucherDate: e.target.value })} className="h-9 mt-1" required />
              </div>
              <div>
                <Label className="text-sm">Party *</Label>
                <Select value={form.partyCode} onValueChange={(v) => setForm({ ...form, partyCode: v })}>
                  <SelectTrigger className="h-9 mt-1" data-testid="credit-note-party-select"><SelectValue placeholder="Select party" /></SelectTrigger>
                  <SelectContent>
                    {(customers?.data || []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Amount *</Label>
                <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} type="number" step="0.01" min="0" className="h-9 mt-1" required />
              </div>
            </div>

            <div>
              <Label className="text-sm">Narration</Label>
              <Textarea value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} rows={2} className="mt-1" />
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save Credit Note"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
