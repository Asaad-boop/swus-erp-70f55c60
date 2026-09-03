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
      .select("brand_id, account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!camp) throw new Error("Campaign khuje pawa jayni.");

    // Campaign row-e brand na thakle: ad account -> product theke resolve kori.
    let brandId: string | null = camp.brand_id ?? null;
    if (!brandId && camp.account_id) {
      const { data: acct } = await sb
        .from("mkt_ad_accounts")
        .select("brand_id")
        .eq("id", camp.account_id)
        .maybeSingle();
      brandId = acct?.brand_id ?? null;
    }
    if (!brandId) {
      const { data: prod } = await sb
        .from("products")
        .select("brand_id")
        .in("id", data.productIds)
        .not("brand_id", "is", null)
        .limit(1)
        .maybeSingle();
      brandId = (prod as { brand_id: string | null } | null)?.brand_id ?? null;
    }
    if (!brandId) throw new Error("Brand resolve kora gelo na — campaign ba product-e brand set korun.");

    const rows = data.productIds.map((pid) => ({
      campaign_id: data.campaignId,
      product_id: pid,
      brand_id: brandId,
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
  image?: string | null;
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
  /** Meta effective_status ACTIVE — campaign is delivering right now */
  is_live: boolean;
  spend: number;
  /** Raw USD pocket spend (0 for BDT-currency accounts) */
  spend_usd: number;
  clicks: number;
  meta_purchases: number;
  meta_purchase_value: number;
  meta_roas: number;
  orders: number;
  attributed_orders: number;
  explicit_attributed_orders: number;
  auto_attributed_orders: number;
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
  /** Net cash received from courier (gross COD − courier charge). null = pending reconciliation, never fake 0 */
  collected_amount: number | null;
  /** Gross cash collected from the customer before courier deduction */
  collected_gross: number | null;
  /** Courier charge deducted from the settled cash (actual settlement fee, else order courier_fee) */
  courier_fee_settled: number;
  /** true when some settled orders had no known courier fee — net is partially estimated */
  courier_fee_estimated: boolean;
  expected_collectible: number | null;
  collection_variance: number | null;
  return_charge: number | null;
  return_charge_is_estimate: boolean;
  cogs_recovered: number;
  settlement_coverage: number | null;
  courier_cost_coverage: number | null;
  cogs_coverage: number | null;
  attribution_coverage: number | null;
  attribution_confidence: number | null;
  attribution_source: string | null;
  /** Share of delivered order value that is actually settled (0-1) */
  settled_share: number;
  /** COGS (net of recovery) pro-rated to the settled slice — matches realized profit */
  cogs_applied: number;
  /** Operating cost pro-rated to the settled slice */
  operating_cost_applied: number;
  /** Weakest of attribution / settlement / COGS / courier coverage */
  truth_coverage: number | null;
  /** Collected cash − COGS(+recovered) − opex − return charge − ad spend. null when settlement pending. */
  realized_profit: number | null;
  /** Realized profit ROAS = realized profit ÷ ad spend */
  realized_roas: number | null;
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
      {
        cogs: number;
        operating_cost: number;
        gross_profit: number;
        cost_missing_units: number;
        delivered_units: number;
      }
    >();
    for (const brandId of data.brandIds) {
      const m = await getCampaignProfitMap(context.supabase, brandId, data.from, data.to);
      for (const [cid, v] of m) {
        const cur = profit.get(cid) ?? {
          cogs: 0,
          operating_cost: 0,
          gross_profit: 0,
          cost_missing_units: 0,
          delivered_units: 0,
        };
        cur.cogs += v.cogs;
        cur.operating_cost += v.operating_cost;
        cur.gross_profit += v.gross_profit;
        cur.cost_missing_units += v.cost_missing_units;
        cur.delivered_units += v.delivered_units;
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
        delivered_units: 0,
      };
      // Projected (pipeline) profit — never cash, never drives the verdict.
      const net = p.gross_profit - r.spend;
      const contributionRate =
        p.gross_profit > 0 && r.delivered_revenue > 0 ? p.gross_profit / r.delivered_revenue : 0;
      const s = split.get(r.id);
      const ann = metaMap.get(r.id);
      const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      const collectedGross = numOrNull((r as any).collected_amount);
      const courierFeeSettled = Number((r as any).courier_fee_settled ?? 0);
      const courierFeeEstimated = Boolean((r as any).courier_fee_estimated);
      const returnCharge = numOrNull((r as any).return_charge);
      const recovered = Number((r as any).cogs_recovered ?? 0);
      const settlementCoverage = numOrNull((r as any).settlement_coverage);
      const courierCoverage = numOrNull((r as any).courier_cost_coverage);
      const attributionCoverage = numOrNull((r as any).attribution_coverage);
      const attributionConfidence = numOrNull((r as any).attribution_confidence);
      const cogsCoverage =
        p.delivered_units > 0
          ? r2(100 * (1 - Math.min(1, p.cost_missing_units / p.delivered_units)))
          : null;
      const coverageParts = [
        attributionCoverage,
        settlementCoverage,
        cogsCoverage,
        courierCoverage,
      ].filter((v): v is number => v !== null);
      const truthCoverage = coverageParts.length > 0 ? Math.min(...coverageParts) : null;

      // Realized = actual cash in − canonical COGS (net of resellable recovery)
      //          − canonical opex − actual/fallback return charge − ad spend.
      // Collected cash only covers *settled* delivered orders, so canonical
      // delivered-line costs are pro-rated to the same settled slice — otherwise
      // partial settlement would subtract full COGS from partial cash.
      const deliveredOrderValue = Number((r as any).delivered_order_value ?? 0);
      const expectedCollectible = numOrNull((r as any).expected_collectible);
      const settledShare =
        deliveredOrderValue > 0 && expectedCollectible !== null
          ? Math.min(1, Math.max(0, expectedCollectible / deliveredOrderValue))
          : 1;
      const cogsSettled = (p.cogs - recovered) * settledShare;
      const opexSettled = p.operating_cost * settledShare;
      const realized =
        collected === null
          ? null
          : r2(collected - cogsSettled - opexSettled - (returnCharge ?? 0) - r.spend);

      const dataSufficient =
        realized !== null &&
        r.spend > 0 &&
        (settlementCoverage ?? 0) >= 50 &&
        (cogsCoverage ?? 0) >= 80 &&
        (courierCoverage ?? 0) >= 50 &&
        (attributionCoverage ?? 0) >= 50;

      let truthStatus: CampaignTruthRow["truth_status"] = "too_early";
      if (dataSufficient && realized !== null) {
        if (Math.abs(realized) <= Math.max(200, r.spend * 0.05)) truthStatus = "breakeven";
        else if (realized > 0) truthStatus = "profitable";
        else truthStatus = "losing";
      }


      // Verdict mirrors realized cash truth only — projected profit can never
      // make a campaign "profitable".
      let verdict: CampaignTruthRow["verdict"] = "no_data";
      if (truthStatus === "profitable")
        verdict = realized !== null && r.spend > 0 && realized / r.spend >= 0.5 ? "scaling" : "profitable";
      else if (truthStatus === "breakeven") verdict = "breakeven";
      else if (truthStatus === "losing") verdict = "losing";

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
        courier_cost_coverage: courierCoverage,
        cogs_coverage: cogsCoverage,
        attribution_coverage: attributionCoverage,
        attribution_confidence: attributionConfidence,
        truth_coverage: truthCoverage,
        settled_share: r2(settledShare),
        cogs_applied: r2(cogsSettled),
        operating_cost_applied: r2(opexSettled),
        realized_profit: realized,
        realized_roas: realized !== null && r.spend > 0 ? r2(realized / r.spend) : null,
        projected_profit: r2(net),
        truth_status: truthStatus,
      };
    });
  });

