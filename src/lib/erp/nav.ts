/**
 * SINGLE SOURCE OF TRUTH for ERP backoffice navigation.
 *
 * Both the sidebar (`ErpSidebar`) and the permission catalog
 * (`@/lib/erp/permissions/page-catalog`) are built from this tree, so a page
 * can never exist in the menu but be missing from the access editor.
 */
import {
  LayoutDashboard, Globe, PlusCircle, Boxes, Wallet, Truck, Settings, Users, UserCog, Radio, Fingerprint, Package,
  TrendingDown, TrendingUp, PackagePlus, Megaphone, Container, Heart, Image as ImageIcon, GitBranch, Plug,
  ChevronsLeft, ChevronRight, Sparkles, ClipboardList, ClipboardCheck, PackageSearch,
  Activity, BarChart3, RotateCcw, FileSpreadsheet, Zap, Briefcase, Stethoscope, ChevronDown,
  Star, Filter, X, Receipt, BookOpen, Landmark, Coins, ArrowDownCircle, ArrowUpCircle, HandCoins, Scale,
  FileBarChart, Target, Banknote, Building2, Search, PackageCheck, ShieldCheck, CheckCircle2, Clock, LayoutGrid,
  CalendarClock,
  BellRing,
  Compass,
  ListChecks,
  Lightbulb,
  Clapperboard,
  Repeat,
  Swords,
  Chrome,
  CalendarCheck,
  Palmtree,
  Trophy,
  Settings2,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; search?: Record<string, string> };
export type FlatGroup = { kind: "flat"; label: string; items: NavItem[] };
export type AccordionGroup = { kind: "accordion"; label: string; sections: { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[] }[]; defaultClosed?: boolean };
export type Group = FlatGroup | AccordionGroup;

