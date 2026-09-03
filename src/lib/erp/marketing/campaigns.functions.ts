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

export type CampaignProductChip = {
  product_id: string;
  title: string;
  sku: string | null;
  orders?: number;
  revenue?: number;
  share?: number | null;
};

export type CampaignProductsSummary = Record<
  string,
  { manual: CampaignProductChip[]; manual_count: number; auto: CampaignProductChip[] }
>;

/**
 * Manual links + auto-detected top products (from the campaign's own attributed
 * orders) for many campaigns at once — used for the inline chips next to the
 * campaign name. Auto rows are suggestions only, never used in any money math.
 */
export const getCampaignProductsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignIds: z.array(z.string().uuid()).max(500),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CampaignProductsSummary> => {
    if (data.campaignIds.length === 0) return {};
    const { data: rows, error } = await context.supabase.rpc("mkt_campaign_products_summary", {
      _campaign_ids: data.campaignIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (rows ?? {}) as CampaignProductsSummary;
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
  attributed_orders: number;
  unlinked_orders: number;
  match_status: "linked" | "partial" | "utm_only" | "no_orders";

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
  cogs: number;
  operating_cost: number;
  gross_profit: number;
  net_profit: number;
  net_margin: number;
  profit_roas: number;
  breakeven_roas: number;
  cost_missing_units: number;
  verdict: "scaling" | "profitable" | "breakeven" | "losing" | "no_data";
  /** Cost attribution split (delivered lines) */
  courier_cost: number;
  packaging_cost: number;
  refund_cost: number;
  other_cost: number;
  /** Staff annotations */
  tags: string[];
  note: string | null;

  /* ---- Cash truth (realized) ---- */
  booked_order_count: number;
  booked_value: number;
  cancelled_count: number;
  cancelled_value: number;
  confirmed_count: number;
  confirmed_value: number;
  delivered_count: number;
  delivered_order_value: number;
  returned_count: number;
  settled_delivered_count: number;
  /** null = pending reconciliation, never fake 0 */
  collected_amount: number | null;
  expected_collectible: number | null;
  collection_variance: number | null;
  return_charge: number | null;
  return_charge_is_estimate: boolean;
  cogs_recovered: number;
  settlement_coverage: number | null;
  attribution_coverage: number | null;
  attribution_source: string | null;
  /** Collected cash − COGS(+recovered) − opex − return charge − ad spend. null when settlement pending. */
  realized_profit: number | null;
  /** Pipeline value still in flight (not cash) */
  projected_profit: number;
  truth_status: "profitable" | "breakeven" | "losing" | "too_early";
};


export type CampaignTrendPoint = {
  campaign_id: string;
  bucket: string;
  spend: number;
  delivered_revenue: number;
  cogs: number;
  operating_cost: number;
  gross_profit: number;
  net_profit: number;
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
    const base = (Array.isArray(rows) ? rows : []) as CampaignTruthRow[];

    const { getCampaignProfitMap } = await import("@/lib/erp/marketing/canonical.server");
    const profit = new Map<
      string,
      { cogs: number; operating_cost: number; gross_profit: number; cost_missing_units: number }
    >();
    for (const brandId of data.brandIds) {
      const m = await getCampaignProfitMap(context.supabase, brandId, data.from, data.to);
      for (const [cid, v] of m) {
        const cur = profit.get(cid) ?? {
          cogs: 0,
          operating_cost: 0,
          gross_profit: 0,
          cost_missing_units: 0,
        };
        cur.cogs += v.cogs;
        cur.operating_cost += v.operating_cost;
        cur.gross_profit += v.gross_profit;
        cur.cost_missing_units += v.cost_missing_units;
        profit.set(cid, cur);
      }
    }

    // cost attribution split + staff annotations
    const { data: splitRaw } = await context.supabase.rpc("mkt_campaign_cost_split", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    const split = new Map<string, any>();
    for (const s of (Array.isArray(splitRaw) ? splitRaw : []) as any[]) {
      if (s?.campaign_id) split.set(s.campaign_id, s);
    }

    const { data: metaRaw } = await context.supabase
      .from("mkt_campaign_meta")
      .select("campaign_id, tags, note");
    const metaMap = new Map<string, { tags: string[]; note: string | null }>();
    for (const m of (metaRaw ?? []) as any[]) {
      metaMap.set(m.campaign_id, { tags: (m.tags ?? []) as string[], note: m.note ?? null });
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return base.map((r) => {
      const p = profit.get(r.id) ?? {
        cogs: 0,
        operating_cost: 0,
        gross_profit: 0,
        cost_missing_units: 0,
      };
      const net = p.gross_profit - r.spend;
      const contributionRate =
        p.gross_profit > 0 && r.delivered_revenue > 0 ? p.gross_profit / r.delivered_revenue : 0;
      let verdict: CampaignTruthRow["verdict"] = "no_data";
      if (r.spend > 0 || p.gross_profit !== 0) {
        if (net > 0 && r.spend > 0 && p.gross_profit / r.spend >= 1.5) verdict = "scaling";
        else if (net > 0) verdict = "profitable";
        else if (Math.abs(net) <= Math.max(200, r.spend * 0.05)) verdict = "breakeven";
        else verdict = "losing";
      }
      const s = split.get(r.id);
      const ann = metaMap.get(r.id);
      const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      const collected = numOrNull((r as any).collected_amount);
      const returnCharge = numOrNull((r as any).return_charge);
      const recovered = Number((r as any).cogs_recovered ?? 0);
      const settlementCoverage = numOrNull((r as any).settlement_coverage);
      const realized =
        collected === null
          ? null
          : r2(collected - (p.cogs - recovered) - p.operating_cost - (returnCharge ?? 0) - r.spend);
      let truthStatus: CampaignTruthRow["truth_status"] = "too_early";
      if (realized !== null && r.spend > 0 && (settlementCoverage ?? 0) >= 50) {
        if (Math.abs(realized) <= Math.max(200, r.spend * 0.05)) truthStatus = "breakeven";
        else if (realized > 0) truthStatus = "profitable";
        else truthStatus = "losing";
      }
      return {
        ...r,
        cogs: r2(p.cogs),
        operating_cost: r2(p.operating_cost),
        gross_profit: r2(p.gross_profit),
        net_profit: r2(net),
        net_margin: r.delivered_revenue > 0 ? r2((net / r.delivered_revenue) * 100) : 0,
        profit_roas: r.spend > 0 ? r2(p.gross_profit / r.spend) : 0,
        breakeven_roas: contributionRate > 0 ? r2(1 / contributionRate) : 0,
        cost_missing_units: p.cost_missing_units,
        verdict,
        courier_cost: Number(s?.courier ?? 0),
        packaging_cost: Number(s?.packaging ?? 0),
        refund_cost: Number(s?.refunds ?? 0),
        other_cost: Number(s?.other ?? 0),
        tags: ann?.tags ?? [],
        note: ann?.note ?? null,
        collected_amount: collected,
        expected_collectible: numOrNull((r as any).expected_collectible),
        collection_variance: numOrNull((r as any).collection_variance),
        return_charge: returnCharge,
        cogs_recovered: recovered,
        settlement_coverage: settlementCoverage,
        attribution_coverage: numOrNull((r as any).attribution_coverage),
        realized_profit: realized,
        projected_profit: r2(net),
        truth_status: truthStatus,
      };
    });
  });


export const saveCampaignMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        brandId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().min(1).max(40)).max(12),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("mkt_campaign_meta").upsert(
      {
        campaign_id: data.campaignId,
        brand_id: data.brandId ?? null,
        tags: data.tags,
        note: data.note ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "campaign_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const getCampaignTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        grain: z.enum(["day", "week"]).default("day"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_campaign_trend", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
      _grain: data.grain,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as CampaignTrendPoint[];
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


/* ------------------------------------------------------------------ */
/* Campaign order drill-through (cash truth)                            */
/* ------------------------------------------------------------------ */

export type CampaignOrderRow = {
  order_id: string;
  invoice_no: string | null;
  created_at: string;
  customer_name: string | null;
  status: string;
  confirmation_status: string | null;
  order_value: number;
  collected: number | null;
  attr_source: string;
  attr_confidence: number;
};

export const getCampaignOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        brandIds: z.array(z.string().uuid()).min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        limit: z.number().int().min(1).max(300).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: attrRaw, error: aErr } = await context.supabase.rpc(
      "mkt_order_primary_campaign",
      { _brand_ids: data.brandIds, _from: data.from, _to: data.to } as never,
    );
    if (aErr) throw aErr;
    const attr = (Array.isArray(attrRaw) ? attrRaw : ([] as any[])).filter(
      (a: any) => a?.campaign_id === data.campaignId,
    ) as { order_id: string; source: string; confidence: number }[];
    if (!attr.length) return [] as CampaignOrderRow[];
    const ids = attr.slice(0, data.limit).map((a) => a.order_id);
    const attrMap = new Map(attr.map((a) => [a.order_id, a]));

    const { data: orders, error } = await context.supabase
      .from("orders")
      .select("id, invoice_no, created_at, shipping_name, guest_name, status, confirmation_status, total")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: recon } = await context.supabase
      .from("erp_reconciliation_rows")
      .select("matched_order_id, collected")
      .in("matched_order_id", ids);
    const collectedMap = new Map<string, number>();
    for (const r of (recon ?? []) as any[]) {
      if (!r?.matched_order_id) continue;
      collectedMap.set(
        r.matched_order_id,
        (collectedMap.get(r.matched_order_id) ?? 0) + Number(r.collected ?? 0),
      );
    }

    return ((orders ?? []) as any[]).map((o) => {
      const a = attrMap.get(o.id);
      return {
        order_id: o.id as string,
        invoice_no: (o.invoice_no as string) ?? null,
        created_at: o.created_at as string,
        customer_name: (o.customer_name as string) ?? null,
        status: String(o.status ?? ""),
        confirmation_status: (o.confirmation_status as string) ?? null,
        order_value: Number(o.total ?? 0),
        collected: collectedMap.has(o.id) ? (collectedMap.get(o.id) as number) : null,
        attr_source: a?.source ?? "unattributed",
        attr_confidence: Number(a?.confidence ?? 0),
      } satisfies CampaignOrderRow;
    });
  });