export type AttributionHealth = {
  total_orders: number;
  attributed_orders: number;
  explicit_orders: number;
  auto_orders: number;
  unattributed_orders: number;
  coverage_pct: number | null;
};

export const getAttributionHealth = createServerFn({ method: "POST" })
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
    const { data: res, error } = await context.supabase.rpc("mkt_attribution_health", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    const r = (res ?? {}) as Record<string, unknown>;
    return {
      total_orders: Number(r["total_orders"] ?? 0),
      attributed_orders: Number(r["attributed_orders"] ?? 0),
      explicit_orders: Number(r["explicit_orders"] ?? 0),
      auto_orders: Number(r["auto_orders"] ?? 0),
      unattributed_orders: Number(r["unattributed_orders"] ?? 0),
      coverage_pct: r["coverage_pct"] === null || r["coverage_pct"] === undefined ? null : Number(r["coverage_pct"]),
    } satisfies AttributionHealth;
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
  /** Gross cash collected from the customer (COD + advance) */
  collected: number | null;
  /** Courier charges deducted from the collected cash (null = unknown) */
  courier_fee: number | null;
  /** Net remittance actually received = collected − courier fee (null when unknown) */
  net_payout: number | null;
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
      .select("id, invoice_no, created_at, shipping_name, guest_name, status, confirmation_status, total, advance_amount, courier_fee")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Cash collected mirrors mkt_campaign_cash: courier reconciliation rows
    // + courier settlement lines + the still-outstanding advance portion.
    const courierCollected = new Map<string, number>();
    const settleRows = new Map<string, number>();
    const bump = (id: string | null, amount: unknown) => {
      if (!id) return;
      courierCollected.set(id, (courierCollected.get(id) ?? 0) + Number(amount ?? 0));
      settleRows.set(id, (settleRows.get(id) ?? 0) + 1);
    };

    // Courier charges deducted from that cash (delivery + COD fees etc).
    const courierFee = new Map<string, number>();
    const bumpFee = (id: string | null, amount: unknown) => {
      const v = Number(amount ?? 0);
      if (!id || !v) return;
      courierFee.set(id, (courierFee.get(id) ?? 0) + v);
    };

    const [{ data: recon }, { data: settle }] = await Promise.all([
      context.supabase
        .from("erp_reconciliation_rows")
        .select("matched_order_id, collected, total_fee")
        .in("matched_order_id", ids),
      context.supabase
        .from("erp_courier_settlement_lines")
        .select("matched_order_id, collected_amount, final_fee")
        .in("matched_order_id", ids),
    ]);
    for (const r of (recon ?? []) as any[]) {
      bump(r?.matched_order_id ?? null, r?.collected);
      bumpFee(r?.matched_order_id ?? null, r?.total_fee);
    }
    for (const s of (settle ?? []) as any[]) {
      bump(s?.matched_order_id ?? null, s?.collected_amount);
      bumpFee(s?.matched_order_id ?? null, s?.final_fee);
    }

    const CANCELLED = new Set(["cancelled", "fake"]);

    return ((orders ?? []) as any[]).map((o) => {
      const a = attrMap.get(o.id);
      const total = Number(o.total ?? 0);
      const advance = Number(o.advance_amount ?? 0);
      const courier = courierCollected.get(o.id) ?? 0;
      const hasSettlement = (settleRows.get(o.id) ?? 0) > 0;
      const advanceApplied = Math.min(advance, Math.max(total - courier, 0));
      const cash = courier + advanceApplied;
      const status = String(o.status ?? "");
      const feeRaw = courierFee.get(o.id) ?? Number(o.courier_fee ?? 0);
      const fee = feeRaw > 0 ? Math.round(feeRaw * 100) / 100 : null;
      // Settled or advance-paid → real number. Cancelled/fake with no cash → 0.
      // Otherwise still awaiting courier settlement → Pending (never fake ৳0).
      const collected =
        hasSettlement || advanceApplied > 0
          ? Math.round(cash * 100) / 100
          : CANCELLED.has(status)
            ? 0
            : null;
      return {
        order_id: o.id as string,
        invoice_no: (o.invoice_no as string) ?? null,
        created_at: o.created_at as string,
        customer_name: ((o.shipping_name ?? o.guest_name) as string) ?? null,
        status,
        confirmation_status: (o.confirmation_status as string) ?? null,
        order_value: total,
        collected,
        courier_fee: fee,
        net_payout: collected === null || fee === null ? null : Math.round((collected - fee) * 100) / 100,
        attr_source: a?.source ?? "unattributed",
        attr_confidence: Number(a?.confidence ?? 0),
      } satisfies CampaignOrderRow;
    });
  });

