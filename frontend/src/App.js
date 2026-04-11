import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import CustomersPage from "@/pages/masters/CustomersPage";
import CylindersPage from "@/pages/masters/CylindersPage";
import GasTypesPage from "@/pages/masters/GasTypesPage";
import AreasPage from "@/pages/masters/AreasPage";
import RateListPage from "@/pages/masters/RateListPage";
import OrdersPage from "@/pages/masters/OrdersPage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";
import EcrPage from "@/pages/transactions/EcrPage";
import ChallansPage from "@/pages/transactions/ChallansPage";
import LedgerPage from "@/pages/accounting/LedgerPage";
import CashVoucherPage from "@/pages/accounting/CashVoucherPage";
import BankVoucherPage from "@/pages/accounting/BankVoucherPage";
import PaymentReceiptPage from "@/pages/accounting/PaymentReceiptPage";
import DebitNotePage from "@/pages/accounting/DebitNotePage";
import CreditNotePage from "@/pages/accounting/CreditNotePage";
import ReportsPage from "@/pages/reports/ReportsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import UsersPage from "@/pages/settings/UsersPage";
import AppLayout from "@/components/layout/AppLayout";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="cylinders" element={<CylindersPage />} />
        <Route path="gas-types" element={<GasTypesPage />} />
        <Route path="areas" element={<AreasPage />} />
        <Route path="rate-list" element={<RateListPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="ecr" element={<EcrPage />} />
        <Route path="challans" element={<ChallansPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="cash-vouchers" element={<CashVoucherPage />} />
        <Route path="bank-vouchers" element={<BankVoucherPage />} />
        <Route path="payment-receipts" element={<PaymentReceiptPage />} />
        <Route path="debit-note" element={<DebitNotePage />} />
        <Route path="credit-note" element={<CreditNotePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
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
