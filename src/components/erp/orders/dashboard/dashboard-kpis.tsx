import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardKpis } from "@/lib/erp/orders-dashboard.functions";

export function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `৳${v.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function Kpi({
  label,
  value,
  sub,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  }[tone];
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-3 transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50",
        active && "ring-2 ring-primary",
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

export function DashboardKpiStrip({
  kpis,
  onPickStatuses,
  activeStatuses,
}: {
  kpis: DashboardKpis;
  onPickStatuses: (statuses: string[]) => void;
  activeStatuses: string[];
}) {
  const deliveryRate = kpis.total_orders ? (kpis.delivered_orders / kpis.total_orders) * 100 : 0;
  const returnRate = kpis.total_orders ? (kpis.returned_orders / kpis.total_orders) * 100 : 0;
  const same = (a: string[]) =>
    a.length === activeStatuses.length && a.every((s) => activeStatuses.includes(s));

  const delivered = ["delivered", "partial_delivered", "completed"];
  const returned = ["returned", "partial_return", "pending_return", "return_in_transit"];
  const transit = ["shipped", "in_transit"];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <Kpi label="Total orders" value={kpis.total_orders.toLocaleString()} sub={money(kpis.total_value)} />
      <Kpi
        label="Delivered"
        value={kpis.delivered_orders.toLocaleString()}
        sub={`${money(kpis.delivered_value)} · ${deliveryRate.toFixed(1)}%`}
        tone="success"
        onClick={() => onPickStatuses(same(delivered) ? [] : delivered)}
        active={same(delivered)}
      />
      <Kpi
        label="In transit"
        value={kpis.in_transit_orders.toLocaleString()}
        tone="info"
        onClick={() => onPickStatuses(same(transit) ? [] : transit)}
        active={same(transit)}
      />
      <Kpi
        label="Return family"
        value={kpis.returned_orders.toLocaleString()}
        sub={`${money(kpis.returned_value)} · ${returnRate.toFixed(1)}%`}
        tone="danger"
        onClick={() => onPickStatuses(same(returned) ? [] : returned)}
        active={same(returned)}
      />
      <Kpi
        label="Cancelled"
        value={kpis.cancelled_orders.toLocaleString()}
        onClick={() => onPickStatuses(same(["cancelled"]) ? [] : ["cancelled"])}
        active={same(["cancelled"])}
      />
      <Kpi label="Paid orders" value={kpis.paid_orders.toLocaleString()} tone="success" />
      <Kpi label="Advance collected" value={money(kpis.advance_collected)} tone="info" />
      <Kpi label="COD outstanding" value={money(kpis.cod_outstanding)} tone="warning" />
      <Kpi label="Avg order value" value={money(kpis.avg_order_value)} />
      <Kpi
        label="Confirm → delivery"
        value={`${(kpis.avg_confirm_to_delivery_hours / 24).toFixed(1)} d`}
        sub={`${kpis.avg_confirm_to_delivery_hours.toFixed(0)} hours avg`}
      />
    </div>
  );
}