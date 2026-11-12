import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Sun, Target, Lightbulb, CalendarDays, Settings, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";

export type MarketingNavChild = { to: string; label: string };

export type MarketingNavItem = {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Sub-pages grouped under this tab (shown as a second row when active) */
  children?: MarketingNavChild[];
};

/**
 * Five tabs instead of ten. Every old URL still works — related pages are
 * grouped under one tab and shown as a second row, so bookmarks and page
 * permissions keep working.
 */
export const MARKETING_NAV: MarketingNavItem[] = [
  { to: "/erp/marketing", label: "Today", short: "Today", icon: Sun, exact: true },
  { to: "/erp/marketing/truth", label: "Campaigns", short: "Campaigns", icon: Target },
  {
    to: "/erp/marketing/attribution",
    label: "Insights",
    short: "Insights",
    icon: Lightbulb,
    children: [
      { to: "/erp/marketing/attribution", label: "Funnel & UTM" },
      { to: "/erp/marketing/audit", label: "Order match audit" },
      { to: "/erp/marketing/products", label: "Product & LTV" },
      { to: "/erp/marketing/reports", label: "Reports & export" },
    ],
  },
  {
    to: "/erp/marketing/calendar",
    label: "Plan & Alerts",
    short: "Plan",
    icon: CalendarDays,
    children: [
      { to: "/erp/marketing/calendar", label: "Calendar & experiments" },
      { to: "/erp/marketing/alerts", label: "Alerts" },
    ],
  },
  {
    to: "/erp/marketing/settings",
    label: "Setup",
    short: "Setup",
    icon: Settings,
    children: [
      { to: "/erp/marketing/settings", label: "Ad accounts & rules" },
      { to: "/erp/marketing/channels", label: "Other channels" },
    ],
  },
];

const under = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function isItemActive(pathname: string, it: MarketingNavItem) {
  if (it.exact) return pathname === it.to || pathname === `${it.to}/`;
  if (it.children) return it.children.some((c) => under(pathname, c.to));
  return under(pathname, it.to);
}

/** Sticky sub-navigation shared by every marketing page. */
export function MarketingSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const activeGroup = MARKETING_NAV.find((it) => isItemActive(pathname, it));

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
          const on = it === activeGroup;
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
      {activeGroup?.children && (
        <div className="mx-auto flex max-w-[1500px] gap-4 overflow-x-auto px-4 md:px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeGroup.children.map((c) => {
            const on = under(pathname, c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                className={`shrink-0 border-b-2 pb-1.5 text-xs transition-colors ${
                  on
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
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
