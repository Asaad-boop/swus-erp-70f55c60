import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Small uppercase context line above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Optional supporting sentence under the title. */
  subtitle?: ReactNode;
  /** Chips rendered next to the title (counts, sync state…). */
  chips?: ReactNode;
  /** Right hand side actions. */
  actions?: ReactNode;
  /** Show the live pulse dot in the eyebrow. */
  live?: boolean;
  className?: string;
};

/**
 * Shared ERP page header. Quiet, minimal rhythm:
 * eyebrow → title + inline meta → actions. No heavy card, no gradient block.
 */
export function ErpPageHeader({ eyebrow, title, subtitle, chips, actions, live = false, className }: Props) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3",
        className,
      )}
    >
        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0">
          {eyebrow != null && (
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {live && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
              <span className="truncate">{eyebrow}</span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h1 className="text-[19px] md:text-[21px] font-semibold leading-none tracking-tight font-display">{title}</h1>
            {chips}
          </div>
          {subtitle != null && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions != null && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </header>
  );
}

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
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  };
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-[11px]", tones[tone], className)}>
      <span className="font-semibold tabular-nums">{value}</span>
      {label != null && <span className="text-muted-foreground/70">{label}</span>}
    </span>
  );
}
