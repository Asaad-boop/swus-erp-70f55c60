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
  "incomplete",
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
    label: tabByKey.get(key)?.label ?? (key === "incomplete" ? "Incomplete" : key),
    statuses: tabByKey.get(key)?.statuses ?? [],
    count: countFor(key),
    accent: ACCENT[key] ?? "var(--status-all)",
  }));

  return (
    <section
      className={cn("rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-card px-3.5 py-3 md:px-4", className)}
      aria-label="Order pipeline"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Active pipeline
        </span>
        <span className="num text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{flowTotal.toLocaleString()}</span> in flight
        </span>
      </div>

      {/* proportional rail — rounded segments with a hairline gap */}
      <div className="mt-2.5 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" role="group">
        {flowTotal === 0 ? (
          <div className="h-full w-full rounded-full bg-[var(--surface-alt)]" />
        ) : (
          flow
            .filter((f) => f.count > 0)
            .map((f) => {
              const on = active === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => onChange(f.statuses, f.key)}
                  title={`${f.label} — ${f.count.toLocaleString()}`}
                  aria-label={`${f.label}, ${f.count} orders`}
                  aria-pressed={on}
                  className={cn(
                    "focus-ring h-full rounded-full transition-all duration-300 ease-out",
                    "hover:brightness-110 motion-reduce:transition-none",
                  )}
                  style={{
                    width: `${(f.count / flowTotal) * 100}%`,
                    minWidth: 8,
                    background: f.accent,
                    opacity: on || active === "all" ? 1 : 0.45,
                    transform: on ? "scaleY(1.35)" : undefined,
                  }}
                />
              );
            })
        )}
      </div>

      {/* legend — real pill targets, horizontally scrollable on mobile */}
      <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
        {flow.map((f) => {
          const on = active === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange(f.statuses, f.key)}
              aria-pressed={on}
              className={cn(
                "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150",
                on
                  ? "border-transparent bg-foreground text-background"
                  : "border-[var(--panel-border)] bg-card text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: f.accent, opacity: on ? 1 : 0.9 }}
              />
              <span className="font-medium">{f.label}</span>
              <span className={cn("num font-semibold tabular-nums", on ? "" : "text-foreground")}>
                {f.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* settled buckets */}
      <div className="-mx-1 mt-2.5 flex gap-x-3 gap-y-1.5 overflow-x-auto border-t border-[var(--border-soft)] px-1 pt-2.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
        {settled.map((s) => {
          const on = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange(s.statuses, s.key)}
              aria-pressed={on}
              className={cn(
                "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-chip)] text-[11.5px] transition-colors",
                on ? "font-medium text-foreground" : "text-muted-foreground/80 hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.accent, opacity: 0.75 }} />
              <span className={cn(on && "underline decoration-2 underline-offset-4")}>{s.label}</span>
              <span className="num font-semibold tabular-nums">{s.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
