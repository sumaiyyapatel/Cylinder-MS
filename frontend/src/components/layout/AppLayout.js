import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  BellRing,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Flame,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sun,
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
import { filterAllowedItems } from "@/lib/iam";
import { formatDate, getFinancialYear } from "@/lib/utils-format";
import api from "@/lib/api";

const navGroups = [
  {
    label: "Main",
    icon: LayoutDashboard,
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/notifications", icon: BellRing, label: "Notifications", badge: "alerts" },
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/users", icon: UserCog, label: "Users" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { to: "/reports/operations", icon: Truck, label: "Operations Report" },
      { to: "/reports/sales", icon: BarChart3, label: "Sales Report" },
      { to: "/reports/accounting", icon: BookOpen, label: "Accounting Report" },
    ],
  },
  {
    label: "Masters",
    icon: Package,
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
    icon: Truck,
    items: [
      { to: "/transactions", icon: ArrowLeftRight, label: "Bill Cum Challan" },
      { to: "/ecr", icon: RotateCcw, label: "ECR Returns" },
      { to: "/challans", icon: Truck, label: "Challans" },
      { to: "/transfers", icon: Building2, label: "Transfers" },
    ],
  },
  {
    label: "Accounting",
    icon: Landmark,
    items: [
      { to: "/accounting/ledger", icon: BookOpen, label: "Ledger" },
      { to: "/accounting/cash-voucher", icon: IndianRupee, label: "Cash Voucher" },
      { to: "/accounting/bank-voucher", icon: Landmark, label: "Bank Voucher" },
      { to: "/accounting/payment-receipt", icon: CreditCard, label: "Payment Receipt" },
      { to: "/accounting/debit-note", icon: FileText, label: "Debit Note" },
      { to: "/accounting/credit-note", icon: Wallet, label: "Credit Note" },
    ],
  },
];

