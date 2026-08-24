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
      .select("id, product_id, weight, note, products(title, sku, image)")
      .eq("campaign_id", data.campaignId);
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      product_id: r.product_id as string,
      weight: Number(r.weight ?? 1),
      note: (r.note as string) ?? null,
      title: (r.products?.title as string) ?? "—",
      sku: (r.products?.sku as string) ?? null,
      image: (r.products?.image as string) ?? null,
    }));
  });

export type CampaignProductPerf = {
  product_id: string;
  title: string;
  sku: string | null;
  image: string | null;
  orders: number;
  qty: number;
  delivered_orders: number;
  delivered_qty: number;
  revenue: number;
  booked_revenue: number;
  cogs: number;
  gross_profit: number;
  linked: boolean;
  weight: number;
};

/** Products that actually sold through this campaign's attributed orders. */
export const getCampaignProductPerf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_campaign_product_perf", {
      _campaign_id: data.campaignId,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as CampaignProductPerf[];
  });

export const searchProductsForCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const term = data.q.trim();
    let query = context.supabase
      .from("products")
      .select("id, title, sku, image")
      .order("created_at", { ascending: false })
      .limit(25);
    if (term) query = query.or(`title.ilike.%${term}%,sku.ilike.%${term}%`);
    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []) as { id: string; title: string; sku: string | null; image: string | null }[];
  });

export const linkCampaignProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        productIds: z.array(z.string().uuid()).min(1).max(100),
        weight: z.number().min(0).max(100).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: camp, error: cErr } = await sb
      .from("mkt_campaigns")
      .select("brand_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!camp?.brand_id) throw new Error("Campaign-e brand assign kora nei — age brand assign korun.");
    const rows = data.productIds.map((pid) => ({
      campaign_id: data.campaignId,
      product_id: pid,
      brand_id: camp.brand_id,
      weight: data.weight,
    }));
    const { error } = await sb
      .from("mkt_campaign_products")
      .upsert(rows as never, { onConflict: "campaign_id,product_id" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

export const unlinkCampaignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().uuid(), productId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mkt_campaign_products")
      .delete()
      .eq("campaign_id", data.campaignId)
      .eq("product_id", data.productId);
    if (error) throw error;
    return { ok: true };
  });

export const setCampaignProductWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        productId: z.string().uuid(),
        weight: z.number().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mkt_campaign_products")
      .update({ weight: data.weight } as never)
      .eq("campaign_id", data.campaignId)
      .eq("product_id", data.productId);
    if (error) throw error;
    return { ok: true };
  });


/** Linked product counts for a set of campaigns (row badges). */
export const getCampaignProductCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignIds: z.array(z.string().uuid()).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.campaignIds.length === 0) return {} as Record<string, number>;
    const { data: rows, error } = await context.supabase
      .from("mkt_campaign_products")
      .select("campaign_id")
      .in("campaign_id", data.campaignIds);
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of rows ?? []) out[(r as any).campaign_id] = (out[(r as any).campaign_id] ?? 0) + 1;
    return out;
  });

/* ------------------------------------------------------------------ */
/* Bulk product linking (SKU / CSV paste)                              */
/* ------------------------------------------------------------------ */

export type BulkLinkResult = {
  linked: number;
  matched: { sku: string; product_id: string; title: string }[];
  alreadyLinked: string[];
  notFound: string[];
};

export const bulkLinkCampaignProductsBySku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        raw: z.string().min(1).max(50_000),
        weight: z.number().min(0).max(100).default(1),
        dryRun: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BulkLinkResult> => {
    const sb = context.supabase;

    // Accept newline / comma / tab / semicolon separated. For CSV rows we take
    // the first non-empty cell of each line (typical "sku,qty,note" exports).
    const tokens = Array.from(
      new Set(
        data.raw
          .split(/\r?\n/)
          .flatMap((line) => {
            const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
            const first = cells.find((c) => c.length > 0);
            return first ? [first] : [];
          })
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !/^sku$/i.test(s)),
      ),
    ).slice(0, 500);

    if (tokens.length === 0) return { linked: 0, matched: [], alreadyLinked: [], notFound: [] };

    const { data: camp, error: cErr } = await sb
      .from("mkt_campaigns")
      .select("brand_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!camp?.brand_id)
      throw new Error("Campaign-e brand assign kora nei — age brand assign korun.");

    const { data: prods, error: pErr } = await sb
      .from("products")
      .select("id, title, sku")
      .in("sku", tokens);
    if (pErr) throw pErr;

    // Fall back to variant SKUs for anything unmatched.
    const bySku = new Map<string, { id: string; title: string }>();
    for (const p of prods ?? [])
      if ((p as any).sku) bySku.set(String((p as any).sku).toLowerCase(), { id: (p as any).id, title: (p as any).title });

    const missing = tokens.filter((t) => !bySku.has(t.toLowerCase()));
    if (missing.length > 0) {
      const { data: vars, error: vErr } = await sb
        .from("product_variants")
        .select("sku, product_id, products(title)")
        .in("sku", missing);
      if (vErr) throw vErr;
      for (const v of vars ?? []) {
        const sku = String((v as any).sku ?? "").toLowerCase();
        if (sku && !bySku.has(sku))
          bySku.set(sku, {
            id: (v as any).product_id,
            title: ((v as any).products?.title as string) ?? "—",
          });
      }
    }

    const matched: BulkLinkResult["matched"] = [];
    const notFound: string[] = [];
    for (const t of tokens) {
      const hit = bySku.get(t.toLowerCase());
      if (hit) matched.push({ sku: t, product_id: hit.id, title: hit.title });
      else notFound.push(t);
    }

    const { data: existing, error: eErr } = await sb
      .from("mkt_campaign_products")
      .select("product_id")
      .eq("campaign_id", data.campaignId);
    if (eErr) throw eErr;
    const already = new Set((existing ?? []).map((r: any) => r.product_id as string));

    const fresh = matched.filter((m) => !already.has(m.product_id));
    const alreadyLinked = matched.filter((m) => already.has(m.product_id)).map((m) => m.sku);

    if (!data.dryRun && fresh.length > 0) {
      const rows = fresh.map((m) => ({
        campaign_id: data.campaignId,
        product_id: m.product_id,
        brand_id: camp.brand_id,
        weight: data.weight,
      }));
      const { error } = await sb
        .from("mkt_campaign_products")
        .upsert(rows as never, { onConflict: "campaign_id,product_id" });
      if (error) throw error;
    }

    return { linked: data.dryRun ? 0 : fresh.length, matched, alreadyLinked, notFound };
  });

