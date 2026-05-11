export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR",
  ACCOUNTANT: "ACCOUNTANT",
  VIEWER: "VIEWER",
};

export const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  OPERATOR: "Operator",
  ACCOUNTANT: "Accountant",
  VIEWER: "Viewer",
};

export const ROLE_GROUPS = {
  all: [ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATOR, ROLES.ACCOUNTANT, ROLES.VIEWER],
  adminOnly: [ROLES.ADMIN],
  management: [ROLES.ADMIN, ROLES.MANAGER],
  operations: [ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATOR],
  operationsRead: [ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATOR, ROLES.VIEWER],
  accounting: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  masterWrite: [ROLES.ADMIN, ROLES.MANAGER],
  customerRead: [ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATOR, ROLES.ACCOUNTANT, ROLES.VIEWER],
};

export const ROUTE_ACCESS = [
  { path: "/users", roles: ROLE_GROUPS.adminOnly },
  { path: "/settings", roles: ROLE_GROUPS.adminOnly },
  { path: "/operations", roles: ROLE_GROUPS.operations },
  { path: "/transactions", roles: ROLE_GROUPS.operations },
  { path: "/ecr", roles: ROLE_GROUPS.operations },
  { path: "/challans", roles: ROLE_GROUPS.operations },
  { path: "/transfers", roles: ROLE_GROUPS.management },
  { path: "/orders", roles: ROLE_GROUPS.operations },
  { path: "/accounting", roles: ROLE_GROUPS.accounting },
  { path: "/ledger", roles: ROLE_GROUPS.accounting },
  { path: "/cash-vouchers", roles: ROLE_GROUPS.accounting },
  { path: "/bank-vouchers", roles: ROLE_GROUPS.accounting },
  { path: "/payment-receipts", roles: ROLE_GROUPS.accounting },
  { path: "/debit-note", roles: ROLE_GROUPS.accounting },
  { path: "/credit-note", roles: ROLE_GROUPS.accounting },
  { path: "/reports/accounting", roles: ROLE_GROUPS.accounting },
  { path: "/reports/sales", roles: ROLE_GROUPS.accounting },
  { path: "/reports/operations", roles: ROLE_GROUPS.operationsRead },
  { path: "/reports", roles: ROLE_GROUPS.operationsRead },
  { path: "/customers", roles: ROLE_GROUPS.customerRead },
  { path: "/cylinders", roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATOR, ROLES.VIEWER] },
  { path: "/gas-types", roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.VIEWER] },
  { path: "/areas", roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.VIEWER] },
  { path: "/rate-list", roles: ROLE_GROUPS.accounting },
  { path: "/notifications", roles: ROLE_GROUPS.all },
  { path: "/", roles: ROLE_GROUPS.all, exact: true },
];

const SORTED_ROUTE_ACCESS = [...ROUTE_ACCESS].sort((a, b) => b.path.length - a.path.length);

export function hasAnyRole(role, roles = []) {
  return Boolean(role && roles.includes(role));
}

export function canAccessPath(role, pathname = "/") {
  const normalized = pathname === "" ? "/" : pathname;
  const rule = SORTED_ROUTE_ACCESS.find((entry) => {
    if (entry.exact) return normalized === entry.path;
    return normalized === entry.path || normalized.startsWith(`${entry.path}/`);
  });
  return rule ? hasAnyRole(role, rule.roles) : false;
}

export function filterAllowedItems(role, items = []) {
  return items.filter((item) => canAccessPath(role, item.to));
}

export function getDefaultReportPath(role) {
  if (role === ROLES.ACCOUNTANT) return "/reports/accounting";
  return "/reports/operations";
}

export function getDefaultPathForRole() {
  return "/";
}

export function canViewFinancialDashboard(role) {
  return hasAnyRole(role, ROLE_GROUPS.accounting);
}

export function canViewOperationsDashboard(role) {
  return hasAnyRole(role, ROLE_GROUPS.operationsRead);
}
