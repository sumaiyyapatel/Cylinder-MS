import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  RotateCcw,
  Settings,
  ShieldAlert,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useAuth } from "@/lib/auth";
import { formatDate, getFinancialYear } from "@/lib/utils-format";
import api from "@/lib/api";

const navGroups = [
  {
    label: "Main",
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Masters",
    items: [
      { to: "/customers", icon: Users, label: "Customers" },
      { to: "/cylinders", icon: Package, label: "Cylinders" },
      { to: "/gas-types", icon: Flame, label: "Gas Types" },
      { to: "/areas", icon: MapPin, label: "Areas" },
      { to: "/rate-list", icon: Wallet, label: "Rate List" },
      { to: "/orders", icon: ClipboardList, label: "Orders" },
    ],
  },
  {
    label: "Transactions",
    items: [
      { to: "/transactions", icon: ArrowLeftRight, label: "Bill Cum Challan" },
      { to: "/ecr", icon: RotateCcw, label: "ECR Returns" },
      { to: "/challans", icon: Truck, label: "Challans" },
      { to: "/transfers", icon: Building2, label: "Transfers" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { to: "/ledger", icon: BookOpen, label: "Ledger" },
      { to: "/accounting/cash-voucher", icon: BookOpen, label: "Cash Voucher" },
      { to: "/accounting/bank-voucher", icon: BookOpen, label: "Bank Voucher" },
      { to: "/accounting/payment-receipt", icon: Wallet, label: "Payment Receipt" },
      { to: "/accounting/debit-note", icon: BookOpen, label: "Debit Note" },
      { to: "/accounting/credit-note", icon: BookOpen, label: "Credit Note" },
    ],
  },
  {
    label: "Insights",
    items: [{ to: "/reports", icon: BarChart3, label: "Reports" }],
  },
  {
    label: "System",
    items: [
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/users", icon: UserCog, label: "Users" },
    ],
  },
];

const mobileTabs = [
  { to: "/transactions", label: "Bills", icon: ArrowLeftRight },
  { to: "/ecr", label: "ECR", icon: RotateCcw },
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function getPageMeta(pathname) {
  for (const group of navGroups) {
    const match = group.items.find((item) => (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)));
    if (match) {
      return {
        title: match.label,
        group: group.label,
        href: match.to,
      };
    }
  }

  return {
    title: "Operations",
    group: "Workspace",
    href: pathname,
  };
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState({
    Masters: false,
    Transactions: false,
    Accounting: true,
    Insights: false,
    System: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("Patel & Company");

  const { data: alertsData } = useQuery({
    queryKey: ["alerts-unresolved"],
    queryFn: () => api.get("/alerts", { params: { resolved: false } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const unresolvedAlertsCount = alertsData?.length || 0;
  const pageMeta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    api
      .get("/settings")
      .then(({ data }) => {
        if (Array.isArray(data)) {
          const settings = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {});
          if (settings.company_name) setCompanyName(settings.company_name);
          localStorage.setItem("companySettings", JSON.stringify(data));
          return;
        }
        if (data.company_name) setCompanyName(data.company_name);
        localStorage.setItem("companySettings", JSON.stringify(data));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const renderNavItem = (item) => {
    const showAlertCount = item.to === "/reports" && unresolvedAlertsCount > 0;

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) =>
          `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
            isActive
              ? "bg-amber-50 text-amber-700 shadow-sm"
              : "text-slate-200 font-semibold hover:bg-slate-900 text-whitehover:text-white"
          }`
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {showAlertCount ? (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unresolvedAlertsCount > 99 ? "99+" : unresolvedAlertsCount}
          </span>
        ) : null}
      </NavLink>
    );
  };

  return (
    <div className="app-shell" data-testid="app-layout">
      <a href="#main-content" className="skip-link">Skip to content</a>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/50 md:hidden" onClick={() => setMobileOpen(false)} />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-800/80 bg-[linear-gradient(180deg,#14263f_0%,#0f1a2c_100%)] text-white shadow-2xl transition-transform duration-200 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-sm font-bold text-slate-950 shadow-lg">
                GC
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{companyName}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Cylinder Control</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Operator</div>
              <div className="mt-1 truncate text-sm font-semibold text-white">{user?.fullName}</div>
              <div className="text-xs text-slate-300">{user?.role}</div>
            </div>
          </div>

          <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-label="Main">
            {navGroups.map((group) => (
              <section key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between px-2 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300 hover:text-white transition-colors"
                >
                  <span>{group.label}</span>
                  {collapsed[group.label] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {!collapsed[group.label] ? (
                  <div className="space-y-1">{group.items.map(renderNavItem)}</div>
                ) : null}
              </section>
            ))}
          </nav>

          <div className="border-t border-white/10 px-4 py-4">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/70 bg-white text-slate-9008 backdrop-blur md:ml-[280px]">
        <div className="mx-auto flex min-h-[72px] max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Live workspace</div>
              <div className="title-font text-xl font-bold text-slate-900">{pageMeta.title}</div>
              <Breadcrumb className="mt-1">
                <BreadcrumbList className="gap-1 text-xs text-slate-500">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <NavLink to="/">Workspace</NavLink>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-slate-400" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs text-slate-500">{pageMeta.group}</BreadcrumbPage>
                  </BreadcrumbItem>
                  {pageMeta.href !== "/" ? (
                    <>
                      <BreadcrumbSeparator className="text-slate-400" />
                      <BreadcrumbItem>
                        <BreadcrumbPage className="text-xs font-medium text-slate-700">{pageMeta.title}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 sm:block">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Financial year</div>
              <div className="text-sm font-semibold text-slate-800">{getFinancialYear()}</div>
            </div>
            <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 lg:block">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Today</div>
              <div className="text-sm font-semibold text-slate-800">{formatDate(new Date().toISOString())}</div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(30,58,95,0.1)] text-sm font-semibold text-[var(--color-steel)]">
                {user?.fullName?.charAt(0) || "U"}
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="truncate text-sm font-semibold text-slate-800">{user?.username}</div>
                <div className="text-xs text-slate-500">{user?.role}</div>
              </div>
              {unresolvedAlertsCount > 0 ? (
                <div className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {unresolvedAlertsCount}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        role="main"
        className="mx-auto max-w-[1680px] px-4 pb-28 pt-6 sm:px-6 md:ml-[280px] md:pb-8"
      >
        <Outlet />
      </main>

      <nav className="bottom-tab-bar" aria-label="Mobile shortcuts">
        <div className="mx-auto flex max-w-xl items-center gap-1">
          {mobileTabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `bottom-tab-item ${isActive ? "bottom-tab-item-active" : ""}`
              }
            >
              <item.icon className="mb-1 h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
