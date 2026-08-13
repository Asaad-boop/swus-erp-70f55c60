import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 5 — Product marketing P&L + customer acquisition / LTV. */

export type MktProductRow = {
  product_id: string;
  title: string;
  sku: string | null;
  image: string | null;
  orders: number;
  delivered_orders: number;
  delivered_units: number;
  delivered_revenue: number;
  booked_revenue: number;
  cogs: number;
  operating_cost: number;
  gross_profit: number;
  ad_spend: number;
  net_profit: number;
  attributed_orders: number;
  attributed_delivered_orders: number;
  roas: number;
  cpa: number;
  aov: number;
  margin_pct: number;
  cost_missing_units: number;
};

export type MktAcquisitionSummary = {
  new_customers: number;
  returning_customers: number;
  active_customers: number;
  new_orders: number;
  returning_orders: number;
  new_revenue: number;
  returning_revenue: number;
  spend: number;
  cac: number;
  ltv: number;
  ltv_cac: number;
  orders_per_customer: number;
  repeat_rate: number;
};

export type MktCohortRow = {
  cohort_month: string;
  customers: number;
  orders: number;
  revenue: number;
  repeat_customers: number;
  repeat_rate: number;
  ltv: number;
};

export type MktAcquisition = {
  summary: MktAcquisitionSummary | null;
  cohorts: MktCohortRow[];
};

const Range = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getProductMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_product_perf", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktProductRow[];
  });

export const getAcquisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("mkt_acquisition", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    const obj = (res ?? {}) as any;
    return {
      summary: (obj.summary ?? null) as MktAcquisitionSummary | null,
      cohorts: (Array.isArray(obj.cohorts) ? obj.cohorts : []) as MktCohortRow[],
    } satisfies MktAcquisition;
  });
