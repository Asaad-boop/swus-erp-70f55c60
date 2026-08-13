import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 2 — Campaign / Ad set / Ad workspace.
 * All metrics come from the canonical RPC `mkt_hierarchy_perf`
 * (spend = FIFO BDT, delivered revenue = rpt_delivered_statuses).
 */

export type MktNodeRow = {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  brand_id: string | null;
  daily_budget: number;
  lifetime_budget: number;
  target_roas: number | null;
  target_cpa: number | null;
  targeting: string | null;
  thumbnail: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  meta_purchases: number;
  ctr: number;
  cpc: number;
  cpm: number;
  orders: number;
  delivered_orders: number;
  revenue: number;
  booked_revenue: number;
  roas: number;
  booked_roas: number;
  cac: number;
  cpa: number;
};

const LevelInput = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["campaign", "adset", "ad"]),
  parentId: z.string().uuid().nullable().optional(),
});

export const getMktLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LevelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_hierarchy_perf", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
      _level: data.level,
      _parent_id: data.parentId ?? null,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktNodeRow[];
  });

export const setCampaignTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        targetRoas: z.number().min(0).max(1000).nullable(),
        targetCpa: z.number().min(0).max(10_000_000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mkt_campaigns")
      .update({ target_roas: data.targetRoas, target_cpa: data.targetCpa } as never)
      .eq("id", data.campaignId);
    if (error) throw error;
    return { ok: true };
  });

export const listUnassignedCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mkt_campaigns")
      .select("id,name,objective,status,effective_status,created_at")
      .is("brand_id", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as {
      id: string;
      name: string | null;
      objective: string | null;
      status: string | null;
      effective_status: string | null;
    }[];
  });

export const assignCampaignsToBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignIds: z.array(z.string().uuid()).min(1).max(200),
        brandId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const patch = { brand_id: data.brandId } as never;
    const { error } = await sb.from("mkt_campaigns").update(patch).in("id", data.campaignIds);
    if (error) throw error;
    // Cascade to children so metrics roll up under the same brand
    for (const table of ["mkt_adsets", "mkt_ads", "mkt_insights_daily"] as const) {
      const { error: e } = await sb.from(table).update(patch).in("campaign_id", data.campaignIds);
      if (e) throw e;
    }
    return { ok: true, count: data.campaignIds.length };
  });

export const getCampaignProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_campaign_products")
      .select("id, product_id, weight, products(title, sku)")
      .eq("campaign_id", data.campaignId);
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      product_id: r.product_id as string,
      weight: Number(r.weight ?? 1),
      title: (r.products?.title as string) ?? "—",
      sku: (r.products?.sku as string) ?? null,
    }));
  });
