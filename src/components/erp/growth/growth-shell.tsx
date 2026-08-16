import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Compass,
  Target,
  ListChecks,
  Repeat,
  BarChart3,
  PackageOpen,
  KanbanSquare,
  Megaphone,
  Users,
  Building2,
  Network,
  Lightbulb,
  PackageSearch,
  Swords,
  LineChart,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type GrowthGroup = "Overview" | "Plan" | "Create" | "People & Market" | "Report";

export type GrowthNavItem = {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  group: GrowthGroup;
  exact?: boolean;
};

export const GROWTH_GROUPS: GrowthGroup[] = [
  "Overview",
  "Plan",
  "Create",
  "People & Market",
  "Report",
];

export const GROWTH_NAV: GrowthNavItem[] = [
  { to: "/erp/growth", label: "Command Center", short: "Center", icon: Compass, group: "Overview", exact: true },

  { to: "/erp/growth/goals", label: "Vision & Goals", short: "Goals", icon: Target, group: "Plan" },
  { to: "/erp/growth/tasks", label: "Task Board", short: "Tasks", icon: ListChecks, group: "Plan" },
  { to: "/erp/growth/routines", label: "Routines & Calendar", short: "Routines", icon: Repeat, group: "Plan" },
  { to: "/erp/growth/planning", label: "Monthly Projection", short: "Projection", icon: BarChart3, group: "Plan" },

  { to: "/erp/growth/intake", label: "Content Intake", short: "Intake", icon: PackageOpen, group: "Create" },
  { to: "/erp/growth/pipeline", label: "Content Pipeline", short: "Pipeline", icon: KanbanSquare, group: "Create" },
  { to: "/erp/growth/media-plans", label: "Media Buying Hub", short: "Media", icon: Megaphone, group: "Create" },

  { to: "/erp/growth/creators", label: "Creator CRM", short: "Creators", icon: Users, group: "People & Market" },
  { to: "/erp/growth/agencies", label: "Agency Partners", short: "Agencies", icon: Building2, group: "People & Market" },
  { to: "/erp/growth/matching", label: "Product ↔ Creator", short: "Matching", icon: Network, group: "People & Market" },
  { to: "/erp/growth/products", label: "Product Pipeline", short: "Products", icon: Lightbulb, group: "People & Market" },
  { to: "/erp/growth/rivals", label: "Competitors", short: "Rivals", icon: Swords, group: "People & Market" },

  { to: "/erp/growth/report", label: "Growth Report", short: "Report", icon: LineChart, group: "Report" },
];

function isOn(pathname: string, it: GrowthNavItem) {
  return it.exact ? pathname === it.to || pathname === `${it.to}/` : pathname.startsWith(it.to);
}

/** Sticky grouped sub-navigation shared by every Growth Studio page. */
export function GrowthSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = activeRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [pathname]);

  const activeItem = [...GROWTH_NAV].reverse().find((it) => isOn(pathname, it)) ?? GROWTH_NAV[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      {/* Desktop: grouped chips */}
      <div
        ref={scroller}
        className="mx-auto hidden max-w-[1500px] items-center gap-1 overflow-x-auto px-3 py-2 md:flex md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GROWTH_GROUPS.map((g, gi) => (
          <div key={g} className="flex shrink-0 items-center gap-1">
            {gi > 0 && <span className="mx-1.5 h-4 w-px shrink-0 bg-border" />}
            <span className="shrink-0 pr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {g}
            </span>
            {GROWTH_NAV.filter((it) => it.group === g).map((it) => {
              const on = isOn(pathname, it);
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  ref={on ? activeRef : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden xl:inline">{it.label}</span>
                  <span className="xl:hidden">{it.short}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Mobile: trigger + grouped sheet */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ActiveIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Growth Studio
            </p>
            <p className="truncate text-sm font-semibold">{activeItem.label}</p>
          </div>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-accent"
              aria-label="Open Growth Studio menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[288px] p-0">
            <SheetTitle className="sr-only">Growth Studio menu</SheetTitle>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <span className="font-display text-sm font-semibold">Growth Studio</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 space-y-4 overflow-y-auto p-3">
                {GROWTH_GROUPS.map((g) => (
                  <div key={g} className="space-y-1">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {g}
                    </p>
                    <ul className="space-y-1">
                      {GROWTH_NAV.filter((it) => it.group === g).map((it) => {
                        const on = isOn(pathname, it);
                        const Icon = it.icon;
                        return (
                          <li key={it.to}>
                            <Link
                              to={it.to}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                on
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              )}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="flex-1">{it.label}</span>
                              {on && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/** Consistent page header used across Growth Studio. */
export function GrowthPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