/* ------------------------------------------------------------------ */
/* Automatic product match suggestions                                 */
/* ------------------------------------------------------------------ */

export type ProductMatchSuggestion = {
  product_id: string;
  title: string;
  sku: string | null;
  image: string | null;
  qty: number;
  orders: number;
  revenue: number;
  title_sim: number;
  sku_hit: boolean;
  reason: string;
  score: number;
};

export const getProductMatchSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_product_match_suggestions", {
      _campaign_id: data.campaignId,
      _from: data.from,
      _to: data.to,
      _limit: data.limit,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as ProductMatchSuggestion[];
  });

/* ------------------------------------------------------------------ */
/* Attribution audit                                                    */
/* ------------------------------------------------------------------ */

export type AttributionPathStep = {
  event_type: string;
  at: string;
  url: string | null;
  referrer: string | null;
  utm_campaign: string | null;
  utm_source: string | null;
};

export type AttributionAuditRow = {
  order_id: string;
  invoice_no: string | null;
  created_at: string;
  status: string;
  confirmation_status: string | null;
  web_status: string | null;
  order_source: string | null;
  total: number;
  customer_name: string | null;
  phone: string | null;
  outcome: "delivered" | "returned" | "cancelled" | "in_progress";
  attr_source: string;
  confidence: number;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  note: string | null;
  match_rule: string;
  products: { product_id: string | null; title: string; sku: string | null; qty: number }[];
  path: AttributionPathStep[];
  step_count: number;
  first_touch: string | null;
  last_touch: string | null;
};

export const getAttributionAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        campaignId: z.string().uuid().nullable().optional(),
        outcome: z.enum(["all", "delivered", "returned", "cancelled", "in_progress"]).default("all"),
        search: z.string().max(120).nullable().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_attribution_audit", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
      _campaign_id: data.campaignId ?? null,
      _outcome: data.outcome,
      _search: data.search ?? null,
      _limit: data.limit,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as AttributionAuditRow[];
  });

/* ------------------------------------------------------------------ */
/* Budget pacing                                                        */
/* ------------------------------------------------------------------ */

export type BudgetPacingRow = {
  campaign_id: string;
  name: string;
  status: string;
  daily_budget: number;
  planned: number;
  has_budget_row: boolean;
  scaling_status: string | null;
  spend: number;
  expected_to_date: number;
  pace_pct: number | null;
  projected_spend: number;
  remaining: number;
  avg_daily_spend: number;
  required_daily: number;
  days_elapsed: number;
  total_days: number;
  orders: number;
  delivered_orders: number;
  revenue: number;
  roas: number;
  target_roas: number | null;
  pace_state: "over" | "under" | "on_track" | "no_plan";
};

export const getBudgetPacing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_budget_pacing", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as BudgetPacingRow[];
  });

export const upsertCampaignBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        plannedSpend: z.number().min(0).max(100_000_000),
        targetRoas: z.number().min(0).max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: camp, error: cErr } = await sb
      .from("mkt_campaigns")
      .select("brand_id, name")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!camp?.brand_id) throw new Error("Campaign-e brand assign kora nei.");

    const { data: existing, error: eErr } = await sb
      .from("mkt_budgets")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("period_start", data.periodStart)
      .eq("period_end", data.periodEnd)
      .maybeSingle();
    if (eErr) throw eErr;

    const payload = {
      brand_id: camp.brand_id,
      campaign_id: data.campaignId,
      name: camp.name ?? "Campaign budget",
      period_start: data.periodStart,
      period_end: data.periodEnd,
      planned_spend: data.plannedSpend,
      target_roas: data.targetRoas ?? null,
    } as never;

    if (existing?.id) {
      const { error } = await sb.from("mkt_budgets").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("mkt_budgets").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Meta vs Actual (campaign truth)                                      */
/* ------------------------------------------------------------------ */

export type CampaignTruthRow = {
  id: string;
  name: string;
  status: string;
  external_id: string | null;
  spend: number;
  clicks: number;
  meta_purchases: number;
  meta_purchase_value: number;
  meta_roas: number;
  orders: number;
  confirmed_orders: number;
  delivered_orders: number;
  returned_orders: number;
  cancelled_orders: number;
  in_progress_orders: number;
  delivered_revenue: number;
  booked_revenue: number;
  actual_roas: number;
  booked_roas: number;
  purchase_gap: number;
  delivery_rate: number;
  cpa: number;
  cac: number;
};

export const getCampaignTruth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_campaign_truth", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as CampaignTruthRow[];
  });

export const rerunCampaignMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("mkt_rerun_campaign_matching", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (res ?? { scanned: 0, inserted: 0, updated: 0 }) as {
      scanned: number;
      inserted: number;
      updated: number;
    };
  });

