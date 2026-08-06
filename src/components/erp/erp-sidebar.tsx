import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Globe, PlusCircle, Boxes, Wallet, Truck, Settings, Users, UserCog,
  TrendingDown, TrendingUp, PackagePlus, Megaphone, Container, Heart,
  ChevronsLeft, ChevronRight, Sparkles, ClipboardList, ClipboardCheck, PackageSearch,
  Activity, BarChart3, RotateCcw, FileSpreadsheet, Zap, Briefcase, Stethoscope, ChevronDown,
  Star, Filter, X, Receipt, BookOpen, Landmark, Coins, ArrowDownCircle, ArrowUpCircle, HandCoins, Scale,
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
const FAV_KEY = "erp.sidebar.favs";

export function ErpSidebar() {
  const location = useLocation();
  const { openSearch } = useGlobalSearch();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const { roles, isAdmin } = useCurrentRole();
  const { allowedPages } = useMyAllowedPages();

  const visibleGroups = useMemo<Group[]>(() => {
    const filterItems = (items: NavItem[]) =>
      items.filter((i) => {
        if (isAdmin) return true;
        if (allowedPages && allowedPages.length > 0) {
          return pathAllowedBy(allowedPages, i.to);
        }
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

  const q = filter.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  const searchedGroups = useMemo<Group[]>(() => {
    if (!q) return visibleGroups;
    const out: Group[] = [];
    for (const g of visibleGroups) {
      if (g.kind === "flat") {
        const items = g.items.filter((i) => matches(i.label));
        if (items.length) out.push({ ...g, items });
      } else {
        const sections = g.sections
          .map((s) => ({
            ...s,
            items: matches(s.label) ? s.items : s.items.filter((i) => matches(i.label)),
          }))
          .filter((s) => s.items.length);
        if (sections.length) out.push({ ...g, sections });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups, q]);

  const allItems = useMemo(() => {
    const list: NavItem[] = [];
    for (const g of visibleGroups) {
      if (g.kind === "flat") list.push(...g.items);
      else for (const s of g.sections) list.push(...s.items);
    }
    return list;
  }, [visibleGroups]);

  const favItems = useMemo(
    () => favs.map((k) => allItems.find((i) => favKey(i) === k)).filter(Boolean) as NavItem[],
    [favs, allItems],
  );

  const isActive = (to: string, exact?: boolean, search?: Record<string, string>) => {
    const pathMatch = exact
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(to + "/");
    if (!pathMatch) return false;
    if (search) {
      const cur = location.search as Record<string, unknown>;
      return Object.entries(search).every(([k, v]) => String(cur?.[k] ?? "") === v);
    }
    return true;
  };

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
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (Array.isArray(f)) setFavs(f.filter((x) => typeof x === "string"));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (autoSection) {
      setActiveGroup(autoSection);
      try { localStorage.setItem(ACTIVE_GROUP_KEY, autoSection); } catch { /* ignore */ }
    }
  }, [autoSection]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("erp.sidebar.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // ⌘B / Ctrl+B toggles the rail
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const toggleFav = (item: NavItem) => {
    const key = favKey(item);
    setFavs((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 6);
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const NavLinkItem = ({
    to, label, icon: Icon, exact, search, indented, forceExpanded, pinnable = true,
  }: NavItem & { indented?: boolean; forceExpanded?: boolean; pinnable?: boolean }) => {
    const active = isActive(to, exact, search);
    const mini = collapsed && !forceExpanded;
    const pinned = favs.includes(favKey({ to, label, icon: Icon, search }));
    const content = (
      <div className="relative group/row">
        <Link
          to={to as never}
          search={search as never}
          className={cn(
            "group/link relative flex items-center gap-3 rounded-lg tracking-tight overflow-hidden",
            "transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.98]",
            mini
              ? "justify-center px-2 py-2.5 mx-auto w-10"
              : indented
              ? "pl-8 pr-8 py-1.5 text-[13px] font-medium"
              : "px-3 py-2 pr-8 text-sm font-semibold",
            active
              ? "bg-primary/10 text-foreground font-semibold shadow-[inset_0_1px_0_0_hsl(var(--background)/0.4)]"
              : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary transition-all duration-300 ease-out",
              active ? "opacity-100 h-5" : "opacity-0 h-1.5",
            )}
          />
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-transform duration-200 group-hover/link:scale-110",
              active && "text-primary",
            )}
          />
          {!mini && <span className="truncate">{label}</span>}
        </Link>
        {!mini && pinnable && (
          <button
            type="button"
            aria-label={pinned ? "Unpin" : "Pin"}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav({ to, label, icon: Icon, search }); }}
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md",
              "text-muted-foreground/60 hover:text-primary hover:bg-accent transition-opacity duration-150",
              pinned ? "opacity-100 text-primary" : "opacity-0 group-hover/row:opacity-100",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
          </button>
        )}
      </div>
    );
    if (!mini) return content;
    return (
      <Tooltip delayDuration={80}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const AccordionSection = ({
    sectionKey, label, icon: Icon, items,
  }: { sectionKey: string; label: string; icon: typeof LayoutDashboard; items: NavItem[] }) => {
    const isOpen = q ? true : activeGroup === sectionKey;
    const hasActive = items.some((i) => isActive(i.to, i.exact, i.search));

    if (collapsed) {
      // Icon rail: one icon per section with a hover flyout listing its pages
      return (
        <div className="relative group/fly">
          <button
            type="button"
            onClick={() => { setCollapsed(false); try { localStorage.setItem("erp.sidebar.collapsed", "0"); } catch { /* ignore */ } toggleGroup(sectionKey); }}
            className={cn(
              "relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200",
              hasActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
            )}
            aria-label={label}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary transition-all duration-300",
                hasActive ? "opacity-100 h-5" : "opacity-0 h-1.5",
              )}
            />
            <Icon className="h-4 w-4" />
          </button>
          <div
            className={cn(
              "pointer-events-none absolute left-full top-0 z-50 pl-2 opacity-0 translate-x-1",
              "transition-all duration-200 ease-out group-hover/fly:opacity-100 group-hover/fly:translate-x-0 group-hover/fly:pointer-events-auto",
            )}
          >
            <div className="min-w-[190px] rounded-xl border border-border/70 bg-popover/95 backdrop-blur-xl p-1.5 shadow-xl">
              <div className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">{label}</div>
              <div className="space-y-0.5">
                {items.map((it) => (
                  <NavLinkItem key={favKey(it)} {...it} forceExpanded pinnable={false} />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => toggleGroup(sectionKey)}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold tracking-tight transition-colors duration-200 hover:bg-accent/60",
            hasActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={isOpen}
        >
          <Icon className={cn("h-4 w-4 shrink-0 transition-colors", hasActive && "text-primary")} />
          <span className="truncate flex-1 text-left">{label}</span>
          {!isOpen && hasActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-300 ease-out", isOpen && "rotate-180")} />
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="relative pt-1 space-y-0.5">
              <span aria-hidden className="absolute left-[19px] top-1 bottom-1 w-px bg-border/70" />
              {items.map((it) => <NavLinkItem key={favKey(it)} {...it} indented />)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <aside
        data-collapsed={collapsed}
        className={cn(
          "hidden md:flex flex-col border-r border-border/70 bg-sidebar/95 backdrop-blur-xl h-screen sticky top-0 shrink-0",
          "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed ? "w-[64px]" : "w-60",
        )}
      >
        {/* Brand header */}
        <div className={cn("flex items-center border-b border-border/60 h-14 px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold tracking-tight leading-none truncate">SyncWithUs</div>
                <div className="text-[10px] text-muted-foreground tracking-[0.14em] uppercase mt-1">ERP Suite</div>
              </div>
            </div>
          ) : (
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Collapse (⌘B)</TooltipContent>
            </Tooltip>
          )}
        </div>

        {collapsed && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className="mx-auto mt-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">Expand (⌘B)</TooltipContent>
          </Tooltip>
        )}

        {/* Search / filter */}
        <div className={cn("border-b border-border/60", collapsed ? "px-2 py-2 flex justify-center" : "px-3 py-2.5 space-y-2")}>
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
            <>
              <button
                onClick={openSearch}
                className="w-full flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">Search anything...</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
              </button>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter menu"
                  className="w-full rounded-md border border-border/60 bg-background/40 pl-8 pr-7 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-background"
                />
                {filter && (
                  <button
                    onClick={() => setFilter("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <nav className={cn("erp-sidebar-scroll flex-1 py-3", collapsed ? "px-2 overflow-visible" : "px-3 overflow-y-auto overflow-x-hidden")}>
          {/* Pinned */}
          {!collapsed && !q && favItems.length > 0 && (
            <div className="mb-4">
              <div className="px-3 mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-semibold">
                <Star className="h-3 w-3" /> Pinned
              </div>
              <div className="space-y-0.5">
                {favItems.map((item) => <NavLinkItem key={"fav-" + favKey(item)} {...item} />)}
              </div>
            </div>
          )}

          {searchedGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">কিছু পাওয়া যায়নি</div>
          )}

          {searchedGroups.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && (collapsed ? "mt-3 pt-3 border-t border-border/60" : "mt-4"))}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-semibold">
                  {group.label}
                </div>
              )}
              {group.kind === "flat" ? (
                <div className="space-y-0.5">
                  {group.items.map((item) => <NavLinkItem key={favKey(item)} {...item} />)}
                </div>
              ) : (
                <div className="space-y-1">
                  {group.sections.map((s) => (
                    <AccordionSection key={s.key} sectionKey={s.key} label={s.label} icon={s.icon} items={s.items} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-border/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80", collapsed ? "py-2 text-center" : "px-4 py-3 flex items-center justify-between")}>
          {collapsed ? "v0.1" : (<><span>v0.1 — Phase 0</span><kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[9px] tracking-normal">⌘B</kbd></>)}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function favKey(i: { to: string; label: string; search?: Record<string, string>; icon?: unknown }) {
  return i.to + "|" + (i.search ? JSON.stringify(i.search) : "") + "|" + i.label;
}
