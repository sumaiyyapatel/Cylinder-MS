import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CylindersPage from "@/pages/CylindersPage";
import GasTypesPage from "@/pages/GasTypesPage";
import AreasPage from "@/pages/AreasPage";
import RateListPage from "@/pages/RateListPage";
import OrdersPage from "@/pages/OrdersPage";
import TransactionsPage from "@/pages/TransactionsPage";
import EcrPage from "@/pages/EcrPage";
import ChallansPage from "@/pages/ChallansPage";
import LedgerPage from "@/pages/LedgerPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import UsersPage from "@/pages/UsersPage";
import AppLayout from "@/components/AppLayout";

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
