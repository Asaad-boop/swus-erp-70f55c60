/**
 * Command Center data layer.
 *
 * Every number here comes from a canonical source:
 *  - mkt_dashboard_kpis  → KPI strip (revenue, orders, CPA, ROAS, AOV, CVR...)
 *  - growth_day_pulse    → event-based profit / ad spend for the window
 *  - get_sku_profit      → product unit economics
 *  - get_campaign_profit → campaign unit economics
 * No cost or profit math is re-implemented in this file.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dhakaToday, monthBounds } from "./growth-daily.server";
import {
  buildAlerts,
  buildScore,
  type CampaignRow,
  type ContentRow,
  type GrowthAlert,
  type GrowthScore,
  type PeriodKpis,
  type ProductRow,
} from "./growth-intel.server";

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string(),
  to: z.string(),
});

export type TrendRow = { date: string; orders: number; revenue: number; spend: number };

export type CommandCenter = {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  current: PeriodKpis;
  previous: PeriodKpis;
  trend: TrendRow[];
  products: ProductRow[];
  campaigns: CampaignRow[];
  content: ContentRow[];
  goal: { label: string; target: number; achieved: number; expected: number; pacePct: number | null } | null;
  alerts: GrowthAlert[];
  score: GrowthScore;
  generatedAt: string;
};

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function diffDays(from: string, to: string) {
  return Math.max(
    1,
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1,
  );
}

function mapKpis(kpiRow: Record<string, unknown> | undefined, pulse: Record<string, unknown> | undefined): PeriodKpis {
  const revenue = num(kpiRow?.delivered_revenue);
  const orders = num(kpiRow?.orders);
  const adSpend = num(kpiRow?.spend_bdt);
  const clicks = num(kpiRow?.clicks);
  return {
    revenue,
    booked_revenue: num(kpiRow?.booked_revenue),
    orders,
    delivered_orders: num(kpiRow?.delivered_orders),
    profit: pulse ? num(pulse.net_profit) : num(kpiRow?.contribution_profit),
    ad_spend: adSpend,
    cpa: orders > 0 && adSpend > 0 ? adSpend / orders : null,
    roas: adSpend > 0 ? revenue / adSpend : null,
    aov: num(kpiRow?.delivered_orders) > 0 ? revenue / num(kpiRow?.delivered_orders) : null,
    cvr: clicks > 0 ? (orders / clicks) * 100 : nn(kpiRow?.conversion_rate),
    clicks,
    impressions: num(kpiRow?.impressions),
    return_rate: kpiRow?.return_rate === null || kpiRow?.return_rate === undefined ? null : Number(kpiRow.return_rate),
  };
}

export const getCommandCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof Input>) => Input.parse(d))
  .handler(async ({ data, context }): Promise<CommandCenter> => {
    const sb = context.supabase;
    const { brandIds, from, to } = data;
    const days = diffDays(from, to);
    const prevTo = shift(from, -1);
    const prevFrom = shift(prevTo, -(days - 1));
    const today = dhakaToday();
    const m = monthBounds(today);

    const kpi = (f: string, t: string) =>
      sb.rpc("mkt_dashboard_kpis", { _brand_ids: brandIds, _from: f, _to: t } as never);
    const pulse = (f: string, t: string) =>
      sb.rpc("growth_day_pulse", { _brand_ids: brandIds, _from: f, _to: t } as never);

    const [kpiCur, kpiPrev, pulseCur, pulsePrev, trendRes, goalsRes, mtdPulse, insightsRes, contentRes] =
      await Promise.all([
        kpi(from, to),
        kpi(prevFrom, prevTo),
        pulse(from, to),
        pulse(prevFrom, prevTo),
        sb.rpc("mkt_dashboard_trend", { _brand_ids: brandIds, _from: from, _to: to, _grain: "day" } as never),
        sb
          .from("hub_goals")
          .select("metric_key,target_value,period_start,period_end,brand_id")
          .not("metric_key", "is", null)
          .lte("period_start", `${m.start.slice(0, 8)}${String(m.daysInMonth).padStart(2, "0")}`)
          .gte("period_end", m.start),
        pulse(m.start, today),
        sb
          .from("mkt_insights_daily")
          .select("campaign_id,spend,spend_bdt_fifo,estimated_bdt_cost")
          .in("brand_id", brandIds)
          .gte("date", from)
          .lte("date", to)
          .not("campaign_id", "is", null)
          .limit(20000),
        sb
          .from("hub_content_plans")
          .select("id,title,platform,views,attributed_orders,publish_date,brand_id")
          .in("brand_id", brandIds)
          .gte("publish_date", from)
          .lte("publish_date", to)
          .limit(500),
      ]);

    const row = (r: { data: unknown }) => ((r.data as Record<string, unknown>[]) ?? [])[0];
    const current = mapKpis(row(kpiCur), row(pulseCur));
    const previous = mapKpis(row(kpiPrev), row(pulsePrev));

    const trend: TrendRow[] = ((trendRes.data as any[]) ?? []).map((r) => ({
      date: String(r.bucket).slice(0, 10),
      orders: num(r.orders),
      revenue: num(r.delivered_revenue),
      spend: num(r.spend_bdt),
    }));

    // ---- Products (canonical unit economics per brand) ----
    const skuResults = await Promise.all(
      brandIds.map((b) => sb.rpc("get_sku_profit", { _brand_id: b, _from: from, _to: to } as never)),
    );
    const skuMap = new Map<string, ProductRow>();
    for (const r of skuResults)
      for (const x of ((r.data as any[]) ?? [])) {
        const id = String(x.product_id);
        const prev = skuMap.get(id);
        const merged: ProductRow = {
          product_id: id,
          title: prev?.title ?? "",
          sku: prev?.sku ?? null,
          delivered_units: (prev?.delivered_units ?? 0) + num(x.delivered_units),
          delivered_revenue: (prev?.delivered_revenue ?? 0) + num(x.delivered_revenue),
          gross_profit: (prev?.gross_profit ?? 0) + num(x.gross_profit),
          stock: prev?.stock ?? 0,
          low_stock_threshold: prev?.low_stock_threshold ?? null,
        };
        skuMap.set(id, merged);
      }
    if (skuMap.size) {
      const { data: prods } = await sb
        .from("products")
        .select("id,title,sku,stock,low_stock_threshold")
        .in("id", [...skuMap.keys()]);
      for (const p of ((prods as any[]) ?? [])) {
        const t = skuMap.get(String(p.id));
        if (!t) continue;
        t.title = String(p.title ?? "Untitled");
        t.sku = p.sku ?? null;
        t.stock = num(p.stock);
        t.low_stock_threshold = nn(p.low_stock_threshold);
      }
    }
    const products = [...skuMap.values()].sort((a, b) => b.gross_profit - a.gross_profit);

    // ---- Campaigns ----
    const spendByCampaign = new Map<string, number>();
    for (const r of ((insightsRes.data as any[]) ?? [])) {
      const id = String(r.campaign_id);
      const s = num(r.spend_bdt_fifo) || num(r.estimated_bdt_cost);
      spendByCampaign.set(id, (spendByCampaign.get(id) ?? 0) + s);
    }
    const campResults = await Promise.all(
      brandIds.map((b) => sb.rpc("get_campaign_profit", { _brand_id: b, _from: from, _to: to } as never)),
    );
    const campMap = new Map<string, CampaignRow>();
    for (const r of campResults)
      for (const x of ((r.data as any[]) ?? [])) {
        const id = String(x.campaign_id);
        const prev = campMap.get(id);
        campMap.set(id, {
          campaign_id: id,
          name: prev?.name ?? "",
          spend: spendByCampaign.get(id) ?? 0,
          delivered_orders: (prev?.delivered_orders ?? 0) + num(x.delivered_orders),
          delivered_revenue: (prev?.delivered_revenue ?? 0) + num(x.delivered_revenue),
          gross_profit: (prev?.gross_profit ?? 0) + num(x.gross_profit),
          status: prev?.status ?? null,
          daily_budget: prev?.daily_budget ?? null,
        });
      }
    for (const [id, spend] of spendByCampaign)
      if (!campMap.has(id))
        campMap.set(id, {
          campaign_id: id,
          name: "",
          spend,
          delivered_orders: 0,
          delivered_revenue: 0,
          gross_profit: 0,
          status: null,
          daily_budget: null,
        });
    if (campMap.size) {
      const { data: cps } = await sb
        .from("mkt_campaigns")
        .select("id,name,effective_status,daily_budget")
        .in("id", [...campMap.keys()]);
      for (const c of ((cps as any[]) ?? [])) {
        const t = campMap.get(String(c.id));
        if (!t) continue;
        t.name = String(c.name ?? "Untitled campaign");
        t.status = c.effective_status ?? null;
        t.daily_budget = nn(c.daily_budget);
      }
    }
    const campaigns = [...campMap.values()]
      .filter((c) => c.name)
      .sort((a, b) => b.gross_profit - a.gross_profit);

    // ---- Content ----
    const content: ContentRow[] = ((contentRes.data as any[]) ?? []).map((c) => ({
      id: String(c.id),
      title: String(c.title ?? "Untitled"),
      platform: c.platform ?? null,
      views: num(c.views),
      attributed_orders: num(c.attributed_orders),
      published_at: c.publish_date ?? null,
    }));

    // ---- Monthly revenue goal + forecast ----
    let goal: CommandCenter["goal"] = null;
    const target = ((goalsRes.data as any[]) ?? [])
      .filter((g) => !g.brand_id || brandIds.includes(String(g.brand_id)))
      .filter((g) => ["delivered_revenue", "revenue", "monthly_revenue"].includes(String(g.metric_key)))
      .reduce((s, g) => s + num(g.target_value), 0);
    if (target > 0) {
      const achieved = num(row(mtdPulse)?.delivered_revenue);
      const dayOfMonth = Number(today.slice(8, 10));
      const expected = (achieved / Math.max(1, dayOfMonth)) * m.daysInMonth;
      goal = {
        label: "Monthly delivered revenue",
        target,
        achieved,
        expected,
        pacePct: target > 0 ? (expected / target) * 100 : null,
      };
    }

    const intelInput = {
      current,
      previous,
      products,
      campaigns,
      content,
      goal: goal ? { target: goal.target, achieved: goal.achieved, expected: goal.expected, label: goal.label } : null,
      days,
    };

    return {
      period: { from, to, prevFrom, prevTo, days },
      current,
      previous,
      trend,
      products: products.slice(0, 30),
      campaigns: campaigns.slice(0, 30),
      content,
      goal,
      alerts: buildAlerts(intelInput),
      score: buildScore(intelInput),
      generatedAt: new Date().toISOString(),
    };
  });

/* ---------------- Today's actions (hub_tasks) ---------------- */

export type ActionTask = {
  id: string;
  title: string;
  details: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  link_label: string | null;
};

export const listActionTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) => d)
  .handler(async ({ data, context }): Promise<ActionTask[]> => {
    const { data: rows } = await context.supabase
      .from("hub_tasks")
      .select("id,title,details,status,priority,due_date,assignee_id,link_label")
      .in("brand_id", data.brandIds)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(12);
    return ((rows as any[]) ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      details: r.details ?? null,
      status: String(r.status),
      priority: r.priority ?? null,
      due_date: r.due_date ?? null,
      assignee_id: r.assignee_id ?? null,
      link_label: r.link_label ?? null,
    }));
  });

export const createActionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { brandId: string; title: string; details?: string; priority?: string; linkLabel?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hub_tasks").insert({
      brand_id: data.brandId,
      title: data.title,
      details: data.details ?? null,
      priority: data.priority ?? "high",
      status: "todo",
      link_label: data.linkLabel ?? null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeActionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("hub_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
