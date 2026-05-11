import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { canAccessPath, getDefaultPathForRole, getDefaultReportPath } from "@/lib/iam";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import OperationsConsolePage from "@/pages/operations/OperationsConsolePage";
import CustomersPage from "@/pages/masters/CustomersPage";
import CustomerCommandPage from "@/pages/customers/CustomerCommandPage";
import CylindersPage from "@/pages/masters/CylindersPage";
import CylinderTimelinePage from "@/pages/cylinders/CylinderTimelinePage";
import GasTypesPage from "@/pages/masters/GasTypesPage";
import AreasPage from "@/pages/masters/AreasPage";
import RateListPage from "@/pages/masters/RateListPage";
import OrdersPage from "@/pages/masters/OrdersPage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";
import EcrPage from "@/pages/transactions/EcrPage";
import ChallansPage from "@/pages/transactions/ChallansPage";
import TransfersPage from "@/pages/transactions/TransfersPage";
import LedgerPage from "@/pages/accounting/LedgerPage";
import CashVoucherPage from "@/pages/accounting/CashVoucherPage";
import BankVoucherPage from "@/pages/accounting/BankVoucherPage";
import PaymentReceiptPage from "@/pages/accounting/PaymentReceiptPage";
import DebitNotePage from "@/pages/accounting/DebitNotePage";
import CreditNotePage from "@/pages/accounting/CreditNotePage";
import ReportsPage from "@/pages/reports/ReportsPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import UsersPage from "@/pages/settings/UsersPage";
import AppLayout from "@/components/layout/AppLayout";

function AccessDenied() {
  return (
    <div className="page-shell">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="page-eyebrow">Access control</div>
        <h1 className="mt-2 text-2xl font-bold text-foreground">This role cannot open that page.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The workspace now only shows modules that match the signed-in user role.
        </p>
        <Link className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" to="/">
          Open dashboard
        </Link>
      </section>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#14263f_0%,#1e3a5f_45%,#0f172a_100%)]">
        <div className="rounded-lg border border-white/10 bg-white/10 px-8 py-7 text-center text-white backdrop-blur">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-amber-400" />
          <div className="mt-3 text-sm font-medium text-slate-100">Loading workspace...</div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessPath(user.role, location.pathname)) return <AccessDenied />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#14263f_0%,#1e3a5f_45%,#0f172a_100%)]">
        <div className="rounded-lg border border-white/10 bg-white/10 px-8 py-7 text-center text-white backdrop-blur">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-amber-400" />
          <div className="mt-3 text-sm font-medium text-slate-100">Loading routes...</div>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="operations" element={<OperationsConsolePage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id/command" element={<CustomerCommandPage />} />
        <Route path="cylinders" element={<CylindersPage />} />
        <Route path="cylinders/:id/timeline" element={<CylinderTimelinePage />} />
        <Route path="gas-types" element={<GasTypesPage />} />
        <Route path="areas" element={<AreasPage />} />
        <Route path="rate-list" element={<RateListPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="ecr" element={<EcrPage />} />
        <Route path="challans" element={<ChallansPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="accounting/ledger" element={<LedgerPage />} />
        <Route path="accounting/cash-voucher" element={<CashVoucherPage />} />
        <Route path="accounting/bank-voucher" element={<BankVoucherPage />} />
        <Route path="accounting/payment-receipt" element={<PaymentReceiptPage />} />
        <Route path="accounting/debit-note" element={<DebitNotePage />} />
        <Route path="accounting/credit-note" element={<CreditNotePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<Navigate to={getDefaultReportPath(user?.role)} replace />} />
        <Route path="reports/operations" element={<ReportsPage reportCategory="operations" />} />
        <Route path="reports/sales" element={<ReportsPage reportCategory="sales" />} />
        <Route path="reports/accounting" element={<ReportsPage reportCategory="accounting" />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="ledger" element={<Navigate to="/accounting/ledger" replace />} />
        <Route path="cash-vouchers" element={<Navigate to="/accounting/cash-voucher" replace />} />
        <Route path="bank-vouchers" element={<Navigate to="/accounting/bank-voucher" replace />} />
        <Route path="payment-receipts" element={<Navigate to="/accounting/payment-receipt" replace />} />
        <Route path="debit-note" element={<Navigate to="/accounting/debit-note" replace />} />
        <Route path="credit-note" element={<Navigate to="/accounting/credit-note" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? getDefaultPathForRole(user.role) : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
