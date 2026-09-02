/**
 * Analytics funnel — every step comes from mkt_dashboard_kpis (canonical).
 * No step is estimated; missing stages are returned as null.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FunnelStep = {
  key: string;
  label: string;
  value: number | null;
  /** conversion from previous available step, % */
  cvr: number | null;
};

export type FunnelResult = {
  steps: FunnelStep[];
  biggestDropKey: string | null;
  source: string;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const getGrowthFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[]; from: string; to: string }) => d)
  .handler(async ({ data, context }): Promise<FunnelResult> => {
    const { data: rows, error } = await context.supabase.rpc("mkt_dashboard_kpis", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw new Error(error.message);
    const k = ((rows as any[]) ?? [])[0] ?? {};

    const raw: { key: string; label: string; value: number | null }[] = [
      { key: "impressions", label: "Impressions", value: num(k.impressions) },
      { key: "clicks", label: "Clicks", value: num(k.clicks) },
      { key: "orders", label: "Orders", value: num(k.orders) },
      { key: "confirmed", label: "Confirmed", value: num(k.confirmed_orders) },
      { key: "delivered", label: "Delivered", value: num(k.delivered_orders) },
    ];

    let prev: number | null = null;
    let biggestDropKey: string | null = null;
    let biggestDrop = -1;
    const steps: FunnelStep[] = raw.map((s) => {
      let cvr: number | null = null;
      if (prev !== null && prev > 0 && s.value !== null) {
        cvr = (s.value / prev) * 100;
        const drop = prev - s.value;
        if (drop > biggestDrop) {
          biggestDrop = drop;
          biggestDropKey = s.key;
        }
      }
      if (s.value !== null) prev = s.value;
      return { ...s, cvr };
    });

    return { steps, biggestDropKey, source: "mkt_dashboard_kpis" };
  });
