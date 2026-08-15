import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Compass,
  Target,
  ListChecks,
  Lightbulb,
  Clapperboard,
  BarChart3,
  Repeat,
  Swords,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";

export type HubNavItem = {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const HUB_NAV: HubNavItem[] = [
  { to: "/erp/hub", label: "Command Center", short: "Center", icon: Compass, exact: true },
  { to: "/erp/hub/goals", label: "Vision & Goals", short: "Goals", icon: Target },
  { to: "/erp/hub/tasks", label: "Task Board", short: "Tasks", icon: ListChecks },
  { to: "/erp/hub/products", label: "Product Pipeline", short: "Products", icon: Lightbulb },
  { to: "/erp/hub/sourcing", label: "Sourcing Desk", short: "Sourcing", icon: PackageSearch },
  { to: "/erp/hub/content", label: "Creative Desk", short: "Creative", icon: Clapperboard },
  { to: "/erp/hub/routines", label: "Routines & Calendar", short: "Routines", icon: Repeat },
  { to: "/erp/hub/rivals", label: "Competitors", short: "Rivals", icon: Swords },
  { to: "/erp/hub/planning", label: "Monthly Projection", short: "Planning", icon: BarChart3 },
];

/** Sticky horizontal sub-navigation shared by every Growth Hub page. */
export function HubSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const isActive = (it: HubNavItem) =>
    it.exact ? pathname === it.to || pathname === `${it.to}/` : pathname.startsWith(it.to);

  useEffect(() => {
    const el = activeRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [pathname]);

  return (
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div
        ref={scroller}
        className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 py-2 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HUB_NAV.map((it) => {
          const on = isActive(it);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              ref={on ? activeRef : undefined}
              className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{it.label}</span>
              <span className="sm:hidden">{it.short}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Consistent page header: icon chip + title + subtitle + right-side actions. */
export function HubPageHeader({
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
