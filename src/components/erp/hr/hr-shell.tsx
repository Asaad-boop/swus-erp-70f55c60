import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Banknote,
  CalendarRange,
  Fingerprint,
  Palmtree,
  Radio,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";
import { ErpPageHeader } from "@/components/erp/ui";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  need: "self" | "manager" | "pay";
};

export const HR_NAV: Item[] = [
  { to: "/erp/hr", label: "Team Today", icon: Radio, exact: true, need: "manager" },
  { to: "/erp/hr/attendance", label: "Attendance", icon: CalendarRange, need: "manager" },
  { to: "/erp/hr/employees", label: "Employees", icon: Users, need: "manager" },
  { to: "/erp/hr/leaves", label: "Leave & Holidays", icon: Palmtree, need: "manager" },
  { to: "/erp/hr/payroll", label: "Payroll", icon: Banknote, need: "pay" },
  { to: "/erp/hr/performance", label: "Performance", icon: Activity, need: "manager" },
  { to: "/erp/hr/me", label: "My Attendance", icon: Fingerprint, need: "self" },
];

/** Role flags matching the DB helpers hr_is_manager / hr_can_pay. */
export function useHrRole() {
  const { hasAnyRole, isLoading } = useCurrentRole();
  return {
    isLoading,
    isManager: hasAnyRole(["owner", "admin", "hr_admin", "hr_manager"]),
    canPay: hasAnyRole(["owner", "admin", "hr_admin"]),
  };
}

export function HrSubnav() {
  const { pathname } = useLocation();
  const { isManager, canPay } = useHrRole();
  const items = HR_NAV.filter(
    (i) => i.need === "self" || (i.need === "manager" ? isManager : canPay),
  );
  if (items.length <= 1) return null;
  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 md:px-6">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.to || pathname === `${it.to}/`
            : pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to as never}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function HrPage({
  title,
  subtitle,
  actions,
  children,
  live,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 pb-24 md:p-6">
      <ErpPageHeader
        eyebrow="HRM"
        live={live}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      {children}
    </div>
  );
}

export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-lg p-10 text-center text-sm text-muted-foreground">
      You don't have access to {what}. Ask an admin for the HR role.
    </div>
  );
}
