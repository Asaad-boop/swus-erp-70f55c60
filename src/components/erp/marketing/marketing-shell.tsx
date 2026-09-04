import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  LayoutDashboard,
  Target,
  Image as ImageIcon,
  GitBranch,
  ScanSearch,
  Scale,

  PackagePlus,
  CalendarClock,
  CalendarDays,
  BellRing,
  BarChart3,
  Plug,
  FileBarChart,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";

export type MarketingNavItem = {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const MARKETING_NAV: MarketingNavItem[] = [
  {
    to: "/erp/marketing",
    label: "Overview",
    short: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/erp/marketing/truth",
    label: "Campaign Workspace",
    short: "Campaigns",
    icon: Target,
  },
  {
    to: "/erp/marketing/attribution",
    label: "Attribution & Funnel",
    short: "Attribution",
    icon: GitBranch,
  },
  {
    to: "/erp/marketing/audit",
    label: "Attribution Audit",
    short: "Audit",
    icon: ScanSearch,
  },

  { to: "/erp/marketing/products", label: "Product & LTV", short: "Products", icon: PackagePlus },
  {
    to: "/erp/marketing/calendar",
    label: "Calendar & Experiments",
    short: "Calendar",
    icon: CalendarDays,
  },

  {
    to: "/erp/marketing/calendar",
    label: "Calendar & Experiments",
    short: "Calendar",
    icon: CalendarDays,
  },
  { to: "/erp/marketing/alerts", label: "Alerts & Intelligence", short: "Alerts", icon: BellRing },
  { to: "/erp/marketing/channels", label: "Ad Channels", short: "Channels", icon: Plug },
  {
    to: "/erp/marketing/reports",
    label: "Reports & Exports",
    short: "Reports",
    icon: FileBarChart,
  },
  { to: "/erp/marketing/settings", label: "Settings", short: "Settings", icon: Settings },
];

/** Sticky horizontal sub-navigation shared by every marketing page. */
export function MarketingSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const isActive = (it: MarketingNavItem) =>
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
        {MARKETING_NAV.map((it) => {
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
export function MarketingPageHeader({
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

/** Shared brand pill switcher used across marketing pages (slug-based). */
export function BrandTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const { brands, isLoading } = useBrand();
  if (isLoading && brands.length === 0) {
    return <Skeleton className="h-8 w-40 rounded-md" />;
  }
  const items = [
    { slug: "all", name: "All" },
    ...brands.map((b) => ({ slug: b.slug, name: b.name })),
  ];
  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5">
      {items.map((it) => {
        const on = value === it.slug;
        return (
          <button
            key={it.slug}
            type="button"
            onClick={() => onChange(it.slug)}
            className={`h-7 rounded px-3 text-xs font-medium transition ${
              on
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {it.name}
          </button>
        );
      })}
    </div>
  );
}
