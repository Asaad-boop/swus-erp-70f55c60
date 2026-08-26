import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusVariant } from "./status-badge";

export type StatCardProps = {
  label: ReactNode;
  /** Rendered with tabular-nums so columns of numbers stay aligned. */
  value: ReactNode;
  /** Optional secondary line under the value. */
  hint?: ReactNode;
  /** Signed change, e.g. 12.4 → "+12.4%". Tone derives from the status scale. */
  delta?: number | null;
  /** Suffix for the delta value. */
  deltaSuffix?: string;
  /** Flip tone when "up" is bad (e.g. return rate, cost). */
  invertDelta?: boolean;
  /** Small chart / trend slot rendered at the bottom. */
  sparkline?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

const DELTA_TEXT: Record<StatusVariant, string> = {
  success: "text-[var(--success-text)] bg-[var(--success-soft)]",
  warning: "text-[var(--warning-text)] bg-[var(--warning-soft)]",
  danger: "text-[var(--danger-text)] bg-[var(--danger-soft)]",
  info: "text-[var(--info-text)] bg-[var(--info-soft)]",
  neutral: "text-[var(--neutral-text)] bg-[var(--neutral-soft)]",
};

export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaSuffix = "%",
  invertDelta = false,
  sparkline,
  icon,
  className,
}: StatCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = hasDelta && (delta as number) > 0;
  const down = hasDelta && (delta as number) < 0;
  const good = invertDelta ? down : up;
  const tone: StatusVariant = !hasDelta || (!up && !down) ? "neutral" : good ? "success" : "danger";
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-3.5 elevation-raised",
        "transition-shadow duration-[var(--motion-base)] ease-out hover:elevation-overlay",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-caption-v2 font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <div className="text-h2 tabular-nums">{value}</div>
        {hasDelta && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-caption-v2 font-semibold tabular-nums",
              DELTA_TEXT[tone],
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(delta as number).toLocaleString(undefined, { maximumFractionDigits: 1 })}
            {deltaSuffix}
          </span>
        )}
      </div>
      {hint != null && <div className="mt-0.5 text-caption-v2 text-muted-foreground">{hint}</div>}
      {sparkline != null && <div className="mt-2.5 h-10">{sparkline}</div>}
    </div>
  );
}
