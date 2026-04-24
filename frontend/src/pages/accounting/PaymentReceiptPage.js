import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, CreditCard, FileText, Landmark, ReceiptIndianRupee, Wallet } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  InlineMessage,
  MobileRecordList,
  SummaryPanel,
  WorkflowSection,
} from "@/components/ux/workflow";

const paymentModes = [
  { value: "CASH", label: "Cash", icon: Wallet },
  { value: "CHEQUE", label: "Cheque", icon: Landmark },
  { value: "BANK_TRANSFER", label: "Bank Transfer", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: ReceiptIndianRupee },
];

const createInitialForm = () => ({
  voucherDate: new Date().toISOString().split("T")[0],
  customerId: "",
  outstandingRef: "GENERAL",
  amount: "",
  paymentMode: "CASH",
  reference: "",
  narration: "",
});

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
  const [form, setForm] = useState(createInitialForm);
  const [showOutstanding, setShowOutstanding] = useState(false);

  const customerId = form.customerId ? parseInt(form.customerId, 10) : null;

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((response) => response.data),
  });

  const { data: outstanding = [] } = useQuery({
    queryKey: ["payment-outstanding", customerId],
    queryFn: () => api.get(`/payments/customers/${customerId}/outstanding`).then((response) => response.data),
    enabled: !!customerId,
  });

  const { data: balance } = useQuery({
    queryKey: ["payment-balance", customerId],
    queryFn: () => api.get(`/payments/customers/${customerId}/balance`).then((response) => response.data),
    enabled: !!customerId,
    retry: false,
  });

  const selectedCustomer = useMemo(
    () => (customers?.data || []).find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );

  const selectedOutstanding = useMemo(
    () =>
      outstanding.find(
        (bill) => `${bill.type}:${bill.billId || bill.ecrId}` === form.outstandingRef
      ) || null,
    [outstanding, form.outstandingRef]
  );

  const requiresReference = ["CHEQUE", "BANK_TRANSFER", "UPI"].includes(form.paymentMode);
  const enteredAmount = Number(form.amount || 0);

  const saveMut = useMutation({
    mutationFn: (payload) => api.post("/payments", payload),
    onSuccess: (response) => {
      toast.success(`Receipt ${response.data.voucherNumber} saved`);
      qc.invalidateQueries({ queryKey: ["payment-outstanding"] });
      qc.invalidateQueries({ queryKey: ["payment-balance"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setForm(createInitialForm());
      setShowOutstanding(false);
    },
    onError: (error) => toast.error(error.response?.data?.error || "Failed to save receipt"),
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const amount = parseFloat(form.amount);

    if (!form.customerId) {
      toast.error("Select customer");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter valid amount");
      return;
    }

    if (!form.paymentMode) {
      toast.error("Select payment mode");
      return;
    }

    if (requiresReference && !form.reference.trim()) {
      toast.error("Reference required for non-cash payment");
      return;
    }

    if (selectedOutstanding && amount > Number(selectedOutstanding.owing || 0)) {
      toast.error("Amount is higher than the selected outstanding value");
      return;
    }

    saveMut.mutate({
      customerId: parseInt(form.customerId, 10),
      billId: form.outstandingRef.startsWith("BILL:") ? parseInt(form.outstandingRef.split(":")[1], 10) : null,
      ecrId: form.outstandingRef.startsWith("ECR_RENT:") ? parseInt(form.outstandingRef.split(":")[1], 10) : null,
      amount,
      paymentMode: form.paymentMode,
      reference: form.reference.trim() || undefined,
      narration: form.narration.trim() || undefined,
      voucherDate: form.voucherDate,
    });
  };

  const applyOutstanding = (bill) => {
    setForm((current) => ({
      ...current,
      outstandingRef: `${bill.type}:${bill.billId || bill.ecrId}`,
      amount: String(bill.owing),
      narration: current.narration || `Receipt against ${bill.refNumber}`,
    }));
  };

  if (!canEdit) {
    return <div className="text-sm text-slate-600">You do not have access to payment receipts.</div>;
  }

  const outstandingCount = outstanding.length;

  return (
    <div className="page-shell" data-testid="payment-receipt-page">
      <section className="page-header">
        <div className="page-eyebrow">Accounting</div>
        <h1 className="page-title">Receipt posting now keeps the customer balance in view.</h1>
        <p className="page-subtitle">
          Payment mode selection is faster, outstanding invoices stay one tap away, and the summary catches overpayment before save.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <WorkflowSection
            step="1"
            title="Receipt details"
            description="Choose the customer and date first so the right outstanding list loads."
            icon={FileText}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium text-slate-700">Date *</Label>
                <Input
                  type="date"
                  value={form.voucherDate}
                  onChange={(event) => setForm((current) => ({ ...current, voucherDate: event.target.value }))}
                  className="mt-1 h-11"
                  required
                />
                <div className="mt-2 text-xs text-slate-600">Display format: {formatDate(form.voucherDate)}</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Customer *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...createInitialForm(),
                      voucherDate: current.voucherDate,
                      customerId: value,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1 h-11" data-testid="receipt-customer-select">
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
                {selectedCustomer ? (
                  <InlineMessage tone="info">
                    {selectedCustomer.gstin || "No GSTIN"}
                    {selectedCustomer.phone ? ` • ${selectedCustomer.phone}` : ""}
                  </InlineMessage>
                ) : null}
              </div>
            </div>
          </WorkflowSection>

          <WorkflowSection
            step="2"
            title="Settlement setup"
            description="Pick the payment mode, match it to the right outstanding item, then enter the amount."
            icon={CreditCard}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {paymentModes.map((mode) => {
                const Icon = mode.icon;
                const active = form.paymentMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, paymentMode: mode.value }))}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${active
                        ? "border-[var(--color-accent)] bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                        : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-amber-200 dark:bg-amber-800/50" : "bg-muted"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{mode.label}</div>
                        <div className="text-xs opacity-70">{mode.value.replace("_", " ")}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium text-slate-700">Outstanding Ref</Label>
                <Select
                  value={form.outstandingRef}
                  onValueChange={(value) => setForm((current) => ({ ...current, outstandingRef: value }))}
                  disabled={!customerId}
                >
                  <SelectTrigger className="mt-2 h-10">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">General Receipt</SelectItem>
                    {outstanding.map((bill) => (
                      <SelectItem key={`${bill.type}-${bill.billId || bill.ecrId}`} value={`${bill.type}:${bill.billId || bill.ecrId}`}>
                        {bill.refNumber} - Rs. {formatAmount(bill.owing)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Amount *</Label>
                <Input
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1 h-11"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-slate-700">Reference</Label>
                <Input
                  value={form.reference}
                  onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
                  className="mt-1 h-11"
                  placeholder="Cheque / UPI / bank ref"
                />
                {requiresReference ? (
                  <InlineMessage tone={form.reference.trim() ? "success" : "warning"}>
                    {form.reference.trim() ? "Reference captured for bank trail." : "Reference is required for non-cash payment."}
                  </InlineMessage>
                ) : null}
                {selectedOutstanding && enteredAmount > Number(selectedOutstanding.owing || 0) ? (
                  <InlineMessage tone="danger">Entered amount is above the selected outstanding value.</InlineMessage>
                ) : null}
              </div>
            </div>
          </WorkflowSection>

          <WorkflowSection
            step="3"
            title="Narration and outstanding"
            description="Keep long unpaid lists collapsed until they are needed."
            icon={ReceiptIndianRupee}
            headerRight={
              customerId ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowOutstanding((current) => !current)}>
                  {showOutstanding ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showOutstanding ? "Hide outstanding" : `Show outstanding (${outstandingCount})`}
                </Button>
              ) : null
            }
          >
            <div>
              <Label className="text-sm font-medium text-slate-700">Narration</Label>
              <Textarea
                value={form.narration}
                onChange={(event) => setForm((current) => ({ ...current, narration: event.target.value }))}
                rows={3}
                className="mt-1"
              />
            </div>

            {customerId && showOutstanding ? (
              <div className="mt-5 space-y-4">
                <MobileRecordList
                  items={outstanding}
                  empty={<EmptyState icon={Wallet} title="No unpaid bills" description="This customer has no open bill or rent balance." className="md:hidden" />}
                  renderCard={(bill) => (
                    <Card key={`${bill.type}-${bill.billId || bill.ecrId}`} className="rounded-2xl border border-border bg-card shadow-none md:hidden">
                      <CardContent className="space-y-3 p-4">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{bill.refNumber}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {bill.type === "ECR_RENT" ? bill.description : "Bill outstanding"}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="rounded-2xl bg-muted px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Amount</div>
                            <div className="mt-1 font-semibold text-foreground">{formatAmount(bill.amount)}</div>
                          </div>
                          <div className="rounded-2xl bg-muted px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Paid</div>
                            <div className="mt-1 font-semibold text-foreground">{formatAmount(bill.paid)}</div>
                          </div>
                          <div className="rounded-2xl bg-muted px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Owing</div>
                            <div className="mt-1 font-semibold text-foreground">{formatAmount(bill.owing)}</div>
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => applyOutstanding(bill)}>
                          Use this balance
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                />

                <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
                  {outstanding.length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          <th className="px-4 py-3 text-left">Bill</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3 text-right">Paid</th>
                          <th className="px-4 py-3 text-right">Owing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outstanding.map((bill) => (
                          <tr key={`${bill.type}-${bill.billId || bill.ecrId}`} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{bill.refNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {bill.type === "ECR_RENT" ? bill.description : "Bill outstanding"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">{formatAmount(bill.amount)}</td>
                            <td className="px-4 py-3 text-right">{formatAmount(bill.paid)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                className="font-semibold text-blue-600 hover:underline"
                                onClick={() => applyOutstanding(bill)}
                              >
                                {formatAmount(bill.owing)}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState icon={Wallet} title="No unpaid bills" description="This customer has no open bill or rent balance." className="rounded-none border-0 shadow-none" />
                  )}
                </div>
              </div>
            ) : customerId ? (
              <InlineMessage tone="muted">Outstanding bills stay collapsed by default so the receipt form stays focused.</InlineMessage>
            ) : (
              <InlineMessage tone="muted">Select a customer to load outstanding bills and balance.</InlineMessage>
            )}
          </WorkflowSection>
        </div>

        <div className="space-y-6">
          <SummaryPanel
            title="Receipt summary"
            description="This panel mirrors the ledger intent before posting."
            icon={Wallet}
            tone="amber"
            rows={[
              { label: "Date", value: formatDate(form.voucherDate) },
              { label: "Customer", value: selectedCustomer ? selectedCustomer.code : "Not selected" },
              { label: "Mode", value: paymentModes.find((mode) => mode.value === form.paymentMode)?.label || form.paymentMode },
              { label: "Reference", value: form.reference.trim() || "-" },
              { label: "Amount", value: formatAmount(form.amount), emphasis: true },
              { label: "Against", value: selectedOutstanding?.refNumber || "General Receipt" },
            ]}
            footer={
              <div className="space-y-3">
                <Button
                  type="submit"
                  className="h-11 w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]"
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? "Saving..." : "Save Receipt"}
                </Button>
              </div>
            }
          />

          {customerId ? (
            <SummaryPanel
              title="Customer balance"
              description="Use this before choosing whether to settle a specific bill or post a general receipt."
              icon={CreditCard}
              tone="blue"
              rows={[
                { label: "Total Debit", value: formatAmount(balance?.totalDebit) },
                { label: "Total Credit", value: formatAmount(balance?.totalCredit) },
                { label: "Outstanding Balance", value: formatAmount(balance?.balance), emphasis: true },
              ]}
            />
          ) : (
            <EmptyState
              icon={CreditCard}
              title="Balance preview waits for customer"
              description="Select a customer to load debit, credit, and outstanding balance."
            />
          )}
        </div>
      </form>
    </div>
  );
}
