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
  returned_orders: number;
  cancelled_orders: number;
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
  roas: number | null;
  cpa: number | null;
  aov: number | null;
  margin_pct: number | null;
  delivery_rate: number | null;
  return_rate: number | null;
  cost_missing_units: number;
  cost_coverage_pct: number | null;
  stock: number;
  available_stock: number;
  low_stock_threshold: number | null;
  stock_cover_days: number | null;
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

    const perfRows = (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown>>;
    const productIds = perfRows
      .map((row) => typeof row.product_id === "string" ? row.product_id : null)
      .filter((id): id is string => Boolean(id));
    const inventoryByProduct = new Map<string, {
      stock: number;
      available_stock: number;
      low_stock_threshold: number | null;
    }>();
    if (productIds.length > 0) {
      const { data: inventory, error: inventoryError } = await context.supabase
        .from("products")
        .select("id,stock,available_stock,low_stock_threshold")
        .in("id", productIds);
      if (inventoryError) throw inventoryError;
      for (const item of inventory ?? []) {
        inventoryByProduct.set(item.id, {
          stock: Number(item.stock ?? 0),
          available_stock: Number(item.available_stock ?? item.stock ?? 0),
          low_stock_threshold: item.low_stock_threshold == null ? null : Number(item.low_stock_threshold),
        });
      }
    }

    const days = Math.max(1, Math.round((new Date(`${data.to}T00:00:00`).getTime() - new Date(`${data.from}T00:00:00`).getTime()) / 86_400_000) + 1);
    return perfRows.map((row) => {
      const productId = String(row.product_id ?? "");
      const inventory = inventoryByProduct.get(productId);
      const deliveredUnits = Number(row.delivered_units ?? 0);
      const dailyUnits = deliveredUnits / days;
      const availableStock = inventory?.available_stock ?? 0;
      return {
        ...row,
        product_id: productId,
        stock: inventory?.stock ?? 0,
        available_stock: availableStock,
        low_stock_threshold: inventory?.low_stock_threshold ?? null,
        stock_cover_days: dailyUnits > 0 ? availableStock / dailyUnits : null,
      } as MktProductRow;
    });
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
