import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

/** Visual grouping + accent per tab so the bar reads as a pipeline, not a flat list. */
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
    scrollerRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  return (
    <div className="relative border-b border-[var(--panel-border)]">
      {edges.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => nudge(-1)}
            className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => nudge(1)}
            className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
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
        <div className="flex min-w-max items-stretch gap-0.5 px-2">
          {STATUS_TABS.map((t) => {
            const c =
              t.key === "all"
                ? total
                : t.key === "incomplete"
                  ? incompleteCount
                  : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
            const isActive = active === t.key;
            const accent = ACCENT[t.key] ?? "bg-foreground/40";
            return (
              <div key={t.key} className="flex items-stretch">
                {DIVIDER_BEFORE.has(t.key) && (
                  <span className="my-2 mr-1 w-px shrink-0 bg-[var(--panel-border)]" />
                )}
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onChange(t.statuses, t.key)}
                  className={cn(
                    "group relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-t-md px-2.5 text-[12.5px] transition-colors",
                    isActive
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full transition-opacity",
                      accent,
                      isActive ? "opacity-100" : "opacity-35 group-hover:opacity-70",
                    )}
                  />
                  <span>{t.label}</span>
                  {c > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10.5px] font-medium tabular-nums transition-colors",
                        isActive
                          ? "bg-foreground/[0.09] text-foreground"
                          : "bg-foreground/[0.05] text-muted-foreground/80",
                      )}
                    >
                      {c.toLocaleString()}
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute inset-x-1.5 -bottom-px h-[2px] rounded-full transition-all",
                      isActive ? cn(accent, "opacity-100") : "opacity-0",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}