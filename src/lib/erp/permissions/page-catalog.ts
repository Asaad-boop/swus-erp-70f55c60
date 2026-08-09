/**
 * Catalog of every backoffice page that can be individually toggled
 * per user via the "Pages" permission tab.
 *
 * Each entry represents a sidebar destination. Path matching is
 * prefix-based: granting `/erp/orders/web` lets the user open that
 * page and any nested sub-route under it.
 *
 * Admin always bypasses page-level permissions.
 */
export type PageEntry = {
  path: string;
  label: string;
  group: string;
};

export const PAGE_CATALOG: PageEntry[] = [
  { group: "Overview", path: "/erp", label: "Dashboard" },

  { group: "Sales", path: "/erp/orders/web", label: "Web Orders" },
  { group: "Sales", path: "/erp/orders/list", label: "Order List" },
  { group: "Sales", path: "/erp/orders/pre-orders", label: "Pre-orders" },
  { group: "Sales", path: "/erp/orders/new", label: "Create Order" },

  { group: "Reports", path: "/erp/reports", label: "Reports Hub" },

  { group: "Inventory", path: "/erp/inventory", label: "Stock" },
  { group: "Inventory", path: "/erp/reorder-queue", label: "Reorder Queue" },
  { group: "Inventory", path: "/erp/purchase-orders", label: "Purchase Orders" },
  { group: "Inventory", path: "/erp/stocktake", label: "Stocktake" },

  { group: "Fulfillment", path: "/erp/courier", label: "Courier" },
  { group: "Fulfillment", path: "/erp/dispatch", label: "Dispatch" },
  { group: "Fulfillment", path: "/erp/returns", label: "Returns" },
  { group: "Fulfillment", path: "/erp/reconciliation", label: "COD Reconciliation" },

  { group: "Supply Chain", path: "/erp/suppliers", label: "Suppliers" },
  { group: "Supply Chain", path: "/erp/imports", label: "Imports" },

  { group: "Finance", path: "/erp/finance", label: "Overview" },
  { group: "Finance", path: "/erp/finance/accounts", label: "Accounts & Wallets" },
  { group: "Finance", path: "/erp/finance/journal", label: "Journal" },
  { group: "Finance", path: "/erp/finance/receivables", label: "AR / AP" },
  { group: "Finance", path: "/erp/finance/budgets", label: "Budgets" },
  { group: "Finance", path: "/erp/finance/taxes", label: "Taxes" },
  { group: "Finance", path: "/erp/finance/product-profitability", label: "Profitability" },
  { group: "Finance", path: "/erp/finance/reports", label: "Reports" },
  { group: "Finance", path: "/erp/finance/settings", label: "Finance Settings" },

  { group: "Marketing", path: "/erp/marketing", label: "Overview" },

  { group: "CRM", path: "/erp/crm", label: "Customers" },
  { group: "CRM", path: "/erp/users", label: "Registered Accounts" },

  { group: "Analytics", path: "/erp/analytics", label: "Analytics" },
  { group: "Analytics", path: "/erp/analytics/live", label: "Live Analytics" },

  { group: "System", path: "/erp/settings", label: "Settings" },
  { group: "System", path: "/erp/diagnostics", label: "Diagnostics" },
];

export const PAGE_GROUPS = Array.from(new Set(PAGE_CATALOG.map((p) => p.group)));

export const ALL_PAGE_PATHS = PAGE_CATALOG.map((p) => p.path);

/**
 * Returns true if `pathname` is covered by any path in `allowed`.
 * Match = exact OR `pathname` starts with `allowed + "/"`.
 * Always allows the protected layout entry (`/erp` alone) implicit
 * landing — the caller still gates whether the user has any access.
 */
export function pathAllowedBy(allowed: string[] | null | undefined, pathname: string): boolean {
  if (!allowed || allowed.length === 0) return true; // no override = use role defaults
  const effectiveAllowed = allowed.includes("/erp/finance/wallets") && !allowed.includes("/erp/finance/accounts")
    ? [...allowed, "/erp/finance/accounts"]
    : allowed;
  // Sort longest-first to match the most specific entry first.
  for (const a of [...effectiveAllowed].sort((x, y) => y.length - x.length)) {
    if (pathname === a) return true;
    // `/erp` is the dashboard landing only — never treat it as a prefix
    // that grants every `/erp/...` child page.
    if (a === "/erp") continue;
    if (pathname.startsWith(a + "/")) return true;
  }
  // Detail pages: `/erp/orders/<id>` is part of the Orders module —
  // allow it whenever the user has access to any orders sub-page
  // (web / list / new). Same pattern for a few other modules that
  // expose `<list>/<id>` detail routes.
  const detailParents: Array<{ test: RegExp; anyOf: string[] }> = [
    { test: /^\/erp\/orders\/[^/]+$/, anyOf: ["/erp/orders/web", "/erp/orders/list", "/erp/orders/new", "/erp/orders/pre-orders"] },
    { test: /^\/erp\/crm\/[^/]+$/, anyOf: ["/erp/crm"] },
    { test: /^\/erp\/purchase-orders\/[^/]+$/, anyOf: ["/erp/purchase-orders"] },
    { test: /^\/erp\/imports\/orders\/[^/]+$/, anyOf: ["/erp/imports"] },
    { test: /^\/erp\/returns\/[^/]+$/, anyOf: ["/erp/returns"] },
    { test: /^\/erp\/stocktake\/[^/]+$/, anyOf: ["/erp/stocktake"] },
  ];
  for (const d of detailParents) {
    if (d.test.test(pathname) && d.anyOf.some((p) => effectiveAllowed.includes(p))) return true;
  }
  return false;
}