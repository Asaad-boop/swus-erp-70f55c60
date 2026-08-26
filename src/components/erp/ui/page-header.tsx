import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Small uppercase context line above the title. */
  eyebrow?: ReactNode;
  /** Breadcrumb trail rendered above the title (replaces eyebrow when both given). */
  breadcrumb?: ReactNode;
  title: ReactNode;
  /** Optional supporting sentence under the title. */
  subtitle?: ReactNode;
  /** Chips rendered next to the title (counts, sync state…). */
  chips?: ReactNode;
  /** Right hand side actions. */
  actions?: ReactNode;
  /** Show the live pulse dot in the eyebrow. */
  live?: boolean;
  /** Stick to the top of the scroll container with a solid backdrop. */
  sticky?: boolean;
  className?: string;
};

/**
 * Shared ERP page header. Quiet, minimal rhythm:
 * breadcrumb/eyebrow → title + inline meta → actions. No card, no gradient.
 */
export function ErpPageHeader({
  eyebrow,
  breadcrumb,
  title,
  subtitle,
  chips,
  actions,
  live = false,
  sticky = false,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3",
        sticky && "sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 pt-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          {breadcrumb != null ? (
            <div className="text-caption-v2 text-muted-foreground">{breadcrumb}</div>
          ) : (
            eyebrow != null && (
              <div className="flex items-center gap-1.5 text-caption-v2 font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                {live && <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success-solid)]" />}
                <span className="truncate">{eyebrow}</span>
              </div>
            )
          )}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h1 className="text-h2 leading-none">{title}</h1>
            {chips}
          </div>
          {subtitle != null && <p className="mt-1 text-small-v2 text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** Alias matching the v2 primitive naming. */
export const PageHeader = ErpPageHeader;

/** Small count / state chip used inside the header. */
export function HeaderChip({
  value,
  label,
  tone = "neutral",
  className,
}: {
  value: ReactNode;
  label?: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "text-muted-foreground",
    primary: "text-primary",
    success: "text-[var(--success-text)]",
    warning: "text-[var(--warning-text)]",
    danger: "text-[var(--danger-text)]",
  };
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-caption-v2", tones[tone], className)}>
      <span className="font-semibold tabular-nums">{value}</span>
      {label != null && <span className="text-muted-foreground/70">{label}</span>}
    </span>
  );
}
