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
 * Shared ERP page header ("Aurora Ops"). Gives every module the same rhythm:
 * eyebrow → title + chips → actions.
 */
export function ErpPageHeader({ eyebrow, title, subtitle, chips, actions, live = false, className }: Props) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3.5 md:px-5 md:py-4",
        "bg-[var(--aurora-header)] border-[var(--panel-border)] shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow != null && (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {live && (
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              <span className="truncate">{eyebrow}</span>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h1 className="text-[26px] md:text-[28px] font-bold leading-none tracking-tight font-display">{title}</h1>
            {chips}
          </div>
          {subtitle != null && <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions != null && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
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
    neutral: "bg-foreground/5 border-[var(--panel-border)] text-foreground",
    primary: "bg-primary/10 border-primary/25 text-primary",
    success: "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400",
    warning: "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400",
    danger: "bg-destructive/10 border-destructive/25 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        tones[tone],
        className,
      )}
    >
      <span className="font-bold tabular-nums">{value}</span>
      {label != null && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
}
