import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

/** Statuses that make up the live pipeline, in flow order. */
const FLOW_KEYS: StatusTabKey[] = [
  "pending",
  "packing",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "delivered",
  "partial",
];

/** Settled / secondary buckets, shown as a quiet row underneath. */
const SETTLED_KEYS: StatusTabKey[] = [
  "completed",
  "pending_return",
  "returned",
  "paid_return",
  "exchange",
  "on_hold",
  "cancelled",
  "all",
];

const ACCENT: Record<string, string> = {
  pending: "var(--status-pending)",
  packing: "var(--status-packing)",
  ready_to_ship: "var(--status-ready-to-ship)",
  shipped: "var(--status-shipped)",
  in_transit: "var(--status-in-transit)",
  delivered: "var(--status-delivered)",
  partial: "var(--status-partial)",
  pending_return: "var(--status-pending-return)",
  returned: "var(--status-returned)",
  paid_return: "var(--status-paid-return)",
  completed: "var(--status-completed)",
  exchange: "var(--status-exchange)",
  on_hold: "var(--status-on-hold)",
  cancelled: "var(--status-cancelled)",
  incomplete: "var(--status-incomplete)",
  all: "var(--status-all)",
};

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  incompleteCount?: number;
  onChange: (statuses: OrderStatus[], key: StatusTabKey) => void;
  className?: string;
};

/**
 * Signature pipeline bar: one proportional segmented rail for the live
 * pipeline, a legend under it, and settled buckets in a muted row below.
 */
export function PipelineFlowBar({ active, counts, total, incompleteCount = 0, onChange, className }: Props) {
  const tabByKey = useMemo(() => new Map(STATUS_TABS.map((t) => [t.key, t])), []);

  const countFor = (key: StatusTabKey) => {
    if (key === "all") return total;
    if (key === "incomplete") return incompleteCount;
    const t = tabByKey.get(key);
    return (t?.statuses ?? []).reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  };

  const flow = FLOW_KEYS.map((key) => ({
    key,
    label: tabByKey.get(key)?.label ?? key,
    statuses: tabByKey.get(key)?.statuses ?? [],
    count: countFor(key),
    accent: ACCENT[key] ?? "var(--status-all)",
  }));

  const flowTotal = flow.reduce((s, f) => s + f.count, 0);
  const settled = SETTLED_KEYS.map((key) => ({
    key,
    label: tabByKey.get(key)?.label ?? key,
    statuses: tabByKey.get(key)?.statuses ?? [],
    count: countFor(key),
    accent: ACCENT[key] ?? "var(--status-all)",
  }));

  return (
    <section className={cn("rounded-[var(--radius-card)] border border-border bg-card px-4 py-3.5", className)} aria-label="Order pipeline">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Active pipeline
        </span>
        <span className="num text-[11px] text-muted-foreground">
          {flowTotal.toLocaleString()} in flight
        </span>
      </div>

      {/* proportional rail */}
      <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-alt)]" role="group">
        {flowTotal === 0 ? (
          <div className="h-full w-full bg-[var(--border)]" />
        ) : (
          flow
            .filter((f) => f.count > 0)
            .map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onChange(f.statuses, f.key)}
                title={`${f.label} — ${f.count.toLocaleString()}`}
                aria-label={`${f.label}, ${f.count} orders`}
                aria-pressed={active === f.key}
                className="focus-ring h-full border-r border-card/70 transition-opacity duration-[var(--motion-fast)] last:border-r-0 hover:opacity-80"
                style={{
                  width: `${(f.count / flowTotal) * 100}%`,
                  minWidth: 6,
                  background: f.accent,
                  opacity: active === f.key || active === "all" ? 1 : 0.72,
                }}
              />
            ))
        )}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {flow.map((f) => {
          const on = active === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange(f.statuses, f.key)}
              aria-pressed={on}
              className={cn(
                "focus-ring group inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] py-0.5 text-[12px]",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: f.accent }} />
              <span className={cn("font-medium", on && "underline decoration-2 underline-offset-4")}>{f.label}</span>
              <span className="num text-[12px] font-semibold text-foreground">{f.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {/* settled buckets */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-[var(--border-soft)] pt-2.5">
        {settled.map((s) => {
          const on = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange(s.statuses, s.key)}
              aria-pressed={on}
              className={cn(
                "focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] text-[11.5px]",
                on ? "text-foreground" : "text-muted-foreground/80 hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.accent, opacity: 0.75 }} />
              <span className={cn(on && "underline decoration-2 underline-offset-4")}>{s.label}</span>
              <span className="num font-semibold">{s.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
