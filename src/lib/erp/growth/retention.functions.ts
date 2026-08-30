import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minDaysSince: z.number().int().min(7).max(365).default(45),
});

export type RetentionSummary = {
  customers: number;
  new_customers: number;
  repeat_customers: number;
  repeat_rate: number | null;
  orders: number;
  avg_orders_per_customer: number | null;
  revenue: number;
  avg_ltv: number | null;
  median_gap_days: number | null;
  multi_item_order_pct: number | null;
  aov_single: number | null;
  aov_multi: number | null;
};

export type WinbackRow = {
  phone: string;
  name: string | null;
  orders: number;
  total_spent: number;
  last_order_at: string;
  days_since: number;
  last_product: string | null;
};

export type CoPurchaseRow = {
  product_a: string;
  name_a: string;
  product_b: string;
  name_b: string;
  pair_orders: number;
  a_orders: number;
  attach_rate: number | null;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
const nullNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const getGrowthRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { brandIds, from, to, minDaysSince } = data;

    const [sumRes, winRes, pairRes] = await Promise.all([
      sb.rpc("growth_retention_summary", {
        _brand_ids: brandIds,
        _from: from,
        _to: to,
      } as never),
      sb.rpc("growth_winback", {
        _brand_ids: brandIds,
        _min_days: minDaysSince,
        _limit: 60,
      } as never),
      sb.rpc("growth_copurchase", {
        _brand_ids: brandIds,
        _from: from,
        _to: to,
        _limit: 25,
      } as never),
    ]);
    if (sumRes.error) throw sumRes.error;
    if (winRes.error) throw winRes.error;
    if (pairRes.error) throw pairRes.error;

    const s = ((sumRes.data as any[]) ?? [])[0] ?? {};
    const summary: RetentionSummary = {
      customers: num(s.customers),
      new_customers: num(s.new_customers),
      repeat_customers: num(s.repeat_customers),
      repeat_rate: nullNum(s.repeat_rate),
      orders: num(s.orders),
      avg_orders_per_customer: nullNum(s.avg_orders_per_customer),
      revenue: num(s.revenue),
      avg_ltv: nullNum(s.avg_ltv),
      median_gap_days: nullNum(s.median_gap_days),
      multi_item_order_pct: nullNum(s.multi_item_order_pct),
      aov_single: nullNum(s.aov_single),
      aov_multi: nullNum(s.aov_multi),
    };

    const winback: WinbackRow[] = ((winRes.data as any[]) ?? []).map((r) => ({
      phone: String(r.phone),
      name: r.name ?? null,
      orders: num(r.orders),
      total_spent: num(r.total_spent),
      last_order_at: String(r.last_order_at),
      days_since: num(r.days_since),
      last_product: r.last_product ?? null,
    }));

    const pairs: CoPurchaseRow[] = ((pairRes.data as any[]) ?? []).map((r) => ({
      product_a: String(r.product_a),
      name_a: String(r.name_a ?? "—"),
      product_b: String(r.product_b),
      name_b: String(r.name_b ?? "—"),
      pair_orders: num(r.pair_orders),
      a_orders: num(r.a_orders),
      attach_rate: nullNum(r.attach_rate),
    }));

    return { summary, winback, pairs };
  });
