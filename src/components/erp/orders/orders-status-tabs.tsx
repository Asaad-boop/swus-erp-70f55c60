import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

/** Per-status CSS color variables for bold active pills + glow. */
const ACCENT: Record<string, string> = {
  pending: "bg-blue-500",
  packing: "bg-purple-500",
  ready_to_ship: "bg-cyan-500",
  shipped: "bg-amber-500",
  in_transit: "bg-amber-500",
  delivered: "bg-emerald-500",
  partial: "bg-emerald-400",
  pending_return: "bg-orange-500",
  returned: "bg-red-500",
  paid_return: "bg-teal-500",
  completed: "bg-emerald-600",
  exchange: "bg-violet-500",
  on_hold: "bg-slate-400",
  cancelled: "bg-rose-500",
  all: "bg-foreground/50",
  incomplete: "bg-zinc-400",
};

const ACCENT_VAR: Record<string, string> = {
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
  all: "var(--status-all)",
  incomplete: "var(--status-incomplete)",
};

const ACCENT_GLOW: Record<string, string> = {
  pending: "var(--status-pending-glow)",
  packing: "var(--status-packing-glow)",
  ready_to_ship: "var(--status-ready-to-ship-glow)",
  shipped: "var(--status-shipped-glow)",
  in_transit: "var(--status-in-transit-glow)",
  delivered: "var(--status-delivered-glow)",
  partial: "var(--status-partial-glow)",
  pending_return: "var(--status-pending-return-glow)",
  returned: "var(--status-returned-glow)",
  paid_return: "var(--status-paid-return-glow)",
  completed: "var(--status-completed-glow)",
  exchange: "var(--status-exchange-glow)",
  on_hold: "var(--status-on-hold-glow)",
  cancelled: "var(--status-cancelled-glow)",
  all: "var(--status-all-glow)",
  incomplete: "var(--status-incomplete-glow)",
};

/** Insert a hairline divider before these tabs to separate pipeline phases. */
const DIVIDER_BEFORE = new Set<StatusTabKey>(["delivered", "pending_return", "completed", "on_hold", "all"]);

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  onChange: (statuses: OrderStatus[], tabKey: StatusTabKey) => void;
  incompleteCount?: number;
};

export function OrdersStatusTabs({ active, counts, total, onChange, incompleteCount = 0 }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Keep the selected tab in view (e.g. after reload with a deep-linked tab).
  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const nudge = (dir: -1 | 1) =>
    scrollerRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });

  return (
    <div className="relative border-b border-[var(--panel-border)] bg-[var(--panel-bg)]/70 backdrop-blur-sm">
      {edges.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[var(--panel-bg)] to-transparent" />
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => nudge(-1)}
            className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground shadow-sm hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[var(--panel-bg)] to-transparent" />
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => nudge(1)}
            className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground shadow-sm hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      <div
        ref={scrollerRef}
        onScroll={measure}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        <div className="flex min-w-max items-stretch gap-1 px-2 py-2">
          {STATUS_TABS.map((t) => {
            const c =
              t.key === "all"
                ? total
                : t.key === "incomplete"
                  ? incompleteCount
                  : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
            const isActive = active === t.key;
            const accent = ACCENT[t.key] ?? "bg-foreground/40";
            const accentVar = ACCENT_VAR[t.key] ?? "var(--status-all)";
            const accentGlow = ACCENT_GLOW[t.key] ?? "var(--status-all-glow)";
            return (
              <div key={t.key} className="flex items-stretch">
                {DIVIDER_BEFORE.has(t.key) && (
                  <span className="my-2.5 mr-1.5 w-px shrink-0 bg-[var(--panel-border)]" />
                )}
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onChange(t.statuses, t.key)}
                  className={cn(
                    "group relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] transition-all duration-200",
                    isActive
                      ? "font-semibold text-white shadow-md"
                      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                  )}
                  style={
                    isActive
                      ? {
                          backgroundColor: accentVar,
                          boxShadow: `0 0 22px ${accentGlow}, 0 4px 10px oklch(0 0 0 / 0.09)`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full transition-all",
                      isActive ? "bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.7)]" : cn(accent, "opacity-60 group-hover:opacity-100"),
                    )}
                  />
                  <span>{t.label}</span>
                  {c > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums transition-colors",
                        isActive
                          ? "bg-white/25 text-white"
                          : "bg-foreground/[0.06] text-muted-foreground/80",
                      )}
                    >
                      {c.toLocaleString()}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute inset-x-3 -bottom-1 h-1 rounded-full bg-white/50 shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
