import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialForm = {
  voucherDate: new Date().toISOString().split("T")[0],
  customerId: "",
  billId: "GENERAL",
  amount: "",
  paymentMode: "CASH",
  reference: "",
  narration: "",
};

function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PaymentReceiptPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole("ADMIN", "MANAGER", "ACCOUNTANT");
  const [form, setForm] = useState(initialForm);

  const customerId = form.customerId ? parseInt(form.customerId, 10) : null;

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((r) => r.data),
  });

  const { data: outstanding = [] } = useQuery({
    queryKey: ["payment-outstanding", customerId],
    queryFn: () => api.get(`/payments/customers/${customerId}/outstanding`).then((r) => r.data),
    enabled: !!customerId,
  });

  const { data: balance } = useQuery({
    queryKey: ["payment-balance", customerId],
    queryFn: () => api.get(`/payments/customers/${customerId}/balance`).then((r) => r.data),
    enabled: !!customerId,
    retry: false,
  });

  const selectedCustomer = useMemo(
    () => (customers?.data || []).find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/payments", payload),
    onSuccess: (res) => {
      toast.success(`Receipt ${res.data.voucherNumber} saved`);
      qc.invalidateQueries({ queryKey: ["payment-outstanding"] });
      qc.invalidateQueries({ queryKey: ["payment-balance"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setForm(initialForm);
    },
    onError: (e) => toast.error(e.response?.data?.error || "Failed to save receipt"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);

    if (!form.customerId) return toast.error("Select customer");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter valid amount");
    if (!form.paymentMode) return toast.error("Select payment mode");
    if (["CHEQUE", "BANK_TRANSFER", "UPI"].includes(form.paymentMode) && !form.reference.trim()) {
      return toast.error("Reference required for non-cash payment");
    }

    saveMut.mutate({
      customerId: parseInt(form.customerId, 10),
      billId: form.billId === "GENERAL" ? null : parseInt(form.billId, 10),
      amount,
      paymentMode: form.paymentMode,
      reference: form.reference.trim() || undefined,
      narration: form.narration.trim() || undefined,
      voucherDate: form.voucherDate,
    });
  };

  const applyOutstanding = (bill) => {
    setForm((prev) => ({
      ...prev,
      billId: String(bill.billId),
      amount: String(bill.owing),
      narration: prev.narration || `Receipt against Bill ${bill.billNumber}`,
    }));
  };

  if (!canEdit) {
    return <div className="text-sm text-slate-500">You do not have access to payment receipts.</div>;
  }

  return (
    <div className="page-shell" data-testid="payment-receipt-page">
      <section className="page-header">
        <div className="page-eyebrow">Accounting</div>
        <h1 className="page-title">Receipt posting with outstanding visibility.</h1>
        <p className="page-subtitle">Choose the customer, see unpaid bills and current balance, then record the receipt against the correct reference.</p>
      </section>

      <Card className="section-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)" }}>
            Receipt Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm">Date *</Label>
                <Input
                  type="date"
                  value={form.voucherDate}
                  onChange={(e) => setForm({ ...form, voucherDate: e.target.value })}
                  className="h-9 mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-sm">Customer *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(value) => setForm({ ...initialForm, voucherDate: form.voucherDate, customerId: value })}
                >
                  <SelectTrigger className="h-9 mt-1" data-testid="receipt-customer-select">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers?.data || []).map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.code} - {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCustomer && (
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedCustomer.gstin || "No GSTIN"} {selectedCustomer.phone ? `- ${selectedCustomer.phone}` : ""}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-sm">Mode *</Label>
                <Select value={form.paymentMode} onValueChange={(value) => setForm({ ...form, paymentMode: value })}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Bill</Label>
                <Select value={form.billId} onValueChange={(value) => setForm({ ...form, billId: value })} disabled={!customerId}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">General Receipt</SelectItem>
                    {outstanding.map((bill) => (
                      <SelectItem key={bill.billId} value={String(bill.billId)}>
                        {bill.billNumber} - Rs. {formatAmount(bill.owing)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Amount *</Label>
                <Input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-9 mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-sm">Reference</Label>
                <Input
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="h-9 mt-1"
                  placeholder="Cheque / UPI / bank ref"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">Narration</Label>
              <Textarea
                value={form.narration}
                onChange={(e) => setForm({ ...form, narration: e.target.value })}
                rows={2}
                className="mt-1"
              />
            </div>

            {customerId && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Outstanding Bills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {outstanding.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-slate-500">
                              <th className="py-2 text-left">Bill</th>
                              <th className="py-2 text-right">Amount</th>
                              <th className="py-2 text-right">Paid</th>
                              <th className="py-2 text-right">Owing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {outstanding.map((bill) => (
                              <tr key={bill.billId} className="border-b border-slate-100">
                                <td className="py-2">{bill.billNumber}</td>
                                <td className="py-2 text-right">{formatAmount(bill.amount)}</td>
                                <td className="py-2 text-right">{formatAmount(bill.paid)}</td>
                                <td className="py-2 text-right">
                                  <button
                                    type="button"
                                    className="text-blue-600 hover:underline"
                                    onClick={() => applyOutstanding(bill)}
                                  >
                                    {formatAmount(bill.owing)}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No unpaid bills.</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Balance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Total Debit</span>
                      <span>{formatAmount(balance?.totalDebit)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total Credit</span>
                      <span>{formatAmount(balance?.totalCredit)}</span>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <span>Outstanding Balance</span>
                      <span>{formatAmount(balance?.balance)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save Receipt"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
