import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Metric = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  onClick?: () => void;
};

const TONE: Record<NonNullable<Metric["tone"]>, { fg: string; bg: string }> = {
  neutral: { fg: "text-foreground", bg: "bg-foreground/[0.05] text-muted-foreground" },
  primary: { fg: "text-foreground", bg: "bg-primary/10 text-primary" },
  success: { fg: "text-[var(--success-text)]", bg: "bg-[var(--success-soft)] text-[var(--success-text)]" },
  warning: { fg: "text-[var(--warning-text)]", bg: "bg-[var(--warning-soft)] text-[var(--warning-text)]" },
  danger: { fg: "text-[var(--danger-text)]", bg: "bg-[var(--danger-soft)] text-[var(--danger-text)]" },
};

/**
 * Compact KPI rail for the Orders page. Tiles are equal-width on desktop and
 * scroll horizontally on narrow screens instead of collapsing into a wall.
 */
export const OrdersMetricStrip = memo(function OrdersMetricStrip({
  metrics,
  className,
}: {
  metrics: Metric[];
  className?: string;
}) {
  if (metrics.length === 0) return null;
  return (
    <div
      className={cn(
        "-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:overflow-visible sm:px-0",
        metrics.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3",
        className,
      )}
    >
      {metrics.map((m) => {
        const tone = TONE[m.tone ?? "neutral"];
        const Comp = m.onClick ? "button" : "div";
        return (
          <Comp
            key={m.key}
            {...(m.onClick ? { type: "button" as const, onClick: m.onClick } : {})}
            className={cn(
              "focus-ring group flex min-w-[168px] shrink-0 snap-start items-center gap-3 rounded-[var(--radius-card)]",
              "border border-[var(--panel-border)] bg-card px-3.5 py-2.5 text-left transition-colors duration-150 sm:min-w-0",
              m.onClick && "hover:border-foreground/20 hover:bg-foreground/[0.02]",
            )}
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[10px]", tone.bg)}>{m.icon}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                {m.label}
              </span>
              <span className={cn("num block truncate text-[17px] font-semibold tabular-nums", tone.fg)}>{m.value}</span>
              {m.hint && <span className="block truncate text-[11px] text-muted-foreground/70">{m.hint}</span>}
            </span>
          </Comp>
        );
      })}
    </div>
  );
});