const mobileTabs = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/transactions", label: "Bills", icon: ArrowLeftRight },
  { to: "/ecr", label: "ECR", icon: RotateCcw },
  { to: "/reports/operations", label: "Reports", icon: BarChart3 },
  { to: "/accounting/payment-receipt", label: "Pay", icon: CreditCard },
  { to: "/reports/accounting", label: "Reports", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

const standalonePageMeta = [
  { path: "/operations", title: "Dispatch workflow", group: "Workflow" },
];

function getPageMeta(pathname, groups) {
  const standalone = standalonePageMeta.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  if (standalone) {
    return {
      title: standalone.title,
      group: standalone.group,
      href: standalone.path,
    };
  }

  for (const group of groups) {
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
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [companyName, setCompanyName] = useState("Patel & Company");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  const { data: alertsData } = useQuery({
    queryKey: ["alerts-unresolved"],
    queryFn: () => api.get("/alerts", { params: { resolved: false } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const unresolvedAlertsCount = alertsData?.length || 0;
  const visibleNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({ ...group, items: filterAllowedItems(user?.role, group.items) }))
      .filter((group) => group.items.length > 0);
  }, [user?.role]);
  const visibleMobileTabs = useMemo(() => filterAllowedItems(user?.role, mobileTabs).slice(0, 5), [user?.role]);
  const pageMeta = useMemo(() => getPageMeta(location.pathname, visibleNavGroups), [location.pathname, visibleNavGroups]);

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

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const compactSidebar = sidebarCollapsed && !mobileOpen;

  const renderNavItem = (item) => {
    const showAlertCount = item.badge === "alerts" && unresolvedAlertsCount > 0;

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) =>
          `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
            isActive
              ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/25"
              : "font-semibold text-slate-300 hover:bg-white/10 hover:text-white hover:ring-1 hover:ring-white/10"
          } ${compactSidebar ? "justify-center px-2" : ""}`
        }
        title={compactSidebar ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!compactSidebar ? <span className="flex-1 truncate">{item.label}</span> : null}
        {showAlertCount && !compactSidebar ? (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unresolvedAlertsCount > 99 ? "99+" : unresolvedAlertsCount}
          </span>
        ) : null}
        {showAlertCount && compactSidebar ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
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
        className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-800/80 bg-[linear-gradient(180deg,#14263f_0%,#0f1a2c_100%)] text-white shadow-2xl transition-all duration-200 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-[84px]" : "md:w-[280px]"}`}
      >
        <div className="flex h-full flex-col">
          <div className={`border-b border-white/10 ${compactSidebar ? "px-3 py-3" : "px-5 py-4"}`}>
            <div className={`flex items-center ${compactSidebar ? "justify-center" : "gap-3"}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-slate-950 shadow-lg">
                GC
              </div>
              {!compactSidebar ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{companyName}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Cylinder Control</div>
              </div>
              ) : null}
            </div>
            {!compactSidebar ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Signed in</div>
              <div className="mt-1 truncate text-sm font-semibold text-white">{user?.fullName}</div>
              <div className="text-xs text-slate-300">{user?.role}</div>
            </div>
            ) : null}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              className={`mt-3 hidden h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white md:flex ${sidebarCollapsed ? "w-full" : "w-full gap-2 text-sm"}`}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!compactSidebar ? <span>Collapse</span> : null}
            </button>
          </div>

          <nav className={`flex-1 overflow-y-auto py-3 ${compactSidebar ? "space-y-2 px-2" : "space-y-2 px-3"}`} aria-label="Main">
            {visibleNavGroups.map((group) => (
              <section key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${compactSidebar ? "justify-center px-1" : ""}`}
                  title={compactSidebar ? group.label : undefined}
                >
                  {!compactSidebar ? (
                    <span>{group.label}</span>
                  ) : (
                    <group.icon className="h-3.5 w-3.5" />
                  )}
                  {!compactSidebar ? (collapsed[group.label] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : null}
                </button>
                {(!collapsed[group.label] || compactSidebar) ? (
                  <div className="space-y-1">{group.items.map(renderNavItem)}</div>
                ) : null}
              </section>
            ))}
          </nav>

          <div className={`border-t border-white/10 ${compactSidebar ? "px-2 py-3" : "px-4 py-3"}`}>
            <div className={`flex gap-2 ${compactSidebar ? "flex-col" : ""}`}>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
                title={compactSidebar ? "Logout" : undefined}
              >
                <LogOut className="h-4 w-4" />
                {!compactSidebar ? "Logout" : null}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <header className={`sticky top-0 z-30 border-b border-white/70 bg-white text-slate-900 backdrop-blur transition-all duration-200 ${sidebarCollapsed ? "md:ml-[84px]" : "md:ml-[280px]"}`}>
        <div className="mx-auto flex min-h-[58px] max-w-[1680px] items-center justify-between gap-4 px-4 py-2 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Live workspace</div>
              <div className="title-font text-lg font-bold text-slate-900">{pageMeta.title}</div>
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
            <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 sm:block">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Financial year</div>
              <div className="text-sm font-semibold text-slate-800">{getFinancialYear()}</div>
            </div>
            <div className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 lg:block">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Today</div>
              <div className="text-sm font-semibold text-slate-800">{formatDate(new Date().toISOString())}</div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(30,58,95,0.1)] text-sm font-semibold text-[var(--color-steel)]">
                {user?.fullName?.charAt(0) || "U"}
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="truncate text-sm font-semibold text-slate-800">{user?.username}</div>
                <div className="text-xs text-slate-500">{user?.role}</div>
              </div>
              {unresolvedAlertsCount > 0 ? (
                <NavLink
                  to="/notifications"
                  className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                  title="Active notifications"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {unresolvedAlertsCount}
                </NavLink>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        role="main"
        className={`mx-auto max-w-[1680px] px-3 pb-24 pt-4 transition-all duration-200 sm:px-5 md:pb-6 ${sidebarCollapsed ? "md:ml-[84px]" : "md:ml-[280px]"}`}
      >
        <Outlet />
      </main>

      <nav className="bottom-tab-bar" aria-label="Mobile shortcuts">
        <div className="mx-auto flex max-w-xl items-center gap-1">
          {visibleMobileTabs.map((item) => (
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
