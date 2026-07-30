import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Globe, PlusCircle, Boxes, Wallet, Truck, Settings, Users, UserCog,
  TrendingDown, TrendingUp, PackagePlus, Megaphone, Container, Heart,
  ChevronsLeft, ChevronRight, Sparkles, ClipboardList, ClipboardCheck, PackageSearch,
  Activity, BarChart3, RotateCcw, FileSpreadsheet, Zap, Briefcase, Stethoscope, ChevronDown,
  Receipt, BookOpen, Landmark, Coins, ArrowDownCircle, ArrowUpCircle, HandCoins, Scale,
  FileBarChart, Target, Banknote, Building2, Search, PackageCheck, ShieldCheck, CheckCircle2, Clock, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "@/components/erp/global-search";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentRole } from "@/hooks/use-current-role";
import { canAccessPath } from "@/lib/erp/access";
import { useMyAllowedPages } from "@/hooks/use-my-allowed-pages";
import { pathAllowedBy } from "@/lib/erp/permissions/page-catalog";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; search?: Record<string, string> };
type FlatGroup = { kind: "flat"; label: string; items: NavItem[] };
type AccordionGroup = { kind: "accordion"; label: string; sections: { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[] }[]; defaultClosed?: boolean };
type Group = FlatGroup | AccordionGroup;

const groups: Group[] = [
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
          { to: "/erp/inventory", label: "Stock", icon: Boxes },
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
        key: "supply",
        label: "Supply Chain",
        icon: Container,
        items: [
          { to: "/erp/suppliers", label: "Suppliers", icon: Users },
          { to: "/erp/imports", label: "Imports", icon: Container },
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
        key: "marketing",
        label: "Marketing",
        icon: Megaphone,
        items: [
          { to: "/erp/marketing", label: "Overview", icon: LayoutDashboard, exact: true },
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
        ],
      },
    ],
  },
];

const ACTIVE_GROUP_KEY = "sidebar_active_group";

