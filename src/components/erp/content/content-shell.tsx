import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  PackageOpen,
  Megaphone,
  KanbanSquare,
  Users,
  Building2,
  Network,
  type LucideIcon,
} from "lucide-react";

export type ContentNavItem = {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
};

export const CONTENT_NAV: ContentNavItem[] = [
  { to: "/erp/content/intake", label: "Stock → Intake", short: "Intake", icon: PackageOpen },
  { to: "/erp/content/media-plans", label: "Media Buying Hub", short: "Media", icon: Megaphone },
  { to: "/erp/content/pipeline", label: "Content Pipeline", short: "Pipeline", icon: KanbanSquare },
  { to: "/erp/content/creators", label: "Creator CRM", short: "Creators", icon: Users },
  { to: "/erp/content/agencies", label: "Agency Partners", short: "Agencies", icon: Building2 },
  { to: "/erp/content/matching", label: "Product ↔ Creator", short: "Matching", icon: Network },
];

/** Sticky sub-navigation shared by every Content Studio page. */
export function ContentSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

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
        {CONTENT_NAV.map((it) => {
          const on = pathname.startsWith(it.to);
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
              <span className="hidden sm:inline">{it.label}</span>
              <span className="sm:hidden">{it.short}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ContentPageHeader({
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

/** Compact KPI tile used across Content Studio screens. */
export function ContentKpi({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-colors ${
        onClick ? "hover:border-primary/40" : ""
      } ${active ? "border-primary/50 ring-1 ring-primary/20" : ""}`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </Tag>
  );
}