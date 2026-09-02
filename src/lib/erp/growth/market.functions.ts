/**
 * Market Intelligence — product opportunity scoring.
 * Demand + margin come from get_sku_profit (canonical). Competition intensity is
 * only reported when rivals are actually tracked for the brand; otherwise null.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OpportunityRow = {
  product_id: string;
  title: string;
  sku: string | null;
  delivered_units: number;
  delivered_revenue: number;
  gross_profit: number;
  margin_pct: number | null;
  stock: number;
  demand_score: number | null;
  margin_score: number | null;
  competition_score: number | null;
  score: number | null;
  recommendation: string;
};

export type MarketOpportunity = {
  rows: OpportunityRow[];
  rivalsTracked: number;
  from: string;
  to: string;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

export const getMarketOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[]; from: string; to: string }) => d)
  .handler(async ({ data, context }): Promise<MarketOpportunity> => {
    const sb = context.supabase;
    const [profitResults, productsRes, rivalsRes] = await Promise.all([
      Promise.all(
        data.brandIds.map((b) =>
          sb.rpc("get_sku_profit", { _brand_id: b, _from: data.from, _to: data.to } as never),
        ),
      ),
      sb.from("products").select("id,title,sku,stock").in("brand_id", data.brandIds).limit(2000),
      sb.from("hub_competitors").select("id", { count: "exact", head: true }).in("brand_id", data.brandIds),
    ]);

    const meta = new Map<string, { title: string; sku: string | null; stock: number }>();
    for (const p of ((productsRes.data as any[]) ?? [])) {
      meta.set(String(p.id), { title: String(p.title), sku: p.sku ?? null, stock: num(p.stock) });
    }

    const agg = new Map<string, { units: number; revenue: number; profit: number }>();
    for (const res of profitResults) {
      for (const r of ((res.data as any[]) ?? [])) {
        const id = String(r.product_id);
        const cur = agg.get(id) ?? { units: 0, revenue: 0, profit: 0 };
        cur.units += num(r.delivered_units);
        cur.revenue += num(r.delivered_revenue);
        cur.profit += num(r.gross_profit);
        agg.set(id, cur);
      }
    }

    const rivalsTracked = rivalsRes.count ?? 0;
    const maxUnits = Math.max(1, ...[...agg.values()].map((v) => v.units));

    const rows: OpportunityRow[] = [...agg.entries()]
      .map(([id, v]) => {
        const m = meta.get(id);
        const marginPct = v.revenue > 0 ? (v.profit / v.revenue) * 100 : null;
        const demandScore = v.units > 0 ? Math.round((v.units / maxUnits) * 100) : 0;
        const marginScore = marginPct === null ? null : Math.max(0, Math.min(100, Math.round(marginPct * 2.5)));
        // Competition is only scored when rivals are actually tracked for the brand.
        const competitionScore = rivalsTracked > 0 ? Math.max(0, 100 - rivalsTracked * 10) : null;
        const parts = [demandScore, marginScore, competitionScore].filter(
          (n): n is number => n !== null,
        );
        const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
        let recommendation = "Insufficient data";
        if (score !== null) {
          if (score >= 70) recommendation = "Scale — high demand & healthy margin";
          else if (score >= 45) recommendation = "Watch — improve margin or creative before scaling";
          else recommendation = "Deprioritise — weak demand/margin";
        }
        return {
          product_id: id,
          title: m?.title ?? "(unknown product)",
          sku: m?.sku ?? null,
          delivered_units: v.units,
          delivered_revenue: v.revenue,
          gross_profit: v.profit,
          margin_pct: marginPct,
          stock: m?.stock ?? 0,
          demand_score: demandScore,
          margin_score: marginScore,
          competition_score: competitionScore,
          score,
          recommendation,
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 50);

    return { rows, rivalsTracked, from: data.from, to: data.to };
  });
