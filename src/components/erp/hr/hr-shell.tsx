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
  { to: "/erp/hr/live", label: "Live Dashboard", short: "Live", icon: Radio },
  { to: "/erp/hr/my-attendance", label: "My Attendance", short: "Mine", icon: Fingerprint },
  { to: "/erp/hr/employees", label: "Employees", short: "Staff", icon: Users },
  { to: "/erp/hr/attendance", label: "Attendance", short: "Attend", icon: CalendarCheck },
  { to: "/erp/hr/leaves", label: "Leave & Holidays", short: "Leave", icon: PalmtreeIcon },
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
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div
        ref={scroller}
        className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 py-2 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HR_NAV.map((it) => {
          const on = isActive(it);
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