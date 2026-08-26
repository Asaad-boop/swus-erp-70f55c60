import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export { EmptyState } from "./empty-state";

/**
 * The single card/panel surface for every ERP module.
 * Soft border + `--elevation-raised`, no gradients. Optional header/footer rows.
 */
export function DataPanel({
  children,
  className,
  bodyClassName,
  title,
  description,
  actions,
  icon,
  footer,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** Optional footer row (totals, pagination…). */
  footer?: ReactNode;
  /** Remove body padding (tables). */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card elevation-raised",
        "transition-shadow duration-[var(--motion-base)] ease-out",
        className,
      )}
    >
      {(title != null || actions != null) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          {icon != null && <span className="text-muted-foreground">{icon}</span>}
          <div className="min-w-0">
            {title != null && <div className="truncate text-h4">{title}</div>}
            {description != null && (
              <div className="truncate text-caption-v2 text-muted-foreground">{description}</div>
            )}
          </div>
          <div className="flex-1" />
          {actions}
        </div>
      )}
      <div className={cn(flush ? "" : "p-4", bodyClassName)}>{children}</div>
      {footer != null && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-4 py-2.5 text-small-v2">
          {footer}
        </div>
      )}
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
    neutral: "before:bg-[var(--neutral-border)]",
    primary: "before:bg-primary",
    success: "before:bg-[var(--success-solid)]",
    warning: "before:bg-[var(--warning-solid)]",
    danger: "before:bg-[var(--danger-solid)]",
  };
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 elevation-raised",
        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full",
        ring[tone],
        className,
      )}
    >
      <div className="flex items-center gap-1.5 pl-2 text-caption-v2 font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="pl-2 text-h3 tabular-nums">{value}</div>
      {hint != null && <div className="pl-2 text-caption-v2 text-muted-foreground">{hint}</div>}
    </div>
  );
}
