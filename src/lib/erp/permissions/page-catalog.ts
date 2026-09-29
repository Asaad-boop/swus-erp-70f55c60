/**
 * Page-level permission catalog.
 *
 * Derived from `NAV_PAGES` (the sidebar tree) so the access editor can never
 * drift from the real menu, plus `HIDDEN_PAGES` for reachable routes that are
 * not sidebar destinations.
 *
 * Matching rules (see `pathAllowedBy`):
 *  - A grant matches its own path exactly.
 *  - A grant also matches nested sub-routes (`/erp/returns` → `/erp/returns/123`)
 *    UNLESS it is a "section root" (`/erp`, `/erp/finance`, `/erp/marketing`, …).
 *    Section roots are exact-only, otherwise granting "Finance → Overview"
 *    would silently unlock every finance page.
 */
import { NAV_PAGES } from "@/lib/erp/nav";

export type PageEntry = {
  path: string;
  label: string;
  group: string;
  section: string;
  /** Exact-match only — never treat as a prefix. */
  exact?: boolean;
  /** Not shown in the sidebar, but reachable and grantable. */
  hidden?: boolean;
};

/** Landing/overview routes that must never act as a prefix grant. */
export const SECTION_ROOTS = new Set<string>([
  "/erp",
  "/erp/finance",
  "/erp/marketing",
  "/erp/hr",
  "/erp/analytics",
  "/erp/orders",
]);

/** Reachable routes without their own sidebar entry. */
const HIDDEN_PAGES: Omit<PageEntry, "exact">[] = [
  {
    group: "Sales",
    section: "Orders",
    path: "/erp/orders/incomplete-reports",
    label: "Incomplete Order Reports",
    hidden: true,
  },
  {
    group: "Operations",
    section: "Inventory",
    path: "/erp/inventory-reports",
    label: "Inventory Reports",
    hidden: true,
  },
  {
    group: "Money",
    section: "Finance",
    path: "/erp/finance/wallets",
    label: "Wallets",
    hidden: true,
  },
  {
    group: "Money",
    section: "Finance",
    path: "/erp/finance/chart-accounts",
    label: "Chart of Accounts",
    hidden: true,
  },
  {
    group: "Money",
    section: "Finance",
    path: "/erp/finance/budgets",
    label: "Budgets",
    hidden: true,
  },
  { group: "Money", section: "Finance", path: "/erp/finance/taxes", label: "Taxes", hidden: true },
  {
    group: "Money",
    section: "Finance",
    path: "/erp/finance/product-profitability",
    label: "Product Profitability",
    hidden: true,
  },
  {
    group: "Operations",
    section: "Supply Chain",
    path: "/erp/imports/orders",
    label: "Import Orders",
    hidden: true,
  },
  {
    group: "Operations",
    section: "Supply Chain",
    path: "/erp/imports/agents",
    label: "Import Agents",
    hidden: true,
  },
  {
    group: "Operations",
    section: "Supply Chain",
    path: "/erp/imports/reports",
    label: "Import Reports",
    hidden: true,
  },
  {
    group: "Operations",
    section: "Supply Chain",
    path: "/erp/imports/settings",
    label: "Import Settings",
    hidden: true,
  },
  {
    group: "System",
    section: "System",
    path: "/erp/pathao-debug",
    label: "Pathao Debug",
    hidden: true,
  },
];

export const PAGE_CATALOG: PageEntry[] = [
  ...NAV_PAGES.map((p) => ({ ...p, exact: SECTION_ROOTS.has(p.path) })),
  ...HIDDEN_PAGES.map((p) => ({ ...p, exact: SECTION_ROOTS.has(p.path) })),
];

export const PAGE_BY_PATH: Record<string, PageEntry> = Object.fromEntries(
  PAGE_CATALOG.map((p) => [p.path, p]),
);

export const PAGE_GROUPS = Array.from(new Set(PAGE_CATALOG.map((p) => p.group)));

export const ALL_PAGE_PATHS = PAGE_CATALOG.map((p) => p.path);

/** Grants that implicitly unlock another page (shared screens). */
const IMPLIED: Record<string, string[]> = {
  "/erp/finance/accounts": ["/erp/finance/wallets", "/erp/finance/chart-accounts"],
  "/erp/finance/wallets": ["/erp/finance/accounts"],
  "/erp/imports": [
    "/erp/imports/orders",
    "/erp/imports/agents",
    "/erp/imports/reports",
    "/erp/imports/settings",
  ],
};

/** `/erp/x/<id>` detail routes unlocked by any of the listed list-page grants. */
const DETAIL_PARENTS: Array<{ test: RegExp; anyOf: string[] }> = [
  {
    test: /^\/erp\/orders\/[^/]+$/,
    anyOf: [
      "/erp/orders/web",
      "/erp/orders/list",
      "/erp/orders/new",
      "/erp/orders/pre-orders",
      "/erp/orders/dashboard",
    ],
  },
  { test: /^\/erp\/crm\/[^/]+$/, anyOf: ["/erp/crm"] },
  { test: /^\/erp\/purchase-orders\/[^/]+$/, anyOf: ["/erp/purchase-orders"] },
  { test: /^\/erp\/imports\/orders\/[^/]+$/, anyOf: ["/erp/imports", "/erp/imports/orders"] },
  { test: /^\/erp\/returns\/[^/]+$/, anyOf: ["/erp/returns"] },
  { test: /^\/erp\/stocktake\/[^/]+$/, anyOf: ["/erp/stocktake"] },
];

function normalize(p: string): string {
  const clean = (p || "/").split("?")[0].split("#")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

/** Expand a raw grant list with implied pages. */
export function expandGrants(allowed: string[]): string[] {
  const set = new Set(allowed.map(normalize));
  for (const a of [...set]) for (const extra of IMPLIED[a] ?? []) set.add(extra);
  return [...set];
}

/**
 * Returns true if `pathname` is covered by `allowed`.
 * `null` / empty means "no override" — caller falls back to role defaults.
 */
export function pathAllowedBy(allowed: string[] | null | undefined, pathname: string): boolean {
  if (!allowed || allowed.length === 0) return false;
  const path = normalize(pathname);
  const grants = expandGrants(allowed);

  for (const a of [...grants].sort((x, y) => y.length - x.length)) {
    if (path === a) return true;
    const entry = PAGE_BY_PATH[a];
    const exactOnly = entry?.exact ?? SECTION_ROOTS.has(a);
    if (exactOnly) continue;
    if (path.startsWith(a + "/")) return true;
  }

  for (const d of DETAIL_PARENTS) {
    // A named catalog page (e.g. `/erp/orders/dashboard`) is never a detail
    // route — it must be granted explicitly.
    if (PAGE_BY_PATH[path]) break;
    if (d.test.test(path) && d.anyOf.some((p) => grants.includes(p))) return true;
  }
  return false;
}

/** First page the user is actually allowed to open — used as landing/fallback. */
export function firstAllowedPage(allowed: string[] | null | undefined): string {
  if (!allowed || allowed.length === 0) return "/erp";
  if (allowed.includes("/erp")) return "/erp";
  const inNavOrder = PAGE_CATALOG.find((p) => !p.hidden && allowed.includes(p.path));
  return inNavOrder?.path ?? allowed[0] ?? "/erp";
}
