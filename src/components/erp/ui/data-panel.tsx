import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Elevated content surface shared by every ERP module. Optional header strip
 * keeps table/section chrome consistent across pages.
 */
export function DataPanel({
  children,
  className,
  bodyClassName,
  title,
  description,
  actions,
  icon,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** Remove body padding (tables). */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-[var(--panel-bg)] border-[var(--panel-border)]",
        "shadow-[var(--shadow-panel)] transition-shadow duration-200 hover:shadow-[var(--shadow-panel-lg)]",
        className,
      )}
    >
      {(title != null || actions != null) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--panel-border)] bg-[var(--panel-head)] px-4 py-2.5">
          {icon != null && <span className="text-muted-foreground">{icon}</span>}
          <div className="min-w-0">
            {title != null && <div className="truncate text-sm font-semibold">{title}</div>}
            {description != null && <div className="truncate text-[11px] text-muted-foreground">{description}</div>}
          </div>
          <div className="flex-1" />
          {actions}
        </div>
      )}
      <div className={cn(flush ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Compact KPI tile used in panel grids. */
export function StatPill({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const ring: Record<string, string> = {
    neutral: "before:bg-muted-foreground/40",
    primary: "before:bg-primary",
    success: "before:bg-emerald-500",
    warning: "before:bg-amber-500",
    danger: "before:bg-destructive",
  };
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[var(--panel-bg)] border-[var(--panel-border)] px-3 py-2.5",
        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full",
        ring[tone],
        className,
      )}
    >
      <div className="flex items-center gap-1.5 pl-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="pl-2 text-lg font-bold tabular-nums leading-tight">{value}</div>
      {hint != null && <div className="pl-2 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Consistent empty state for lists and boards. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}>
      {icon != null && (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      )}
      <div>
        <div className="font-semibold">{title}</div>
        {description != null && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      {action}
    </div>
  );
}
