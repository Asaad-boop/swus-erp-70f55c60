import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 3 — Creative Library. Metrics come from canonical RPC `mkt_creative_perf`. */

export type MktCreativeRow = {
  creative_key: string;
  name: string;
  thumbnail: string | null;
  body: string;
  ad_count: number;
  brand_id: string | null;
  active: boolean;
  creative_type: string | null;
  hook: string | null;
  angle: string | null;
  creator: string | null;
  meta_status: string | null;
  notes: string | null;
  product_id: string | null;
  last_active: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  meta_purchases: number;
  frequency: number;
  ctr: number;
  ctr_7: number;
  spend_7: number;
  cpc: number;
  cpm: number;
  orders: number;
  delivered_orders: number;
  revenue: number;
  booked_revenue: number;
  roas: number;
  booked_roas: number;
  cpa: number;
  cac: number;
  fatigued: boolean;
  winning: boolean;
};

const RangeInput = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getCreatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_creative_perf", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktCreativeRow[];
  });

export const saveCreativeMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        creativeKey: z.string().min(1),
        brandId: z.string().uuid(),
        creativeType: z.string().max(60).nullable(),
        hook: z.string().max(200).nullable(),
        angle: z.string().max(200).nullable(),
        creator: z.string().max(120).nullable(),
        status: z.string().max(40).nullable(),
        notes: z.string().max(1000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mkt_creative_meta")
      .upsert(
        {
          brand_id: data.brandId,
          creative_key: data.creativeKey,
          creative_type: data.creativeType,
          hook: data.hook,
          angle: data.angle,
          creator: data.creator,
          status: data.status ?? "active",
          notes: data.notes,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "brand_id,creative_key" },
      );
    if (error) throw error;
    return { ok: true };
  });