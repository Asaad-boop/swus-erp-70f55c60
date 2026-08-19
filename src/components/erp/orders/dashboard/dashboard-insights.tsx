import { AlertTriangle, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { statusBadge } from "@/lib/erp/orders";
import type { OrderDashboardSummary } from "@/lib/erp/orders-dashboard.functions";
import { money } from "./dashboard-kpis";

type Insight = { tone: "good" | "bad" | "warn" | "info"; text: string };

/** Auto-generated, data-driven callouts above the charts. */
export function DashboardInsights({
  summary,
  prev,
}: {
  summary: OrderDashboardSummary;
  prev?: OrderDashboardSummary | null;
}) {
  const k = summary.kpis;
  const out: Insight[] = [];

  if (prev?.kpis && prev.kpis.total_orders > 0) {
    const pct = ((k.total_orders - prev.kpis.total_orders) / prev.kpis.total_orders) * 100;
    out.push({
      tone: pct >= 0 ? "good" : "bad",
      text: `Orders ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% vs previous period (${prev.kpis.total_orders.toLocaleString()} → ${k.total_orders.toLocaleString()})`,
    });
  }

  const deliveryRate = k.total_orders ? (k.delivered_orders / k.total_orders) * 100 : 0;
  const returnRate = k.total_orders ? (k.returned_orders / k.total_orders) * 100 : 0;
  if (returnRate >= 10)
    out.push({ tone: "bad", text: `Return rate ${returnRate.toFixed(1)}% — ${k.returned_orders} orders, ${money(k.returned_value)} at risk` });
  else if (k.total_orders > 0)
    out.push({ tone: "good", text: `Return rate ${returnRate.toFixed(1)}% · delivery ${deliveryRate.toFixed(1)}%` });

  if (k.cod_outstanding > 0)
    out.push({ tone: "warn", text: `COD outstanding ${money(k.cod_outstanding)} — courier থেকে collect বাকি` });

  const worstCourier = (summary.couriers ?? [])
    .filter((c) => c.orders >= 10)
    .map((c) => ({ ...c, rr: (c.returned / c.orders) * 100 }))
    .sort((a, b) => b.rr - a.rr)[0];
  if (worstCourier && worstCourier.rr >= 12)
    out.push({ tone: "warn", text: `${worstCourier.courier}: ${worstCourier.rr.toFixed(0)}% return over ${worstCourier.orders} orders` });

  const topCity = (summary.cities ?? []).slice().sort((a, b) => b.orders - a.orders)[0];
  if (topCity)
    out.push({
      tone: "info",
      text: `Top city ${topCity.city} — ${topCity.orders} orders, ${money(topCity.value)}${topCity.orders ? ` (${((topCity.delivered / topCity.orders) * 100).toFixed(0)}% delivered)` : ""}`,
    });

  const topProduct = (summary.products ?? []).slice().sort((a, b) => b.value - a.value)[0];
  if (topProduct)
    out.push({ tone: "info", text: `Best seller ${topProduct.name ?? "—"} — ${topProduct.qty} pcs, ${money(topProduct.value)}` });

  const stuck = (summary.statuses ?? []).find((s) => s.status === "on_hold" || s.status === "advance_payment_pending");
  if (stuck && stuck.orders > 0)
    out.push({ tone: "warn", text: `${stuck.orders} orders ${statusBadge(stuck.status).label} — follow-up দরকার` });

  if (k.avg_confirm_to_delivery_hours > 96)
    out.push({ tone: "warn", text: `Confirm → delivery ${(k.avg_confirm_to_delivery_hours / 24).toFixed(1)} days — slow fulfilment` });

  if (!out.length) return null;

  const icon = { good: TrendingUp, bad: TrendingDown, warn: AlertTriangle, info: Lightbulb };
  const tones = {
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  return (
    <Card className="p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Insights</div>
      <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
        {out.slice(0, 9).map((i, idx) => {
          const Icon = icon[i.tone];
          return (
            <div key={idx} className="flex items-start gap-2 text-[13px]">
              <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tones[i.tone])} />
              <span>{i.text}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}