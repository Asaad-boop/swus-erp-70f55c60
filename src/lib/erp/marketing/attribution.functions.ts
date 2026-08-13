import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 4 — UTM explorer, funnel and attribution queue. */

export type MktUtmRow = {
  dim_value: string;
  orders: number;
  confirmed_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  returned_orders: number;
  booked_revenue: number;
  delivered_revenue: number;
  aov: number;
  delivery_rate: number;
  sessions: number;
};

export type MktFunnelRow = {
  impressions: number;
  reach: number;
  clicks: number;
  sessions: number;
  page_views: number;
  orders: number;
  confirmed_orders: number;
  shipped_orders: number;
  delivered_orders: number;
  returned_orders: number;
  cancelled_orders: number;
  spend: number;
  delivered_revenue: number;
};

export type MktCandidateRow = {
  id: string;
  order_id: string;
  brand_id: string | null;
  invoice_no: string | null;
  order_total: number;
  order_status: string;
  order_created_at: string;
  customer_name: string | null;
  source: string | null;
  confidence: number | null;
  matched_signal: Record<string, unknown> | null;
  suggested_campaign_id: string | null;
  suggested_campaign_name: string | null;
  created_at: string;
};

const Range = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getUtmBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    Range.extend({
      dim: z.enum(["source", "medium", "campaign", "content", "term", "landing"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_utm_breakdown", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
      _dim: data.dim,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktUtmRow[];
  });

export const getFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_funnel", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    const list = (Array.isArray(rows) ? rows : []) as MktFunnelRow[];
    return list[0] ?? null;
  });

export const getAttributionQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ brandIds: z.array(z.string().uuid()).min(1), limit: z.number().int().min(1).max(500).default(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_attribution_queue", {
      _brand_ids: data.brandIds,
      _limit: data.limit,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktCandidateRow[];
  });

export const resolveCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        candidateId: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: cand, error: cErr } = await context.supabase
      .from("mkt_attribution_candidates")
      .select("id, order_id, brand_id, suggested_campaign_id, confidence, matched_signal")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!cand) throw new Error("Candidate not found");

    if (data.action === "approve") {
      if (!cand.suggested_campaign_id) throw new Error("No suggested campaign to approve");
      const { error } = await context.supabase.from("mkt_order_attributions").insert({
        brand_id: cand.brand_id,
        order_id: cand.order_id,
        campaign_id: cand.suggested_campaign_id,
        source: "manual",
        confidence: cand.confidence ?? 1,
        note: "Approved from attribution queue",
      } as never);
      if (error) throw error;
    }

    const { error: uErr } = await context.supabase
      .from("mkt_attribution_candidates")
      .update({ status: data.action === "approve" ? "approved" : "rejected", updated_at: new Date().toISOString() } as never)
      .eq("id", data.candidateId);
    if (uErr) throw uErr;
    return { ok: true };
  });
