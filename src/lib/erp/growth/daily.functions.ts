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

export type GrowthDailyPulse = {
  today: string;
  windows: {
    today: DailyWindowKpis;
    yesterday: DailyWindowKpis;
    last7: DailyWindowKpis;
    mtd: DailyWindowKpis;
  };
  month: { start: string; daysInMonth: number; dayOfMonth: number; daysLeft: number };
  adAccounts: { id: string; name: string; status: string; last_error: string | null }[];
  lastSpendDate: string | null;
};

export const getGrowthDailyPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<GrowthDailyPulse> => {
    const sb = context.supabase;
    const today = dhakaToday();
    const yest = dhakaShift(today, -1);
    const m = monthBounds(today);

    const kpi = (from: string, to: string) =>
      sb.rpc("mkt_dashboard_kpis", { _brand_ids: data.brandIds, _from: from, _to: to } as never);

    const [t, y, w, mtd, accts, lastSpend] = await Promise.all([
      kpi(today, today),
      kpi(yest, yest),
      kpi(dhakaShift(today, -6), today),
      kpi(m.start, today),
      sb
        .from("mkt_ad_accounts")
        .select("id,name,status,last_error")
        .overlaps("brand_ids", data.brandIds),
      sb
        .from("mkt_insights_daily")
        .select("date")
        .in("brand_id", data.brandIds)
        .gt("spend", 0)
        .order("date", { ascending: false })
        .limit(1),
    ]);

    const first = (r: { data: unknown }) =>
      mapWindow(((r.data as Record<string, unknown>[]) ?? [])[0]);

    return {
      today,
      windows: { today: first(t), yesterday: first(y), last7: first(w), mtd: first(mtd) },
      month: m,
      adAccounts: ((accts.data as any[]) ?? []).map((a) => ({
        id: String(a.id),
        name: String(a.name ?? "—"),
        status: String(a.status ?? "unknown"),
        last_error: a.last_error ?? null,
      })),
      lastSpendDate: (lastSpend.data as any[])?.[0]?.date ?? null,
    };
  });
