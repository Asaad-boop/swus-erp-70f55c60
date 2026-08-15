/**
 * Centralized role → module access control for the ERP backoffice.
 *
 * Single source of truth used by:
 *   - `_authenticated/route.tsx` to gate every URL (including direct URL hits)
 *   - `ErpSidebar` to hide modules the user can't open
 *
 * Admin always wins. Anyone else only gets the modules their roles grant.
 */

export type Module =
  | "dashboard"
  | "orders"
  | "inventory"
  | "fulfillment"
  | "supply"
  | "finance"
  | "marketing"
  | "crm"
  | "analytics"
  | "staff_accounts"
  | "customer_accounts"
  | "hr"
  | "settings"
  | "diagnostics";

export const ROLE_MODULES: Record<string, Module[]> = {
  admin: [
    "dashboard", "orders", "inventory", "fulfillment", "supply",
    "finance", "marketing", "crm", "analytics",
    "staff_accounts", "customer_accounts", "hr", "settings", "diagnostics",
  ],
  operations: [
    "dashboard", "orders", "inventory", "fulfillment",
    "supply", "crm", "analytics",
  ],
  accountant: ["dashboard", "finance", "analytics"],
  warehouse_staff: ["dashboard", "inventory", "fulfillment", "supply"],
  packer: ["dashboard", "fulfillment"],
  customer_service: ["dashboard", "orders", "crm", "customer_accounts"],
  marketing_manager: ["dashboard", "marketing", "analytics"],
  moderator: ["dashboard"],
  customer: [],
};

ROLE_MODULES["hr_admin"] = ["dashboard", "hr"];
ROLE_MODULES["hr_manager"] = ["dashboard", "hr"];

export function getAllowedModules(roles: string[]): Set<Module> {
  const s = new Set<Module>();
  for (const r of roles) {
    const mods = ROLE_MODULES[r];
    if (mods) for (const m of mods) s.add(m);
  }
  return s;
}

/** Path → module. Order matters: more specific patterns first. */
const PATH_RULES: { test: (p: string) => boolean; module: Module }[] = [
  { test: (p) => p === "/erp" || p === "/erp/", module: "dashboard" },
  { test: (p) => p.startsWith("/erp/orders"), module: "orders" },
  {
    test: (p) =>
      p.startsWith("/erp/inventory") ||
      p.startsWith("/erp/reorder-queue") ||
      p.startsWith("/erp/purchase-orders") ||
      p.startsWith("/erp/stocktake"),
    module: "inventory",
  },
  {
    test: (p) =>
      p.startsWith("/erp/courier") ||
      p.startsWith("/erp/dispatch") ||
      p.startsWith("/erp/returns") ||
      p.startsWith("/erp/reconciliation"),
    module: "fulfillment",
  },
  { test: (p) => p.startsWith("/erp/suppliers") || p.startsWith("/erp/imports"), module: "supply" },
  { test: (p) => p.startsWith("/erp/finance"), module: "finance" },
  { test: (p) => p.startsWith("/erp/marketing"), module: "marketing" },
  { test: (p) => p.startsWith("/erp/growth"), module: "marketing" },
  { test: (p) => p.startsWith("/erp/crm"), module: "crm" },
  { test: (p) => p.startsWith("/erp/hr"), module: "hr" },
  { test: (p) => p.startsWith("/erp/analytics"), module: "analytics" },
  { test: (p) => p.startsWith("/erp/users"), module: "customer_accounts" },
  { test: (p) => p.startsWith("/erp/settings"), module: "settings" },
  { test: (p) => p.startsWith("/erp/diagnostics"), module: "diagnostics" },
];

export function moduleForPath(pathname: string): Module | null {
  for (const r of PATH_RULES) if (r.test(pathname)) return r.module;
  return null;
}

/** Returns true if the user can open the given pathname. Admin bypass. */
export function canAccessPath(roles: string[], pathname: string): boolean {
  if (roles.includes("admin")) return true;
  const mod = moduleForPath(pathname);
  if (!mod) return true; // routes outside the matrix aren't restricted by us
  const allowed = getAllowedModules(roles);
  if (allowed.has(mod)) return true;
  // Detail pages: order detail (`/erp/orders/<id>`) is often needed by
  // staff who don't own the full Orders module — packers, warehouse,
  // fulfillment, CS often open an order from Dispatch/Courier/CRM/Returns.
  // Grant detail-view when any operationally adjacent module is allowed.
  const isOrderDetail = /^\/erp\/orders\/[^/]+$/.test(pathname);
  if (isOrderDetail) {
    if (
      allowed.has("fulfillment") ||
      allowed.has("crm") ||
      allowed.has("inventory") ||
      allowed.has("customer_accounts")
    ) {
      return true;
    }
  }
  return false;
}

/** Convenience: does the user have any backoffice (`/erp/*`) module? */
export function hasAnyBackoffice(roles: string[]): boolean {
  if (roles.includes("admin")) return true;
  const allowed = getAllowedModules(roles);
  return allowed.size > 0;
}