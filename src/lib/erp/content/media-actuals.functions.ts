import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSkuProfitMap, getBrandProfitTotals } from "@/lib/erp/marketing/canonical.server";

const Input = z.object({
  plans: z
    .array(
      z.object({
        id: z.string().uuid(),
        brand_id: z.string().uuid().nullable(),
        product_id: z.string().uuid().nullable(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .max(50),
});

export type MediaPlanActual = {
  plan_id: string;
  delivered_units: number;
  delivered_revenue: number;
  gross_profit: number;
  ad_spend: number;
};

/**
 * Live actuals for media plans. Revenue/COGS come from the canonical marketing
 * RPCs (get_sku_profit / mkt_delivered_line_costs), ad spend from
 * get_meta_spend_bdt — never hand-rolled here.
 */
export const getMediaPlanActuals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<MediaPlanActual[]> => {
    const out: MediaPlanActual[] = [];
    for (const p of data.plans) {
      if (!p.brand_id) {
        out.push({
          plan_id: p.id,
          delivered_units: 0,
          delivered_revenue: 0,
          gross_profit: 0,
          ad_spend: 0,
        });
        continue;
      }
      const [profit, spend] = await Promise.all([
        p.product_id
          ? getSkuProfitMap(context.supabase, p.brand_id, p.start_date, p.end_date).then(
              (m) => m.get(p.product_id as string) ?? null,
            )
          : getBrandProfitTotals(context.supabase, p.brand_id, p.start_date, p.end_date),
        context.supabase.rpc("get_meta_spend_bdt", {
          _brand_id: p.brand_id,
          _from: p.start_date,
          _to: p.end_date,
        }),
      ]);
      const spendRows = (spend.data ?? []) as { spend_bdt?: number | string }[];
      const adSpend = spendRows.reduce((s, r) => s + (Number(r.spend_bdt) || 0), 0);
      out.push({
        plan_id: p.id,
        delivered_units: profit?.delivered_units ?? 0,
        delivered_revenue: profit?.delivered_revenue ?? 0,
        gross_profit: profit?.gross_profit ?? 0,
        ad_spend: adSpend,
      });
    }
    return out;
  });