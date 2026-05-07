import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, History, Package, ReceiptText, Wallet } from "lucide-react";
import api from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils-format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux/workflow";

const tabs = ["transactions", "holdings", "bills", "payments", "ledger", "route history"];

function SummaryCard({ label, value, hint, danger }) {
  return (
    <div className={`rounded-lg border border-border bg-card px-4 py-3 shadow-sm ${danger ? "border-t-2 border-t-red-400" : ""}`}>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-bold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function SimpleTable({ columns, rows, empty }) {
  if (!rows.length) return <EmptyState title={empty} description="Nothing to show for this tab." />;
  return (
    <div className="data-table-shell">
      <div className="data-table-wrap">
        <table className="data-table text-left">
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || `${row.voucherNumber || row.billNumber || row.cylinder?.cylinderNumber || index}`}>
                {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CustomerCommandPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("transactions");
  const { data, isLoading } = useQuery({
    queryKey: ["customer-command", id],
    queryFn: () => api.get(`/customers/${id}/command`).then((response) => response.data),
    enabled: !!id,
  });

  const customer = data?.customer;
  const summary = data?.summary || {};

  const tabContent = useMemo(() => {
    if (!data) return null;
    if (activeTab === "transactions") {
      return <SimpleTable empty="No transactions" rows={data.transactions || []} columns={[
        { key: "date", label: "Date", render: (row) => formatDate(row.billDate) },
        { key: "bill", label: "Bill", render: (row) => <span className="font-mono text-xs font-semibold">{row.billNumber}</span> },
        { key: "cylinder", label: "Cylinder", render: (row) => row.cylinderNumber || "-" },
        { key: "gas", label: "Gas", render: (row) => row.gasCode || "-" },
        { key: "qty", label: "Qty", render: (row) => row.quantityCum || "-" },
      ]} />;
    }
    if (activeTab === "holdings") {
      return <SimpleTable empty="No active holdings" rows={data.holdings || []} columns={[
        { key: "cyl", label: "Cylinder", render: (row) => <Link className="font-mono text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300" to={`/cylinders/${row.cylinder?.id}/timeline`}>{row.cylinder?.cylinderNumber || "-"}</Link> },
        { key: "issued", label: "Issued", render: (row) => formatDate(row.issuedAt) },
        { key: "days", label: "Days", render: (row) => <span className={row.overdue ? "font-semibold text-red-600" : "font-semibold"}>{row.holdDays}</span> },
        { key: "ref", label: "Ref", render: (row) => row.billNumber || row.challanNumber || "-" },
        { key: "status", label: "Status", render: (row) => row.status },
      ]} />;
    }
    if (activeTab === "bills") {
      return <SimpleTable empty="No bills" rows={data.bills || []} columns={[
        { key: "date", label: "Date", render: (row) => formatDate(row.billDate) },
        { key: "bill", label: "Bill", render: (row) => <span className="font-mono text-xs font-semibold">{row.billNumber}</span> },
        { key: "cyl", label: "Cyl", render: (row) => row.totalCylinders || 0 },
        { key: "qty", label: "Qty", render: (row) => row.totalQuantity || "-" },
        { key: "amount", label: "Amount", render: (row) => formatINR(row.totalAmount) },
      ]} />;
    }
    if (activeTab === "payments") {
      return <SimpleTable empty="No payments" rows={data.payments || []} columns={[
        { key: "date", label: "Date", render: (row) => formatDate(row.voucherDate) },
        { key: "voucher", label: "Voucher", render: (row) => <span className="font-mono text-xs font-semibold">{row.voucherNumber}</span> },
        { key: "mode", label: "Mode", render: (row) => row.paymentMode },
        { key: "amount", label: "Amount", render: (row) => formatINR(row.amount) },
        { key: "ref", label: "Ref", render: (row) => row.reference || "-" },
      ]} />;
    }
    if (activeTab === "ledger") {
      return <SimpleTable empty="No ledger entries" rows={data.ledger || []} columns={[
        { key: "date", label: "Date", render: (row) => formatDate(row.voucherDate) },
        { key: "voucher", label: "Voucher", render: (row) => <span className="font-mono text-xs font-semibold">{row.voucherNumber}</span> },
        { key: "particular", label: "Particular", render: (row) => row.particular || "-" },
        { key: "dr", label: "Dr", render: (row) => row.debitAmount ? formatINR(row.debitAmount) : "-" },
        { key: "cr", label: "Cr", render: (row) => row.creditAmount ? formatINR(row.creditAmount) : "-" },
      ]} />;
    }
    return <SimpleTable empty="No route history" rows={data.routeHistory || []} columns={[
      { key: "date", label: "Captured", render: (row) => formatDate(row.createdAt) },
      { key: "ref", label: "Document", render: (row) => row.bill?.billNumber || row.challan?.challanNumber || "-" },
      { key: "type", label: "Type", render: (row) => row.bill ? "Bill" : "Challan" },
      { key: "points", label: "Points", render: (row) => Array.isArray(row.route) ? row.route.length : "-" },
    ]} />;
  }, [activeTab, data]);

  if (isLoading) return <div className="page-shell text-sm text-muted-foreground">Loading customer command center...</div>;
  if (!data) return <EmptyState title="Customer not found" description="Open a valid customer from the customer list." />;

  const riskClass = summary.riskLevel === "HIGH" ? "bg-red-100 text-red-700" : summary.riskLevel === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";

  return (
    <div className="page-shell" data-testid="customer-command-page">
      <section className="page-header">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="page-eyebrow">Customer command center</div>
            <h1 className="page-title">{customer.code} - {customer.name}</h1>
            <p className="page-subtitle">{customer.city || "No city"} {customer.area?.areaName ? `/ ${customer.area.areaName}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-bold ${riskClass}`}>{summary.riskLevel} RISK</span>
            <Button asChild variant="outline" className="h-10"><Link to="/transactions"><Package className="h-4 w-4" /> Issue</Link></Button>
            <Button asChild variant="outline" className="h-10"><Link to="/ecr"><History className="h-4 w-4" /> Return</Link></Button>
            <Button asChild className="h-10 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)]"><Link to="/accounting/payment-receipt"><CreditCard className="h-4 w-4" /> Receive</Link></Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Outstanding" value={formatINR(summary.outstandingBalance)} danger={summary.outstandingBalance > 0} />
        <SummaryCard label="Held" value={summary.cylindersHeld || 0} hint="active cylinders" />
        <SummaryCard label="Overdue" value={summary.overdueCylinders || 0} danger={summary.overdueCylinders > 0} />
        <SummaryCard label="Rental dues" value={formatINR(summary.rentalDues)} />
        <SummaryCard label="Last payment" value={summary.lastPayment ? formatINR(summary.lastPayment.amount) : "-"} hint={summary.lastPayment ? formatDate(summary.lastPayment.voucherDate) : "none"} />
        <SummaryCard label="Alerts" value={summary.activeAlerts || 0} />
      </section>

      {summary.overdueCylinders > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          This customer has overdue cylinders. Clear returns before dispatching more stock.
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold capitalize transition ${activeTab === tab ? "bg-[var(--color-steel)] text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-3">{tabContent}</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4" /> Outstanding items</div>
          <SimpleTable empty="No unpaid items" rows={data.outstanding || []} columns={[
            { key: "ref", label: "Ref", render: (row) => row.refNumber },
            { key: "type", label: "Type", render: (row) => row.type },
            { key: "owing", label: "Owing", render: (row) => formatINR(row.owing) },
          ]} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ReceiptText className="h-4 w-4" /> Balance</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryCard label="Debit" value={formatINR(data.balance?.totalDebit)} />
            <SummaryCard label="Credit" value={formatINR(data.balance?.totalCredit)} />
            <SummaryCard label="Balance" value={formatINR(data.balance?.balance)} />
          </div>
        </div>
      </section>
    </div>
  );
}
