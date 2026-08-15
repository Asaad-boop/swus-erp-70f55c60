import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PackageOpen,
  Megaphone,
  KanbanSquare,
  Users,
  Building2,
  Network,
  BarChart3,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
  { to: "/erp/content/report", label: "Brand Report", short: "Report", icon: BarChart3 },
];

/** Responsive sub-navigation: horizontal on desktop, sheet sidebar on mobile. */
export function ContentSubnav() {
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

  const activeItem = CONTENT_NAV.find((it) => pathname.startsWith(it.to)) ?? CONTENT_NAV[0];

  return (
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      {/* Desktop: horizontal scrollable chips */}
      <div
        ref={scroller}
        className="mx-auto hidden max-w-[1500px] gap-1 overflow-x-auto px-3 py-2 md:flex md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Mobile: compact trigger bar + slide-out sidebar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <activeItem.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Content Studio</p>
            <p className="truncate text-sm font-semibold">{activeItem.label}</p>
          </div>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-accent"
              aria-label="Open Content Studio menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Content Studio menu</SheetTitle>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <span className="font-display text-sm font-semibold">Content Studio</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-1">
                  {CONTENT_NAV.map((it) => {
                    const on = pathname.startsWith(it.to);
                    const Icon = it.icon;
                    return (
                      <li key={it.to}>
                        <Link
                          to={it.to}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                            on
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
              </nav>
            </div>
          </SheetContent>
        </Sheet>
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
