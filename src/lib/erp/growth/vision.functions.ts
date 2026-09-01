import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dhakaShift,
  dhakaToday,
  mapWindow,
  monthBounds,
  type DailyWindowKpis,
} from "./growth-daily.server";

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
});

export type TeamScoreRow = {
  user_id: string;
  name: string;
  confirmed_orders: number;
  confirmed_value: number;
  delivered_orders: number;
  delivered_value: number;
  calls: number;
};

export type VisionTrendRow = { date: string; orders: number; revenue: number; spend: number };

export type VisionTargets = {
  orders: number;
  delivered_orders: number;
  delivered_revenue: number;
  ad_spend: number;
};

export type GrowthVision = {
  today: string;
  week: { start: string; end: string; dayIndex: number };
  month: { start: string; end: string; daysInMonth: number; dayOfMonth: number; daysLeft: number };
  windows: {
    today: DailyWindowKpis;
    yesterday: DailyWindowKpis;
    week: DailyWindowKpis;
    prevWeek: DailyWindowKpis;
    mtd: DailyWindowKpis;
    prevMonth: DailyWindowKpis;
  };
  targets: VisionTargets;
  trend: VisionTrendRow[];
  team: { today: TeamScoreRow[]; week: TeamScoreRow[]; month: TeamScoreRow[] };
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

/** Monday-start week bounds for an Asia/Dhaka date string. */
function weekBounds(today: string) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun
  const back = (dow + 6) % 7;
  const start = dhakaShift(today, -back);
  return { start, end: dhakaShift(start, 6), dayIndex: back + 1 };
}

const TARGET_KEYS: Record<string, keyof VisionTargets> = {
  orders: "orders",
  delivered_orders: "delivered_orders",
  delivered_revenue: "delivered_revenue",
  ad_spend: "ad_spend",
};

export const getGrowthVision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<GrowthVision> => {
    const sb = context.supabase;
    const brandIds = data.brandIds;
    const today = dhakaToday();
    const yest = dhakaShift(today, -1);
    const w = weekBounds(today);
    const m = monthBounds(today);
    const monthEnd = dhakaShift(`${today.slice(0, 7)}-01`, m.daysInMonth - 1);
    const prevMonthEnd = dhakaShift(m.start, -1);
    const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;

    const kpi = (from: string, to: string) =>
      sb.rpc("mkt_dashboard_kpis", { _brand_ids: brandIds, _from: from, _to: to } as never);
    const team = (from: string, to: string) =>
      sb.rpc("growth_team_scoreboard", { _brand_ids: brandIds, _from: from, _to: to } as never);

    const [t, y, wk, pw, mtd, pm, trendRes, goalsRes, teamToday, teamWeek, teamMonth] =
      await Promise.all([
        kpi(today, today),
        kpi(yest, yest),
        kpi(w.start, today),
        kpi(dhakaShift(w.start, -7), dhakaShift(w.start, -1)),
        kpi(m.start, today),
        kpi(prevMonthStart, prevMonthEnd),
        sb.rpc("mkt_dashboard_trend", {
          _brand_ids: brandIds,
          _from: m.start,
          _to: today,
          _grain: "day",
        } as never),
        sb
          .from("hub_goals")
          .select("metric_key,target_value,period_start,period_end,brand_id")
          .not("metric_key", "is", null)
          .lte("period_start", monthEnd)
          .gte("period_end", m.start),
        team(today, today),
        team(w.start, today),
        team(m.start, today),
      ]);

    const first = (r: { data: unknown }) =>
      mapWindow(((r.data as Record<string, unknown>[]) ?? [])[0]);

    const targets: VisionTargets = {
      orders: 0,
      delivered_orders: 0,
      delivered_revenue: 0,
      ad_spend: 0,
    };
    for (const g of ((goalsRes.data as any[]) ?? [])) {
      if (g.brand_id && !brandIds.includes(String(g.brand_id))) continue;
      const key = TARGET_KEYS[String(g.metric_key)];
      if (key) targets[key] += num(g.target_value);
    }

    const trend: VisionTrendRow[] = ((trendRes.data as any[]) ?? []).map((r) => ({
      date: String(r.bucket).slice(0, 10),
      orders: num(r.orders),
      revenue: num(r.delivered_revenue),
      spend: num(r.spend_bdt),
    }));

    const mapTeam = (r: { data: unknown }): TeamScoreRow[] =>
      ((r.data as any[]) ?? []).map((x) => ({
        user_id: String(x.user_id),
        name: String(x.name ?? "Unknown"),
        confirmed_orders: num(x.confirmed_orders),
        confirmed_value: num(x.confirmed_value),
        delivered_orders: num(x.delivered_orders),
        delivered_value: num(x.delivered_value),
        calls: num(x.calls),
      }));

    return {
      today,
      week: w,
      month: { ...m, end: monthEnd },
      windows: {
        today: first(t),
        yesterday: first(y),
        week: first(wk),
        prevWeek: first(pw),
        mtd: first(mtd),
        prevMonth: first(pm),
      },
      targets,
      trend,
      team: { today: mapTeam(teamToday), week: mapTeam(teamWeek), month: mapTeam(teamMonth) },
    };
  });