export function ErpSidebar() {
  const location = useLocation();
  const { openSearch } = useGlobalSearch();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const { roles, isAdmin } = useCurrentRole();
  const { allowedPages } = useMyAllowedPages();

  const visibleGroups = useMemo<Group[]>(() => {
    const filterItems = (items: NavItem[]) =>
      items.filter((i) => {
        if (isAdmin) return true;
        // Custom allowedPages set → that list is authoritative.
        if (allowedPages && allowedPages.length > 0) {
          return pathAllowedBy(allowedPages, i.to);
        }
        // Otherwise fall back to role-based module matrix.
        return canAccessPath(roles, i.to);
      });
    const out: Group[] = [];
    for (const g of groups) {
      if (g.kind === "flat") {
        const items = filterItems(g.items);
        if (items.length) out.push({ ...g, items });
      } else {
        const sections = g.sections
          .map((s) => ({ ...s, items: filterItems(s.items) }))
          .filter((s) => s.items.length);
        if (sections.length) out.push({ ...g, sections });
      }
    }
    return out;
  }, [roles, isAdmin, allowedPages]);

  const isActive = (to: string, exact?: boolean, search?: Record<string, string>) => {
    const pathMatch = exact
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(to + "/");
    if (!pathMatch) return false;
    if (search) {
      const cur = location.search as Record<string, unknown>;
      return Object.entries(search).every(([k, v]) => String(cur?.[k] ?? "") === v);
    }
    // Sibling links to same path with `search` shouldn't both highlight the plain one.
    // Plain (no search) only active when no `tab` set (or tab matches default behavior of page).
    return true;
  };

  // Compute which accordion section should be auto-opened based on current route
  const autoSection = useMemo(() => {
    for (const g of groups) {
      if (g.kind !== "accordion") continue;
      for (const s of g.sections) {
        if (s.items.some((i) => isActive(i.to, i.exact, i.search))) return s.key;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("erp.sidebar.collapsed") : null;
    if (v === "1") setCollapsed(true);
    const saved = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_GROUP_KEY) : null;
    setActiveGroup(saved ?? null);
  }, []);

  useEffect(() => {
    if (autoSection) {
      setActiveGroup(autoSection);
      try { localStorage.setItem(ACTIVE_GROUP_KEY, autoSection); } catch { /* ignore */ }
    }
  }, [autoSection]);

  const toggleGroup = (key: string) => {
    setActiveGroup((prev) => {
      const next = prev === key ? null : key;
      try {
        if (next) localStorage.setItem(ACTIVE_GROUP_KEY, next);
        else localStorage.removeItem(ACTIVE_GROUP_KEY);
      } catch { /* ignore */ }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("erp.sidebar.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const NavLinkItem = ({ to, label, icon: Icon, exact, search, indented }: NavItem & { indented?: boolean }) => {
    const active = isActive(to, exact, search);
    const content = (
      <Link
        to={to as never}
        search={search as never}
        className={cn(
          "group/link relative flex items-center gap-3 rounded-lg transition-all duration-200 tracking-tight",
          collapsed
            ? "justify-center px-2 py-2.5 mx-auto w-10"
            : indented
            ? "pl-8 pr-3 py-1.5 text-[13px] font-medium"
            : "px-3 py-2 text-sm font-semibold",
          active
            ? "bg-accent text-foreground font-semibold"
            : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary transition-all duration-200",
            active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50",
          )}
        />
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200 group-hover/link:scale-110", active && "text-primary")} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
    if (!collapsed) return content;
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const AccordionSection = ({
    sectionKey, label, icon: Icon, items,
  }: { sectionKey: string; label: string; icon: typeof LayoutDashboard; items: NavItem[] }) => {
    const isOpen = activeGroup === sectionKey;
    const hasActive = items.some((i) => isActive(i.to, i.exact, i.search));
    if (collapsed) {
      // In collapsed mode, render items as flat icons (no accordion header)
      return (
        <div className="space-y-0.5">
          {items.map((it) => <NavLinkItem key={it.to} {...it} />)}
        </div>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleGroup(sectionKey)}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold tracking-tight transition-colors hover:bg-accent/60",
            hasActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={isOpen}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1 text-left">{label}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{ maxHeight: isOpen ? items.length * 36 + 8 : 0 }}
        >
          <div className="pt-1 space-y-0.5">
            {items.map((it) => <NavLinkItem key={it.to} {...it} indented />)}
          </div>
        </div>
      </div>
    );
  };

  const quickLinks: NavItem[] = [
    { to: "/erp/orders/new", label: "New Order", icon: PackagePlus },
  ];

  return (
    <TooltipProvider>
      <aside
        data-collapsed={collapsed}
        className={cn(
          "hidden md:flex flex-col border-r border-border/70 bg-sidebar transition-[width] duration-300 ease-out h-screen sticky top-0 shrink-0",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        {/* Brand header */}
        <div className={cn("flex items-center border-b border-border/60 h-14 px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-md bg-foreground flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-background" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold tracking-tight leading-none truncate">SyncWithUs</div>
                <div className="text-[10px] text-muted-foreground tracking-[0.14em] uppercase mt-1">ERP Suite</div>
              </div>
            </div>
          ) : (
            <div className="h-8 w-8 rounded-md bg-foreground flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-background" />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="mx-auto mt-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Global search trigger */}
        <div className={cn("border-b border-border/60", collapsed ? "px-2 py-2 flex justify-center" : "px-3 py-2.5")}>
          {collapsed ? (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={openSearch}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Search (⌘K)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={openSearch}
              className="w-full flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search anything...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        <nav className={cn("flex-1 py-3 overflow-y-auto overflow-x-hidden", collapsed ? "px-2" : "px-3")}>
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-3 pt-3 border-t border-border/60" : "mt-4"))}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-semibold">
                  {group.label}
                </div>
              )}
              {group.kind === "flat" ? (
                <div className="space-y-0.5">
                  {group.items.map((item) => <NavLinkItem key={item.to} {...item} />)}
                </div>
              ) : (
                <div className="space-y-1">
                  {group.sections.map((s) => (
                    <AccordionSection
                      key={s.key}
                      sectionKey={s.key}
                      label={s.label}
                      icon={s.icon}
                      items={s.items}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

        </nav>

        <div className={cn("border-t border-border/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80", collapsed ? "py-2 text-center" : "px-4 py-3")}>
          {collapsed ? "v0.1" : "v0.1 — Phase 0"}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function QuickActionButton({
  label, icon: Icon, tone, onClick, collapsed,
}: { label: string; icon: typeof LayoutDashboard; tone?: string; onClick: () => void; collapsed: boolean }) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        "group/link w-full flex items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-200",
        collapsed ? "justify-center px-2 py-2.5 mx-auto w-10" : "px-3 py-2",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200 group-hover/link:scale-110", tone)} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
    </Tooltip>
  );
}