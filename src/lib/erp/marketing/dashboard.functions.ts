import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marketing Home dashboard aggregator (Phase 1).
 * All numbers come from canonical RPCs:
 *   mkt_dashboard_kpis / mkt_dashboard_trend / get_campaign_profit /
 *   get_sku_profit / rpt_marketing_ads
 */

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grain: z.enum(["day", "week", "month"]).default("day"),
});

export type MktKpis = {
  spend_bdt: number; impressions: number; clicks: number; reach: number;
  booked_revenue: number; orders: number; confirmed_orders: number;
  cancelled_orders: number; returned_orders: number;
  delivered_orders: number; delivered_revenue: number; cogs: number;
  operating_cost: number; gross_profit: number; contribution_profit: number;
  cost_missing_units: number; new_customers: number; returning_customers: number;
  roas: number | null; delivered_roas: number | null; mer: number | null;
  cac: number | null; cpa: number | null; aov: number | null;
  conversion_rate: number | null; marketing_cost_pct: number | null;
  return_rate: number | null; cancel_rate: number | null;
};

export type MktTrendRow = {
  bucket: string; spend_bdt: number; delivered_revenue: number;
  delivered_orders: number; booked_revenue: number; orders: number; roas: number | null;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
const nullNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const getMarketingDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { brandIds, from, to, grain } = data;
    const sb = context.supabase;

    const [kpiRes, trendRes, adsRes, fxRes] = await Promise.all([
      sb.rpc("mkt_dashboard_kpis", { _brand_ids: brandIds, _from: from, _to: to } as never),
      sb.rpc("mkt_dashboard_trend", { _brand_ids: brandIds, _from: from, _to: to, _grain: grain } as never),
      sb.rpc("rpt_marketing_ads", { _brand_ids: brandIds, _from: from, _to: to } as never),
      sb.from("erp_fx_rates").select("rate").eq("from_ccy", "USD").eq("to_ccy", "BDT")
        .order("rate_date", { ascending: false }).limit(1),
    ]);
    if (kpiRes.error) throw kpiRes.error;
    if (trendRes.error) throw trendRes.error;

    const k = ((kpiRes.data as any[]) ?? [])[0] ?? {};
    const kpis: MktKpis = {
      spend_bdt: num(k.spend_bdt), impressions: num(k.impressions), clicks: num(k.clicks),
      reach: num(k.reach), booked_revenue: num(k.booked_revenue), orders: num(k.orders),
      confirmed_orders: num(k.confirmed_orders), cancelled_orders: num(k.cancelled_orders),
      returned_orders: num(k.returned_orders), delivered_orders: num(k.delivered_orders),
      delivered_revenue: num(k.delivered_revenue), cogs: num(k.cogs),
      operating_cost: num(k.operating_cost), gross_profit: num(k.gross_profit),
      contribution_profit: num(k.contribution_profit), cost_missing_units: num(k.cost_missing_units),
      new_customers: num(k.new_customers), returning_customers: num(k.returning_customers),
      roas: nullNum(k.roas), delivered_roas: nullNum(k.delivered_roas), mer: nullNum(k.mer),
      cac: nullNum(k.cac), cpa: nullNum(k.cpa), aov: nullNum(k.aov),
      conversion_rate: nullNum(k.conversion_rate), marketing_cost_pct: nullNum(k.marketing_cost_pct),
      return_rate: nullNum(k.return_rate), cancel_rate: nullNum(k.cancel_rate),
    };

    const trend: MktTrendRow[] = ((trendRes.data as any[]) ?? []).map((r) => ({
      bucket: String(r.bucket).slice(0, 10),
      spend_bdt: num(r.spend_bdt),
      delivered_revenue: num(r.delivered_revenue),
      delivered_orders: num(r.delivered_orders),
      booked_revenue: num(r.booked_revenue),
      orders: num(r.orders),
      roas: nullNum(r.roas),
    }));

    const fxRate = Number(fxRes.data?.[0]?.rate ?? 0) || 0;

    // Per-campaign delivered profit (canonical) + campaign spend from insights
    const profitPerBrand = await Promise.all(
      brandIds.map((bid) =>
        Promise.all([
          sb.rpc("get_campaign_profit", { _brand_id: bid, _from: from, _to: to } as never),
          sb.rpc("get_sku_profit", { _brand_id: bid, _from: from, _to: to } as never),
        ]),
      ),
    );

    const campProfit = new Map<string, { revenue: number; profit: number; orders: number }>();
    const skuProfit = new Map<string, { revenue: number; profit: number; units: number }>();
    for (const [cp, sp] of profitPerBrand) {
      for (const r of ((cp.data as any[]) ?? [])) {
        const id = String(r.campaign_id);
        const cur = campProfit.get(id) ?? { revenue: 0, profit: 0, orders: 0 };
        cur.revenue += num(r.delivered_revenue);
        cur.profit += num(r.gross_profit);
        cur.orders += num(r.delivered_orders);
        campProfit.set(id, cur);
      }
      for (const r of ((sp.data as any[]) ?? [])) {
        const id = String(r.product_id);
        const cur = skuProfit.get(id) ?? { revenue: 0, profit: 0, units: 0 };
        cur.revenue += num(r.delivered_revenue);
        cur.profit += num(r.gross_profit);
        cur.units += num(r.delivered_units);
        skuProfit.set(id, cur);
      }
    }

    const insights = await sb
      .from("mkt_insights_daily")
      .select("campaign_id,spend,spend_bdt_fifo")
      .in("brand_id", brandIds)
      .gte("date", from)
      .lte("date", to);
    if (insights.error) throw insights.error;

    const campSpend = new Map<string, number>();
    for (const r of insights.data ?? []) {
      if (!r.campaign_id) continue;
      const fifo = Number(r.spend_bdt_fifo) || 0;
      const bdt = fifo > 0 ? fifo : (Number(r.spend) || 0) * fxRate;
      campSpend.set(r.campaign_id, (campSpend.get(r.campaign_id) ?? 0) + bdt);
    }

    const campIds = Array.from(new Set([...campSpend.keys(), ...campProfit.keys()]));
    let campNames = new Map<string, string>();
    if (campIds.length) {
      const cn = await sb.from("mkt_campaigns").select("id,name").in("id", campIds);
      for (const c of cn.data ?? []) campNames.set(c.id, c.name ?? "—");
    }
    const topCampaigns = campIds
      .map((id) => {
        const spend = campSpend.get(id) ?? 0;
        const p = campProfit.get(id) ?? { revenue: 0, profit: 0, orders: 0 };
        return {
          id,
          name: campNames.get(id) ?? "Unmapped campaign",
          spend,
          delivered_revenue: p.revenue,
          delivered_orders: p.orders,
          gross_profit: p.profit,
          roas: spend > 0 ? p.revenue / spend : null,
          contribution: p.profit - spend,
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);

    const prodIds = Array.from(skuProfit.keys());
    let prodNames = new Map<string, string>();
    if (prodIds.length) {
      const pn = await sb.from("products").select("id,title").in("id", prodIds);
      for (const p of pn.data ?? []) prodNames.set(p.id, p.title ?? "—");
    }
    const topProducts = prodIds
      .map((id) => ({ id, name: prodNames.get(id) ?? "—", ...skuProfit.get(id)! }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const adRows = (Array.isArray(adsRes.data) ? (adsRes.data as any[]) : []) as any[];
    const topAds = adRows
      .map((r) => ({
        id: String(r.ad_id),
        name: String(r.ad_name ?? "—"),
        campaign: String(r.campaign_name ?? "—"),
        spend: num(r.spend),
        orders: num(r.orders),
        revenue: num(r.revenue),
        roas: num(r.roas),
        ctr: num(r.ctr),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);

    return { kpis, trend, topCampaigns, topProducts, topAds };
  });