export const NAV_GROUPS: Group[] = [
  {
    kind: "flat",
    label: "Overview",
    items: [
      { to: "/erp", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    kind: "accordion",
    label: "Sales",
    sections: [
      {
        key: "orders",
        label: "Orders",
        icon: ClipboardList,
        items: [
          { to: "/erp/orders/dashboard", label: "Order Dashboard", icon: LayoutGrid },
          { to: "/erp/orders/web", label: "Web Orders", icon: Globe },
          { to: "/erp/orders/list", label: "Order List", icon: ClipboardList },
          { to: "/erp/orders/pre-orders", label: "Pre-orders", icon: Clock },
          { to: "/erp/orders/new", label: "Create Order", icon: PlusCircle },
        ],
      },
    ],
  },
  {
    kind: "accordion",
    label: "Operations",
    sections: [
      {
        key: "inventory",
        label: "Inventory",
        icon: Boxes,
        items: [
          { to: "/erp/inventory", label: "Products & Stock", icon: Package },
          { to: "/erp/reorder-queue", label: "Reorder Queue", icon: PackageSearch },
          { to: "/erp/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
          { to: "/erp/stocktake", label: "Stocktake", icon: ClipboardCheck },
        ],
      },
      {
        key: "fulfillment",
        label: "Fulfillment",
        icon: Truck,
        items: [
          { to: "/erp/courier", label: "Courier", icon: Truck },
          { to: "/erp/dispatch", label: "Dispatch", icon: PackageCheck },
          { to: "/erp/returns", label: "Returns", icon: RotateCcw },
          { to: "/erp/reconciliation", label: "COD Reconciliation", icon: FileSpreadsheet },
        ],
      },
      {
        key: "reports",
        label: "Reports",
        icon: FileBarChart,
        items: [
          { to: "/erp/reports", label: "Reports Hub", icon: FileBarChart },
        ],
      },
      {
        key: "supply",
        label: "Supply Chain",
        icon: Container,
        items: [
          { to: "/erp/suppliers", label: "Suppliers", icon: Users },
          { to: "/erp/imports", label: "Imports", icon: Container },
          { to: "/erp/sourcing", label: "Sourcing Desk", icon: PackageSearch },
        ],
      },
    ],
  },
  {
    kind: "accordion",
    label: "Money",
    sections: [
      {
        key: "finance",
        label: "Finance",
        icon: Wallet,
        items: [
          { to: "/erp/finance", label: "Overview", icon: LayoutDashboard, exact: true },
          { to: "/erp/finance/accounts", label: "Accounts", icon: BookOpen },
          { to: "/erp/finance/journal", label: "Journal", icon: Receipt, search: { tab: "entries" } },
          { to: "/erp/finance/journal", label: "Quick Entry", icon: Zap, search: { tab: "quick" } },
          { to: "/erp/finance/journal", label: "Recurring", icon: RotateCcw, search: { tab: "recurring" } },
          { to: "/erp/finance/receivables", label: "AR / AP", icon: ArrowDownCircle },
          { to: "/erp/finance/dollar-purchase", label: "Dollar Purchase", icon: Coins },
          { to: "/erp/finance/reports", label: "Reports", icon: FileBarChart },
          { to: "/erp/finance/settings", label: "Settings", icon: Settings },
        ],
      },
    ],
  },
  {
    kind: "accordion",
    label: "Growth",
    sections: [
      {
        key: "growth",
        label: "Growth Studio",
        icon: Compass,
        items: [
          { to: "/erp/growth", label: "Command Center", icon: Compass, exact: true },
          { to: "/erp/growth/goals", label: "Vision & Goals", icon: Target },
          { to: "/erp/growth/tasks", label: "Task Board", icon: ListChecks },
          { to: "/erp/growth/planning", label: "Monthly Projection", icon: BarChart3 },
          { to: "/erp/growth/intake", label: "Content Intake", icon: PackagePlus },
          { to: "/erp/growth/pipeline", label: "Content Pipeline", icon: Clapperboard },
          { to: "/erp/growth/media-plans", label: "Media Buying Hub", icon: Megaphone },
          { to: "/erp/growth/creators", label: "Creator CRM", icon: Users },
          { to: "/erp/growth/products", label: "Product Pipeline", icon: Lightbulb },
          
          { to: "/erp/growth/rivals", label: "Competitors", icon: Swords },
          { to: "/erp/growth/report", label: "Growth Report", icon: BarChart3 },
          { to: "/erp/extension", label: "Synq Extension", icon: Chrome },
        ],
      },
      {
        key: "marketing",
        label: "Marketing",
        icon: Megaphone,
        items: [
          { to: "/erp/marketing", label: "Overview", icon: LayoutDashboard, exact: true },
          { to: "/erp/marketing/campaigns", label: "Campaigns", icon: Target },
          { to: "/erp/marketing/creatives", label: "Creative Library", icon: ImageIcon },
          { to: "/erp/marketing/attribution", label: "Attribution & Funnel", icon: GitBranch },
          { to: "/erp/marketing/products", label: "Product & LTV", icon: PackagePlus },
          { to: "/erp/marketing/planning", label: "Budgets & Calendar", icon: CalendarClock },
          { to: "/erp/marketing/alerts", label: "Alerts & Intelligence", icon: BellRing },
          { to: "/erp/marketing/daily", label: "Daily Performance", icon: BarChart3 },
          { to: "/erp/marketing/channels", label: "Ad Channels", icon: Plug },
          { to: "/erp/marketing/reports", label: "Reports & Exports", icon: FileBarChart },
          { to: "/erp/marketing/settings", label: "Marketing Settings", icon: Settings },
        ],
      },
      {
        key: "crm",
        label: "CRM",
        icon: Heart,
        items: [
          { to: "/erp/crm", label: "Customers", icon: Users },
          { to: "/erp/users", label: "Registered Accounts", icon: Users },
        ],
      },
      {
        key: "analytics",
        label: "Analytics",
        icon: BarChart3,
        items: [
          { to: "/erp/analytics", label: "Analytics", icon: BarChart3, exact: true },
          { to: "/erp/analytics/live", label: "Live Analytics", icon: Activity },
        ],
      },
    ],
  },
  {
    kind: "accordion",
    label: "People",
    defaultClosed: true,
    sections: [
      {
        key: "hr",
        label: "HRM",
        icon: UserCog,
        items: [
          { to: "/erp/hr", label: "HR Overview", icon: LayoutDashboard, exact: true },
          { to: "/erp/hr/live", label: "Live Dashboard", icon: Radio },
          { to: "/erp/hr/my-attendance", label: "My Attendance", icon: Fingerprint },
          { to: "/erp/hr/employees", label: "Employees", icon: Users },
          { to: "/erp/hr/attendance", label: "Attendance", icon: CalendarCheck },
          { to: "/erp/hr/leaves", label: "Leave & Holidays", icon: Palmtree },
          { to: "/erp/hr/payroll", label: "Payroll", icon: Banknote },
          { to: "/erp/hr/performance", label: "Performance & KPI", icon: Trophy },
          { to: "/erp/hr/access", label: "Users & Access", icon: ShieldCheck },
          { to: "/erp/hr/settings", label: "HR Settings", icon: Settings2 },
        ],
      },
    ],
  },
  {
    kind: "accordion",
    label: "System",
    defaultClosed: true,
    sections: [
      {
        key: "system",
        label: "System",
        icon: Settings,
        items: [
          { to: "/erp/settings", label: "Settings", icon: Settings },
          { to: "/erp/diagnostics", label: "Diagnostics", icon: Stethoscope },
          { to: "/erp/deploy-sync", label: "Deploy Sync", icon: Stethoscope },
        ],
      },
    ],
  },
];

/** Flat list of every nav destination, de-duplicated by path. */
export const NAV_PAGES: { path: string; label: string; group: string; section: string }[] = (() => {
  const out: { path: string; label: string; group: string; section: string }[] = [];
  const seen = new Set<string>();
  const push = (path: string, label: string, group: string, section: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, label, group, section });
  };
  for (const g of NAV_GROUPS) {
    if (g.kind === "flat") {
      for (const i of g.items) push(i.to, i.label, g.label, g.label);
    } else {
      for (const s of g.sections) for (const i of s.items) push(i.to, i.label, g.label, s.label);
    }
  }
  return out;
})();
