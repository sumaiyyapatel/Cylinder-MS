import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getFinancialYear, formatDate } from "@/lib/utils-format";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Package, Flame, MapPin, DollarSign, FileText,
  ArrowLeftRight, RotateCcw, Truck, BookOpen, BarChart3, Settings, UserCog,
  ChevronDown, ChevronRight, LogOut, Menu, X
} from "lucide-react";

const navGroups = [
  {
    label: "Main",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Masters",
    items: [
      { to: "/customers", icon: Users, label: "Customers" },
      { to: "/cylinders", icon: Package, label: "Cylinders" },
      { to: "/gas-types", icon: Flame, label: "Gas Types" },
      { to: "/areas", icon: MapPin, label: "Areas" },
      { to: "/rate-list", icon: DollarSign, label: "Rate List" },
      { to: "/orders", icon: FileText, label: "Orders" },
    ],
  },
  {
    label: "Transactions",
    items: [
      { to: "/transactions", icon: ArrowLeftRight, label: "Bill Cum Challan" },
      { to: "/ecr", icon: RotateCcw, label: "ECR (Returns)" },
      { to: "/challans", icon: Truck, label: "Challans" },
      { to: "/ledger", icon: BookOpen, label: "Ledger / Vouchers" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { to: "/accounting/cash-voucher", icon: BookOpen, label: "Cash Voucher" },
      { to: "/accounting/bank-voucher", icon: BookOpen, label: "Bank Voucher" },
      { to: "/accounting/credit-note", icon: BookOpen, label: "Credit Note" },
      { to: "/accounting/debit-note", icon: BookOpen, label: "Debit Note" },
      { to: "/accounting/payment-receipt", icon: BookOpen, label: "Payment Receipt" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/reports", icon: BarChart3, label: "Reports" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/users", icon: UserCog, label: "User Management" },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("[COMPANY NAME]");

  // Fetch unresolved alerts count
  const { data: alertsData } = useQuery({
    queryKey: ["alerts-unresolved"],
    queryFn: () => api.get("/alerts", { params: { resolved: false } }).then(r => r.data),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unresolvedAlertsCount = alertsData?.length || 0;

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      if (Array.isArray(data)) {
        const settingsObj = data.reduce((acc, curr) => {
          acc[curr.key] = curr.value;
          return acc;
        }, {});
        if (settingsObj.company_name) setCompanyName(settingsObj.company_name);
        localStorage.setItem("companySettings", JSON.stringify(data)); // Save as array for compatibility
      } else {
        if (data.company_name) setCompanyName(data.company_name);
        localStorage.setItem("companySettings", JSON.stringify(data));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            GC
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight truncate max-w-[160px]">
              {companyName}
            </div>
            <div className="text-xs text-slate-400">Gas Management</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" data-testid="sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-300"
            >
              {group.label}
              {collapsed[group.label] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {!collapsed[group.label] && (
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    data-testid={`nav-link-${item.label.toLowerCase().replace(/[\s\/()]+/g, "-")}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                        isActive
                          ? "bg-blue-600/20 text-blue-400 font-medium"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.label === "Reports" && unresolvedAlertsCount > 0 && (
                      <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium min-w-[18px] text-center">
                        {unresolvedAlertsCount > 99 ? "99+" : unresolvedAlertsCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-white font-medium truncate">{user?.fullName}</div>
            <div className="text-xs text-slate-400">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-slate-900 z-50 flex flex-col transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:z-40`}
        data-testid="sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Topbar */}
      <header
        className="fixed top-0 right-0 left-0 lg:left-64 h-14 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4 lg:px-6 shadow-sm"
        data-testid="topbar"
      >
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden p-1.5 rounded hover:bg-slate-100"
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="mobile-menu-toggle"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-sm text-slate-500 hidden sm:block">
            FY: <span className="font-medium text-slate-700">{getFinancialYear()}</span>
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            {formatDate(new Date().toISOString())}
          </span>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <span className="text-slate-700 font-medium">{user?.username}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14 lg:pl-64 min-h-screen" data-testid="main-content">
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
