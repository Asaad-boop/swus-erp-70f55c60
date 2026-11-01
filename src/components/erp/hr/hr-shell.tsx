import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  PalmtreeIcon,
  Banknote,
  Trophy,
  Radio,
  Fingerprint,
  ShieldCheck,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type HrNavItem = { to: string; label: string; short: string; icon: LucideIcon; exact?: boolean };

export const HR_NAV: HrNavItem[] = [
  { to: "/erp/hr", label: "HR Overview", short: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/erp/hr/team", label: "Live Dashboard", short: "Live", icon: Radio },
  { to: "/erp/hr/my-day", label: "My Attendance", short: "Mine", icon: Fingerprint },
  { to: "/erp/hr/employees", label: "Employees", short: "Staff", icon: Users },
  { to: "/erp/hr/attendance", label: "Attendance", short: "Attend", icon: CalendarCheck },
  { to: "/erp/hr/leave-approvals", label: "Leave & Holidays", short: "Leave", icon: PalmtreeIcon },
  { to: "/erp/hr/payroll", label: "Payroll", short: "Payroll", icon: Banknote },
  { to: "/erp/hr/performance", label: "Performance & KPI", short: "KPI", icon: Trophy },
  { to: "/erp/hr/access", label: "Users & Access", short: "Access", icon: ShieldCheck },
  { to: "/erp/hr/settings", label: "HR Settings", short: "Settings", icon: Settings2 },
];

/** Sticky sub-navigation shared by every HRM page. */
export function HrSubnav() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const isActive = (it: HrNavItem) =>
    it.exact ? pathname === it.to || pathname === `${it.to}/` : pathname.startsWith(it.to);

  useEffect(() => {
    const el = activeRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({ left: Math.max(0, el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2), behavior: "smooth" });
  }, [pathname]);

  return (
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div
        ref={scroller}
        className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto scroll-smooth px-3 py-2 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HR_NAV.map((it) => {
          const on = isActive(it);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              ref={on ? activeRef : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.97] ${
                on
                  ? "border-primary/30 bg-primary/10 text-primary shadow-[0_1px_10px_-4px_color-mix(in oklab, var(--primary) 60%, transparent)]"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${on ? "scale-110" : ""}`} />
              <span className="hidden sm:inline">{it.label}</span>
              <span className="sm:hidden">{it.short}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Consistent HR page header. */
export function HrPageHeader({
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

export const money = (n: number) =>
  `৳${Math.round(Number(n) || 0).toLocaleString("en-BD")}`;

/** Shimmering placeholder rows for a loading table body. */
export function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/40 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="p-2.5">
              <div
                className="h-3.5 animate-pulse rounded bg-muted"
                style={{ width: `${c === 0 ? 70 : 40 + ((r + c) % 3) * 12}%`, animationDelay: `${(r * cols + c) * 25}ms` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Card-shaped shimmer used above tables (KPI strips etc.). */
export function CardSkeleton({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-[86px] animate-pulse rounded-xl border border-border/60 bg-muted/50 ${className}`}
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </>
  );
}

/** Friendly empty state for tables and panels. */
export function HrEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-[42ch] text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

/** Shared row/card motion classes so every HR surface feels the same. */
export const hrRow = "transition-colors duration-150 hover:bg-muted/40";
export const hrCardHover =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5";
export const hrFadeIn = "animate-in fade-in slide-in-from-bottom-1 duration-300";

/** 12-hour clock label for an ISO timestamp, Dhaka time. */
export const clockTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/** Milliseconds → "2h 15m". */
export const hoursMins = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
export const EMPLOYEE_STATUSES = ["active", "probation", "on_leave", "resigned", "terminated"] as const;
export const ATTENDANCE_STATUSES = ["present", "late", "half_day", "absent", "leave", "holiday", "week_off"] as const;

export const statusTone: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  probation: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  on_leave: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  resigned: "bg-muted text-muted-foreground border-border",
  terminated: "bg-destructive/10 text-destructive border-destructive/20",
  present: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  half_day: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
  leave: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  holiday: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  week_off: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};