import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  onChange: (statuses: OrderStatus[], tabKey: StatusTabKey) => void;
  incompleteCount?: number;
};

export function OrdersStatusTabs({ active, counts, total, onChange, incompleteCount = 0 }: Props) {
  return (
    <div className="overflow-x-auto border-b border-[var(--panel-border)]">
      <div className="flex items-center gap-1 px-2 py-1.5 min-w-max">
        {STATUS_TABS.map((t) => {
          const c = t.key === "all"
            ? total
            : t.key === "incomplete"
              ? incompleteCount
              : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.statuses, t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] whitespace-nowrap transition-colors",
                isActive
                  ? "bg-foreground/[0.06] text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]",
              )}
            >
              <span>{t.label}</span>
              {c > 0 && (
                <span className={cn("text-[11px] tabular-nums", isActive ? "text-foreground/70" : "text-muted-foreground/60")}>
                  {c.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}