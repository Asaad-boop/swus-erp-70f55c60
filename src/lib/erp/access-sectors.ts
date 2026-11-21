/**
 * Sectors — the one thing an admin picks when giving a staff member access.
 *
 * Each sector is backed by exactly one database role, so the data behind
 * every page in the sector actually loads (row-level security follows roles,
 * not page grants). Pages are then narrowed *inside* the chosen sectors:
 * untick a page to hide it. A page can never be granted without the sector
 * that powers it, which is what used to produce empty screens.
 */
import { pagesForRoles } from "@/lib/erp/access";
import { ALL_PAGE_PATHS, PAGE_BY_PATH, PAGE_CATALOG } from "@/lib/erp/permissions/page-catalog";
import type { AppRole } from "@/lib/erp/access-profile.model";

export type SectorKey =
  | "orders"
  | "packing"
  | "warehouse"
  | "operations"
  | "finance"
  | "marketing"
  | "hr"
  | "payroll"
  | "attendance"
  | "admin";

export type Sector = {
  key: SectorKey;
  role: AppRole;
  title: string;
  hint: string;
  /** Tailwind classes for the sector's accent. */
  tone: string;
  /** Strong sectors include others; shown with a caution note. */
  caution?: string;
};

export const SECTORS: Sector[] = [
  {
    key: "orders",
    role: "customer_service",
    title: "অর্ডার ও কাস্টমার",
    hint: "অর্ডার লিস্ট, ওয়েব অর্ডার, অর্ডার তৈরি, Inbox, কাস্টমার (CRM)",
    tone: "border-blue-500/40 bg-blue-500/5 text-blue-700",
  },
  {
    key: "packing",
    role: "packer",
    title: "প্যাকিং স্টেশন",
    hint: "শুধু scan করে Pending → Packing → Packed। আর কিছু না",
    tone: "border-fuchsia-500/40 bg-fuchsia-500/5 text-fuchsia-700",
  },
  {
    key: "warehouse",
    role: "warehouse_staff",
    title: "স্টক ও ওয়্যারহাউস",
    hint: "প্রোডাক্ট ও স্টক, রিঅর্ডার, পারচেজ অর্ডার, স্টকটেক, প্যাকিং",
    tone: "border-amber-500/40 bg-amber-500/5 text-amber-700",
  },
  {
    key: "operations",
    role: "operations",
    title: "অপারেশনস",
    hint: "অর্ডার, স্টক, কুরিয়ার, রিটার্ন, COD হিসাব, সাপ্লাই/ইমপোর্ট, অ্যানালিটিক্স — পুরো অপারেশন",
    tone: "border-cyan-500/40 bg-cyan-500/5 text-cyan-700",
  },
  {
    key: "finance",
    role: "accountant",
    title: "হিসাব (Finance)",
    hint: "অ্যাকাউন্ট, জার্নাল, AR/AP, ডলার কেনা, হিসাবের রিপোর্ট",
    tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700",
  },
  {
    key: "marketing",
    role: "marketing_manager",
    title: "মার্কেটিং",
    hint: "ক্যাম্পেইন, অ্যাড রিপোর্ট, অ্যানালিটিক্স",
    tone: "border-pink-500/40 bg-pink-500/5 text-pink-700",
  },
  {
    key: "hr",
    role: "hr_manager",
    title: "HR",
    hint: "হাজিরা, ছুটি, এমপ্লয়ি, পারফরম্যান্স (বেতন দেওয়া ছাড়া)",
    tone: "border-violet-500/40 bg-violet-500/5 text-violet-700",
  },
  {
    key: "payroll",
    role: "hr_admin",
    title: "HR + বেতন",
    hint: "HR-এর সব কিছু, সাথে payroll বানানো ও বেতন দেওয়া",
    tone: "border-violet-600/40 bg-violet-600/5 text-violet-800",
    caution: "বেতন দেওয়ার ক্ষমতা থাকবে",
  },
  {
    key: "attendance",
    role: "employee",
    title: "শুধু হাজিরা",
    hint: "ড্যাশবোর্ড আর নিজের check-in / check-out",
    tone: "border-slate-400/40 bg-slate-500/5 text-slate-700",
  },
  {
    key: "admin",
    role: "admin",
    title: "ফুল অ্যাডমিন",
    hint: "সব ডেটা, সব পেজ, সেটিংস ও স্টাফ access দেওয়া",
    tone: "border-rose-500/40 bg-rose-500/5 text-rose-700",
    caution: "সব ডেটা দেখতে ও বদলাতে পারবে — শুধু বিশ্বস্ত মানুষকে দিন",
  },
];

export const SECTOR_BY_KEY = Object.fromEntries(SECTORS.map((s) => [s.key, s])) as Record<
  SectorKey,
  Sector
>;
const SECTOR_ROLES = new Set<string>(SECTORS.map((s) => s.role));

/** Sectors implied by a role list (roles without a sector are kept aside). */
export function sectorsFromRoles(roles: string[]): SectorKey[] {
  return SECTORS.filter((s) => roles.includes(s.role)).map((s) => s.key);
}

/** Roles not represented by any sector (owner, moderator…) — preserved on save. */
export function extraRoles(roles: string[]): AppRole[] {
  return roles.filter((r) => !SECTOR_ROLES.has(r) && r !== "customer") as AppRole[];
}

export function rolesFor(sectors: SectorKey[], keep: AppRole[]): AppRole[] {
  return [...new Set([...keep, ...sectors.map((k) => SECTOR_BY_KEY[k].role)])];
}

/** Grantable pages a sector powers (from the role → module matrix). */
export function sectorPages(key: SectorKey): string[] {
  return pagesForRoles([SECTOR_BY_KEY[key].role], ALL_PAGE_PATHS);
}

/** Every page the given roles power, in sidebar order. */
export function pagesPowered(roles: string[]): string[] {
  return pagesForRoles(roles, ALL_PAGE_PATHS);
}

/** Pages that work through a page grant alone (orders data honours page grants). */
export const GRANT_SAFE_PAGES = new Set([
  "/erp/orders/web",
  "/erp/orders/list",
  "/erp/orders/pre-orders",
  "/erp/orders/new",
]);

export type PageGroup = {
  section: string;
  group: string;
  pages: { path: string; label: string }[];
};

/** Group page paths by sidebar section, in sidebar order. */
export function groupPages(paths: string[]): PageGroup[] {
  const want = new Set(paths);
  const out: PageGroup[] = [];
  for (const p of PAGE_CATALOG) {
    if (!want.has(p.path)) continue;
    let g = out.find((x) => x.section === p.section);
    if (!g) {
      g = { section: p.section, group: p.group, pages: [] };
      out.push(g);
    }
    g.pages.push({ path: p.path, label: p.label });
  }
  return out;
}

export function pageLabel(path: string) {
  return PAGE_BY_PATH[path]?.label ?? path;
}
