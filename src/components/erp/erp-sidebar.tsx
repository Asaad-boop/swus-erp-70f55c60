import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronRight, Search, Star, Filter, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "@/components/erp/global-search";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentRole } from "@/hooks/use-current-role";
import { resolveAccess } from "@/lib/erp/access";
import { NAV_GROUPS as groups, type Group, type NavItem } from "@/lib/erp/nav";
import { useMyAllowedPages } from "@/hooks/use-my-allowed-pages";
import {
  NavLinkRow,
  SectionHeader,
  GroupLabel,
  favKey,
} from "@/components/erp/sidebar/nav-primitives";
import { SidebarUser } from "@/components/erp/sidebar/sidebar-user";

const ACTIVE_GROUP_KEY = "sidebar_active_group";
const FAV_KEY = "erp.sidebar.favs";
const COLLAPSE_KEY = "erp.sidebar.collapsed";

function matchPath(pathname: string, to: string, exact?: boolean) {
  return exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
}

export function ErpSidebar({
  mobile = false,
  onNavigate,
}: { mobile?: boolean; onNavigate?: () => void } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchParams = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const { openSearch } = useGlobalSearch();
  const [collapsed, setCollapsed] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const { roles, isAdmin } = useCurrentRole();
  const { allowedPages, pageMode } = useMyAllowedPages();

  const mini = collapsed && !mobile;

  const isActive = useCallback(
    (item: NavItem) => {
      if (item.activeFor?.some((p) => matchPath(pathname, p))) return true;
      if (!matchPath(pathname, item.to, item.exact)) return false;
      if (item.search) {
        // Inbox "Chats" covers every queue (they're tabs inside the page).
        if ("view" in item.search) return !searchParams?.tab;
        return Object.entries(item.search).every(([k, v]) => String(searchParams?.[k] ?? "") === v);
      }
      return true;
    },
    [pathname, searchParams],
  );

  /* ── permissions ───────────────────────────────────────────── */
  const visibleGroups = useMemo<Group[]>(() => {
    const bypass = isAdmin && pageMode !== "custom";
    const can = (to: string) => bypass || resolveAccess(roles, allowedPages, to, pageMode);
    // Grouped items link to their first permitted route; hidden when none is.
    const keep = (items: NavItem[]) =>
      items.flatMap((i) => {
        if (can(i.to)) return [i];
        const alt = i.activeFor?.find(can);
        return alt ? [{ ...i, to: alt }] : [];
      });
    const out: Group[] = [];
    for (const g of groups) {
      if (g.kind === "flat") {
        const items = keep(g.items);
        if (items.length) out.push({ ...g, items });
      } else {
        const sections = g.sections
          .map((s) => ({ ...s, items: keep(s.items) }))
          .filter((s) => s.items.length);
        if (sections.length) out.push({ ...g, sections });
      }
    }
    return out;
  }, [roles, isAdmin, allowedPages, pageMode]);

  /* ── menu filter ───────────────────────────────────────────── */
  const q = filter.trim().toLowerCase();
  const searchedGroups = useMemo<Group[]>(() => {
    if (!q) return visibleGroups;
    const hit = (label: string) => label.toLowerCase().includes(q);
    const out: Group[] = [];
    for (const g of visibleGroups) {
      if (g.kind === "flat") {
        const items = g.items.filter((i) => hit(i.label));
        if (items.length) out.push({ ...g, items });
      } else {
        const sections = g.sections
          .map((s) => ({
            ...s,
            items: hit(s.label) ? s.items : s.items.filter((i) => hit(i.label)),
          }))
          .filter((s) => s.items.length);
        if (sections.length) out.push({ ...g, sections });
      }
    }
    return out;
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

  /* ── auto-expand the section owning the current route ──────── */
  const autoSection = useMemo(() => {
    for (const g of groups) {
      if (g.kind !== "accordion") continue;
      for (const s of g.sections) if (s.items.some((i) => isActive(i))) return s.key;
    }
    return null;
  }, [isActive]);

  /* ── persisted prefs ───────────────────────────────────────── */
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
      setActiveGroup(localStorage.getItem(ACTIVE_GROUP_KEY));
      const f = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (Array.isArray(f)) setFavs(f.filter((x) => typeof x === "string"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!autoSection) return;
    setActiveGroup(autoSection);
    try {
      localStorage.setItem(ACTIVE_GROUP_KEY, autoSection);
    } catch {
      /* ignore */
    }
  }, [autoSection]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const toggleGroup = useCallback((key: string) => {
    setActiveGroup((prev) => {
      const next = prev === key ? null : key;
      try {
        if (next) localStorage.setItem(ACTIVE_GROUP_KEY, next);
        else localStorage.removeItem(ACTIVE_GROUP_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const togglePin = useCallback((item: NavItem) => {
    const key = favKey(item);
    setFavs((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 6);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const expandRail = useCallback(
    (key: string) => {
      setCollapsed(false);
      try {
        localStorage.setItem(COLLAPSE_KEY, "0");
      } catch {
        /* ignore */
      }
      toggleGroup(key);
    },
    [toggleGroup],
  );

  const renderRow = (
    item: NavItem,
    opts?: { indented?: boolean; pinnable?: boolean; expanded?: boolean },
  ) => (
    <NavLinkRow
      key={favKey(item)}
      item={item}
      active={isActive(item)}
      mini={mini && !opts?.indented && !opts?.expanded}
      indented={opts?.indented}
      pinned={favs.includes(favKey(item))}
      onPin={opts?.pinnable === false ? undefined : togglePin}
      onNavigate={onNavigate}
    />
  );

  return (
    <TooltipProvider>
      <aside
        data-collapsed={mini}
        className={cn(
          "erp-sidebar sticky top-0 h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
          mobile ? "flex w-full border-r-0" : "hidden md:flex",
          "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          mobile ? "" : mini ? "w-[60px]" : "w-[240px]",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "group/head flex h-14 shrink-0 items-center px-3",
            mini ? "justify-center" : "justify-between gap-2",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 shadow-sm ring-1 ring-inset ring-white/15">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            {!mini && (
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[14px] font-semibold tracking-[-0.01em]">
                  SyncWithUs
                </div>
                <div className="text-[11px] text-sidebar-foreground/45">ERP</div>
              </div>
            )}
          </div>
          {!mini && !mobile && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  aria-label="Collapse sidebar"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 outline-none transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/head:opacity-100"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse (⌘B)</TooltipContent>
            </Tooltip>
          )}
        </div>

        {mini && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                className="mx-auto mt-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand (⌘B)</TooltipContent>
          </Tooltip>
        )}

        {/* Search */}
        <div className={cn("shrink-0", mini ? "flex justify-center px-2 py-2" : "px-3 pb-2")}>
          {mini ? (
            <Tooltip delayDuration={60}>
              <TooltipTrigger asChild>
                <button
                  onClick={openSearch}
                  aria-label="Search"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (⌘K)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={openSearch}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 text-[12.5px] text-sidebar-foreground/50 shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none transition-colors hover:border-sidebar-foreground/15 hover:text-sidebar-foreground/80 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="hidden rounded border border-sidebar-border bg-sidebar px-1 font-sans text-[10px] text-sidebar-foreground/50 sm:inline-flex">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "erp-sidebar-scroll flex-1 pb-3 pt-1",
            mini ? "overflow-visible px-2" : "overflow-y-auto overflow-x-hidden px-2.5",
          )}
        >
          {!mini && !q && favItems.length > 0 && (
            <div className="mb-4">
              <GroupLabel>
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-3 w-3" /> Pinned
                </span>
              </GroupLabel>
              <div className="space-y-0.5">{favItems.map((i) => renderRow(i))}</div>
            </div>
          )}

          {searchedGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              কিছু পাওয়া যায়নি
            </div>
          )}

          {searchedGroups.map((group, gi) => (
            <div
              key={group.label}
              className={cn(gi > 0 && (mini ? "mt-3 border-t border-sidebar-border pt-3" : "mt-5"))}
            >
              {!mini && <GroupLabel>{group.label}</GroupLabel>}
              {group.kind === "flat" ? (
                <div className="space-y-0.5">{group.items.map((i) => renderRow(i))}</div>
              ) : (
                <div className="space-y-0.5">
                  {group.sections.map((s) => {
                    const hasActive = s.items.some((i) => isActive(i));
                    if (mini) {
                      return (
                        <RailSection
                          key={s.key}
                          label={s.label}
                          icon={s.icon}
                          hasActive={hasActive}
                          onClick={() => expandRail(s.key)}
                        >
                          {s.items.map((i) => renderRow(i, { expanded: true, pinnable: false }))}
                        </RailSection>
                      );
                    }
                    const open = q ? true : activeGroup === s.key;
                    return (
                      <div key={s.key}>
                        <SectionHeader
                          label={s.label}
                          icon={s.icon}
                          badge={s.badge}
                          open={open}
                          hasActive={hasActive}
                          onToggle={() => toggleGroup(s.key)}
                        />
                        <div
                          inert={!open}
                          aria-hidden={!open}
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]",
                            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="relative space-y-px pb-1 pt-px">
                              {s.items.map((i) => renderRow(i, { indented: true }))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className={cn("shrink-0 border-t border-sidebar-border", mini ? "p-2" : "p-2")}>
          <SidebarUser collapsed={mini} onNavigate={onNavigate} />
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Collapsed rail entry: icon button + hover flyout with the section's pages. */
function RailSection({
  label,
  icon: Icon,
  hasActive,
  onClick,
  children,
}: {
  label: string;
  icon: NavItem["icon"];
  hasActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/fly relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          hasActive
            ? "bg-sidebar-accent text-primary"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-primary",
            hasActive ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon className="h-4 w-4" />
      </button>
      <div className="invisible pointer-events-none absolute left-full top-0 z-50 pl-2 opacity-0 transition-opacity duration-150 group-hover/fly:visible group-hover/fly:pointer-events-auto group-hover/fly:opacity-100 group-focus-within/fly:visible group-focus-within/fly:pointer-events-auto group-focus-within/fly:opacity-100">
        <div className="min-w-[196px] rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            {label}
          </div>
          <div className="space-y-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
