import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Month-to-date daily actuals used by Monthly Projection.
 *
 * Canonical sources only (see mem: marketing-canonical-profit):
 *  - mkt_delivered_line_costs(brand, from, to) → delivered revenue / cogs / opex / orders per day
 *  - get_meta_spend_bdt(brand, from, to)       → ad spend (BDT) per day
 *
 * O(brands × 2) round-trips regardless of range length.
 */

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1).max(20),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ProjectionDay = {
  day: string;
  revenue: number;
  cogs: number;
  opex: number;
  units: number;
  orders: number;
  spend: number;
};

export type ProjectionActuals = {
  from: string;
  to: string;
  days: ProjectionDay[];
  totals: {
    revenue: number;
    cogs: number;
    opex: number;
    units: number;
    orders: number;
    spend: number;
    grossProfit: number;
    cost_missing_units: number;
  };
};

export const getProjectionActuals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ProjectionActuals> => {
    const { brandIds, from, to } = data;

    const byDay = new Map<string, ProjectionDay>();
    const orderSets = new Map<string, Set<string>>();
    let costMissing = 0;

    const touch = (day: string): ProjectionDay => {
      let d = byDay.get(day);
      if (!d) {
        d = { day, revenue: 0, cogs: 0, opex: 0, units: 0, orders: 0, spend: 0 };
        byDay.set(day, d);
        orderSets.set(day, new Set());
      }
      return d;
    };

    await Promise.all(
      brandIds.map(async (bid) => {
        const [lines, spend] = await Promise.all([
          context.supabase.rpc("mkt_delivered_line_costs", { _brand_id: bid, _from: from, _to: to }),
          context.supabase.rpc("get_meta_spend_bdt", { _brand_id: bid, _from: from, _to: to }),
        ]);
        for (const r of (lines.data ?? []) as Record<string, unknown>[]) {
          const day = String(r["day"] ?? "").slice(0, 10);
          if (!day) continue;
          const d = touch(day);
          d.revenue += Number(r["line_total"]) || 0;
          d.cogs += Number(r["line_cogs"]) || 0;
          d.opex += Number(r["operating_cost"]) || 0;
          d.units += Number(r["quantity"]) || 0;
          if (r["cost_missing"]) costMissing += Number(r["quantity"]) || 0;
          const oid = r["order_id"] ? String(r["order_id"]) : null;
          if (oid) orderSets.get(day)!.add(oid);
        }
        for (const r of (spend.data ?? []) as Record<string, unknown>[]) {
          const day = String(r["day"] ?? r["date"] ?? "").slice(0, 10);
          if (!day) continue;
          touch(day).spend += Number(r["spend_bdt"]) || 0;
        }
      }),
    );

    const days = [...byDay.values()]
      .map((d) => ({ ...d, orders: orderSets.get(d.day)?.size ?? 0 }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const totals = days.reduce(
      (a, d) => ({
        revenue: a.revenue + d.revenue,
        cogs: a.cogs + d.cogs,
        opex: a.opex + d.opex,
        units: a.units + d.units,
        orders: a.orders + d.orders,
        spend: a.spend + d.spend,
        grossProfit: 0,
        cost_missing_units: 0,
      }),
      { revenue: 0, cogs: 0, opex: 0, units: 0, orders: 0, spend: 0, grossProfit: 0, cost_missing_units: 0 },
    );
    totals.grossProfit = totals.revenue - totals.cogs - totals.opex;
    totals.cost_missing_units = costMissing;

    return { from, to, days, totals };
  });
