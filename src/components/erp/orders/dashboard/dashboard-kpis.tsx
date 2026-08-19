import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { DashboardKpis } from "@/lib/erp/orders-dashboard.functions";

export function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `৳${v.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function Delta({ cur, prev, invert }: { cur: number; prev?: number; invert?: boolean }) {
  if (prev === undefined || prev === null) return null;
  if (!prev && !cur) return null;
  const pct = prev ? ((cur - prev) / Math.abs(prev)) * 100 : 100;
  const up = cur >= prev;
  const good = invert ? !up : up;
  const Icon = Math.abs(pct) < 0.5 ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold tabular-nums",
        Math.abs(pct) < 0.5
          ? "bg-muted text-muted-foreground"
          : good
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-red-500/10 text-red-600 dark:text-red-400",
      )}
      title="আগের সমান সময়ের তুলনায়"
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct) >= 999 ? "999+" : Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "default",
  onClick,
  active,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  active?: boolean;
  delta?: React.ReactNode;
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
      <div className="mt-1 flex items-center gap-1.5">
        <span className={cn("text-xl font-semibold tabular-nums", toneClass)}>{value}</span>
        {delta}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

export function DashboardKpiStrip({
  kpis,
  prev,
  onPickStatuses,
  activeStatuses,
}: {
  kpis: DashboardKpis;
  prev?: DashboardKpis | null;
  onPickStatuses: (statuses: string[]) => void;
  activeStatuses: string[];
}) {
  const deliveryRate = kpis.total_orders ? (kpis.delivered_orders / kpis.total_orders) * 100 : 0;
  const returnRate = kpis.total_orders ? (kpis.returned_orders / kpis.total_orders) * 100 : 0;
  const cancelRate = kpis.total_orders ? (kpis.cancelled_orders / kpis.total_orders) * 100 : 0;
  const same = (a: string[]) =>
    a.length === activeStatuses.length && a.every((s) => activeStatuses.includes(s));

  const delivered = ["delivered", "partial_delivered", "completed"];
  const returned = ["returned", "partial_return", "pending_return", "return_in_transit"];
  const transit = ["shipped", "in_transit"];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <Kpi
        label="Total orders"
        value={kpis.total_orders.toLocaleString()}
        sub={money(kpis.total_value)}
        delta={<Delta cur={kpis.total_orders} prev={prev?.total_orders} />}
      />
      <Kpi
        label="Delivered"
        value={kpis.delivered_orders.toLocaleString()}
        sub={`${money(kpis.delivered_value)} · ${deliveryRate.toFixed(1)}%`}
        tone="success"
        onClick={() => onPickStatuses(same(delivered) ? [] : delivered)}
        active={same(delivered)}
        delta={<Delta cur={kpis.delivered_orders} prev={prev?.delivered_orders} />}
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
        delta={<Delta cur={kpis.returned_orders} prev={prev?.returned_orders} invert />}
      />
      <Kpi
        label="Cancelled"
        value={kpis.cancelled_orders.toLocaleString()}
        sub={`${cancelRate.toFixed(1)}% of orders`}
        onClick={() => onPickStatuses(same(["cancelled"]) ? [] : ["cancelled"])}
        active={same(["cancelled"])}
        delta={<Delta cur={kpis.cancelled_orders} prev={prev?.cancelled_orders} invert />}
      />
      <Kpi
        label="Delivered value"
        value={money(kpis.delivered_value)}
        tone="success"
        sub={`${kpis.paid_orders.toLocaleString()} paid orders`}
        delta={<Delta cur={kpis.delivered_value} prev={prev?.delivered_value} />}
      />
      <Kpi label="Advance collected" value={money(kpis.advance_collected)} tone="info" />
      <Kpi label="COD outstanding" value={money(kpis.cod_outstanding)} tone="warning" />
      <Kpi
        label="Avg order value"
        value={money(kpis.avg_order_value)}
        delta={<Delta cur={kpis.avg_order_value} prev={prev?.avg_order_value} />}
      />
      <Kpi
        label="Delivery rate"
        value={`${deliveryRate.toFixed(1)}%`}
        sub={`Return ${returnRate.toFixed(1)}% · Cancel ${cancelRate.toFixed(1)}%`}
        tone={deliveryRate >= 70 ? "success" : deliveryRate >= 50 ? "warning" : "danger"}
      />
      <Kpi
        label="Confirm → delivery"
        value={`${(kpis.avg_confirm_to_delivery_hours / 24).toFixed(1)} d`}
        sub={`${kpis.avg_confirm_to_delivery_hours.toFixed(0)} hours avg`}
        delta={<Delta cur={kpis.avg_confirm_to_delivery_hours} prev={prev?.avg_confirm_to_delivery_hours} invert />}
      />
    </div>
  );
}