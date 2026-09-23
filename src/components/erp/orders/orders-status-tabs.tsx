import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, List, Clock, Package, PackageCheck, Truck, Send,
  CheckCircle2, PieChart, Undo2, RotateCcw, BadgeDollarSign, CheckCheck, Repeat,
  PauseCircle, XCircle, AlertCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

const ICON: Record<string, LucideIcon> = {
  all: List,
  pending: Clock,
  packing: Package,
  packed: PackageCheck,
  ready_to_ship: PackageCheck,
  shipped: Truck,
  in_transit: Send,
  delivered: CheckCircle2,
  partial: PieChart,
  pending_return: Undo2,
  returned: RotateCcw,
  paid_return: BadgeDollarSign,
  completed: CheckCheck,
  exchange: Repeat,
  on_hold: PauseCircle,
  cancelled: XCircle,
  incomplete: AlertCircle,
};

const ACCENT_VAR: Record<string, string> = {
  pending: "var(--status-pending)",
  packing: "var(--status-packing)",
  packed: "var(--status-packed)",
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

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  onChange: (statuses: OrderStatus[], tabKey: StatusTabKey) => void;
  incompleteCount?: number;
};

/**
 * Card-style status tabs: tinted icon + label + count, mirroring the
 * reference order-list layout. Horizontally scrollable with edge affordances.
 */
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

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const nudge = (dir: -1 | 1) =>
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <div className="relative">
      {edges.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Scroll left"
            onClick={() => nudge(-1)}
            className="absolute left-0 top-1/2 z-20 h-7 w-7 -translate-y-1/2 rounded-full bg-card text-muted-foreground shadow-sm hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </>
      )}
      {edges.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Scroll right"
            onClick={() => nudge(1)}
            className="absolute right-0 top-1/2 z-20 h-7 w-7 -translate-y-1/2 rounded-full bg-card text-muted-foreground shadow-sm hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}

      <div
        ref={scrollerRef}
        onScroll={measure}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        <div className="flex min-w-max items-stretch gap-1 rounded-lg border border-border bg-card p-1">
          {STATUS_TABS.map((t) => {
            const c =
              t.key === "all"
                ? total
                : t.key === "incomplete"
                  ? incompleteCount
                  : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
            const isActive = active === t.key;
            const accent = ACCENT_VAR[t.key] ?? "var(--status-all)";
            const Icon = ICON[t.key] ?? List;
            return (
              <Button
                key={t.key}
                ref={isActive ? activeRef : undefined}
                type="button"
                variant="ghost"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(t.statuses, t.key)}
                className={cn(
                  "group relative h-11 min-w-[92px] justify-start gap-2 rounded-md border border-transparent px-2.5 text-left transition-all duration-300",
                  isActive
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md transition-transform duration-300 group-hover:scale-105"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                    color: accent,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[10.5px] font-semibold leading-none",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                    style={isActive ? { color: accent } : undefined}
                  >
                    {t.label}
                  </span>
                  <span key={c} className="mt-1 block animate-fade-in text-[16px] font-extrabold leading-none tabular-nums text-foreground">
                    {c.toLocaleString()}
                  </span>
                </span>
                {isActive ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: accent }} /> : null}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