/* ------------------------------------------------------------------ */
/* Monthly comparison dashboard (cash truth, month-over-month)          */
/* ------------------------------------------------------------------ */

export type CampaignMonthRow = {
  /** YYYY-MM (Dhaka) */
  month: string;
  label: string;
  from: string;
  to: string;
  is_current: boolean;
  campaigns: number;
  spend: number;
  orders: number;
  delivered_orders: number;
  booked_value: number;
  /** null = no settled delivered orders this month */
  collected_amount: number | null;
  expected_collectible: number;
  /** Canonical COGS (net of resellable recovery) pro-rated to the settled slice */
  cogs_applied: number;
  operating_cost_applied: number;
  return_charge: number;
  /** Projected (pipeline) gross profit on delivered lines — not cash */
  gross_profit: number;
  /** Sum of realized profit over settled campaigns; null when nothing settled */
  realized_profit: number | null;
  realized_roas: number | null;
};

/** Month ranges in Asia/Dhaka (UTC+6, no DST). Oldest first; current month ends today. */
function dhakaMonthRanges(count: number) {
  const dhakaNow = new Date(Date.now() + 6 * 3600_000);
  const y = dhakaNow.getUTCFullYear();
  const m = dhakaNow.getUTCMonth();
  const todayStr = dhakaNow.toISOString().slice(0, 10);
  const out: { month: string; label: string; from: string; to: string; is_current: boolean }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth();
    const from = `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    let to = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const isCurrent = i === 0;
    if (isCurrent) to = todayStr;
    const label = d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    out.push({ month: from.slice(0, 7), label, from, to, is_current: isCurrent });
  }
  return out;
}

export const getCampaignMonthlyComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        months: z.number().int().min(2).max(12).default(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const months = dhakaMonthRanges(data.months);
    const { getCampaignProfitMap } = await import("@/lib/erp/marketing/canonical.server");
    const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
    const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const r2 = (x: number) => Math.round(x * 100) / 100;

    const rows = await Promise.all(
      months.map(async (mo) => {
        const { data: raw, error } = await sb.rpc("mkt_campaign_truth", {
          _brand_ids: data.brandIds,
          _from: mo.from,
          _to: mo.to,
        } as never);
        if (error) throw error;
        const base = (Array.isArray(raw) ? raw : []) as any[];

        const profit = new Map<
          string,
          { cogs: number; operating_cost: number; gross_profit: number }
        >();
        for (const brandId of data.brandIds) {
          const pm = await getCampaignProfitMap(sb, brandId, mo.from, mo.to);
          for (const [cid, v] of pm) {
            const cur = profit.get(cid) ?? { cogs: 0, operating_cost: 0, gross_profit: 0 };
            cur.cogs += v.cogs;
            cur.operating_cost += v.operating_cost;
            cur.gross_profit += v.gross_profit;
            profit.set(cid, cur);
          }
        }

        let spend = 0,
          orders = 0,
          delivered = 0,
          booked = 0,
          collected = 0,
          expected = 0,
          cogsApplied = 0,
          opexApplied = 0,
          returnCharge = 0,
          grossProfit = 0,
          realized = 0,
          realizedSpend = 0,
          anyCollected = false,
          anyRealized = false;

        for (const r of base) {
          const p = profit.get(r.id) ?? { cogs: 0, operating_cost: 0, gross_profit: 0 };
          const rSpend = n(r.spend);
          spend += rSpend;
          orders += n(r.orders);
          delivered += n(r.delivered_orders);
          booked += n(r.booked_value);
          expected += n(r.expected_collectible);
          returnCharge += n(r.return_charge);
          grossProfit += p.gross_profit;

          const rCollected = numOrNull(r.collected_amount);
          const rExpected = numOrNull(r.expected_collectible);
          const recovered = n(r.cogs_recovered);
          const deliveredOrderValue = n(r.delivered_order_value);
          const settledShare =
            deliveredOrderValue > 0 && rExpected !== null
              ? Math.min(1, Math.max(0, rExpected / deliveredOrderValue))
              : 1;
          const cogsSettled = (p.cogs - recovered) * settledShare;
          const opexSettled = p.operating_cost * settledShare;
          cogsApplied += cogsSettled;
          opexApplied += opexSettled;

          if (rCollected !== null) {
            anyCollected = true;
            collected += rCollected;
            // Same realized formula as getCampaignTruth: collected cash − settled COGS
            // − settled opex − return charge − ad spend.
            realized += rCollected - cogsSettled - opexSettled - n(r.return_charge) - rSpend;
            realizedSpend += rSpend;
            anyRealized = true;
          }
        }

        return {
          month: mo.month,
          label: mo.label,
          from: mo.from,
          to: mo.to,
          is_current: mo.is_current,
          campaigns: base.length,
          spend: r2(spend),
          orders,
          delivered_orders: delivered,
          booked_value: r2(booked),
          collected_amount: anyCollected ? r2(collected) : null,
          expected_collectible: r2(expected),
          cogs_applied: r2(cogsApplied),
          operating_cost_applied: r2(opexApplied),
          return_charge: r2(returnCharge),
          gross_profit: r2(grossProfit),
          realized_profit: anyRealized ? r2(realized) : null,
          realized_roas: anyRealized && realizedSpend > 0 ? r2(realized / realizedSpend) : null,
        } satisfies CampaignMonthRow;
      }),
    );

    return rows;
  });

/* ------------------------------------------------------------------ */
/* Meta ad spend truth (USD spent, BDT charged, rate, last sync)        */
/* ------------------------------------------------------------------ */

export type MetaSpendSummary = {
  usd_spend: number;
  bdt_spend: number;
  /** BDT matched to real wallet (FIFO) purchases */
  bdt_from_wallet: number;
  /** BDT converted with an FX rate because no wallet lot matched yet */
  bdt_from_fx: number;
  bdt_estimated: number;
  usd_unconverted: number;
  fx_rate: number;
  /** Blended BDT per USD actually charged */
  effective_rate: number | null;
  wallet_coverage_pct: number | null;
  rows: number;
  last_insight_at: string | null;
  last_sync_at: string | null;
};

export const getMetaSpendSummary = createServerFn({ method: "POST" })
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
    const { data: raw, error } = await context.supabase.rpc("mkt_meta_spend_summary", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    const r = (raw ?? {}) as any;
    const n = (v: unknown) => Number(v ?? 0) || 0;
    const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      usd_spend: n(r.usd_spend),
      bdt_spend: n(r.bdt_spend),
      bdt_from_wallet: n(r.bdt_from_wallet),
      bdt_from_fx: n(r.bdt_from_fx),
      bdt_estimated: n(r.bdt_estimated),
      usd_unconverted: n(r.usd_unconverted),
      fx_rate: n(r.fx_rate),
      effective_rate: nn(r.effective_rate),
      wallet_coverage_pct: nn(r.wallet_coverage_pct),
      rows: n(r.rows),
      last_insight_at: (r.last_insight_at as string) ?? null,
      last_sync_at: (r.last_sync_at as string) ?? null,
    } satisfies MetaSpendSummary;
  });
