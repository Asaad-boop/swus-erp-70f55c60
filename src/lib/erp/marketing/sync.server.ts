// Server-only Meta sync helpers. Take a supabase client (any role) and do the work.
// Imported by meta.functions.ts (server fn module) and the cron route.

import {
  listCampaigns,
  listAdsets,
  listAds,
  getDailyInsights,
  extractMetaConversions,
} from "./meta.server";

function actId(externalId: string): string {
  return externalId.startsWith("act_") ? externalId : `act_${externalId}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Classify a caught error as transient (network/timeout/rate-limit/Meta 5xx)
 * or permanent (invalid token, disabled account, bad request).
 *
 * Transient → keep account status as-is; only stamp `last_error` so future cron
 * cycles will retry automatically. Permanent → set status = 'error' so it stops
 * being auto-picked until a human fixes creds.
 */
function classifyMetaError(e: any): "transient" | "permanent" {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  const name = String(e?.name ?? "").toLowerCase();
  const code = Number(e?.code);

  // Meta Graph API permanent error codes:
  //   190 = invalid/expired OAuth token
  //   102 = session expired
  //   200/210 = permission denied
  //   803 = object does not exist
  //   100 = invalid parameter (bad ad-account id, missing field)
  //   294 = ads_management permission required
  const permanentCodes = new Set([100, 102, 190, 200, 210, 294, 803]);
  if (permanentCodes.has(code)) return "permanent";

  // Meta transient / retryable codes:
  //   1, 2   = unknown / temporary service issue
  //   4, 17, 32, 613 = rate limit / throttling
  //   368    = temporarily blocked
  const transientCodes = new Set([1, 2, 4, 17, 32, 368, 613]);
  if (transientCodes.has(code)) return "transient";

  // AbortError / timeout / network — all transient
  if (
    name === "aborterror" ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up")
  ) {
    return "transient";
  }

  // Meta API 5xx wrapper messages
  if (/meta api 5\d\d/.test(msg)) return "transient";
  // Meta API 4xx wrapper messages without a Meta code → likely permanent
  if (/meta api 4\d\d/.test(msg)) return "permanent";

  // Missing token / config problems raised by our own code → permanent
  if (msg.includes("access token missing") || msg.includes("no access token")) {
    return "permanent";
  }

  // Default: treat unknown as transient so we don't disable accounts on
  // ambiguous errors. Cron will keep retrying; if it's truly permanent the
  // next cycle will surface the same message.
  return "transient";
}

async function stampAccountError(supabase: any, accountId: string, e: any) {
  const kind = classifyMetaError(e);
  const patch: any = { last_error: `[${kind}] ${String(e?.message ?? e)}` };
  if (kind === "permanent") patch.status = "error";
  await supabase.from("mkt_ad_accounts").update(patch).eq("id", accountId);
}

async function withSyncLog<T extends { rows: number; meta?: any }>(
  supabase: any,
  args: {
    brand_id: string | null;
    account_id: string | null;
    kind: "structure" | "insights" | "attribution" | "finance_post";
    run: () => Promise<T>;
  },
): Promise<{ ok: true; rows: number; meta?: any }> {
  const started_at = new Date().toISOString();
  const { data: logRow } = await supabase
    .from("mkt_sync_log")
    .insert({
      brand_id: args.brand_id,
      account_id: args.account_id,
      kind: args.kind,
      status: "running",
      started_at,
    })
    .select("id")
    .single();
  try {
    const result = await args.run();
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_processed: result.rows,
        meta: result.meta ?? null,
      })
      .eq("id", logRow!.id);
    return { ok: true, rows: result.rows, meta: result.meta };
  } catch (e: any) {
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: String(e?.message ?? e),
      })
      .eq("id", logRow!.id);
    throw e;
  }
}

export async function runStructureSync(supabase: any, accountId: string) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  if (!acc.access_token) throw new Error("Access token missing — edit account and add token");
  const act = actId(acc.external_id);
  const tok = acc.access_token as string;

  try {
    return await withSyncLog(supabase, {
      brand_id: acc.brand_id,
      account_id: acc.id,
      kind: "structure",
      run: async () => {
        const [camps, adsets, ads] = await Promise.all([
          listCampaigns(act, tok),
          listAdsets(act, tok),
          listAds(act, tok),
        ]);

        if (camps.length) {
          // Preserve existing brand_id — do NOT overwrite manual mappings on re-sync.
          // For NEW campaigns: auto-assign brand_id ONLY when the ad account is
          // linked to exactly one brand via mkt_ad_account_brands. Multi-brand
          // accounts leave brand_id = NULL so the campaign shows as "Unassigned"
          // and can be manually tagged — we never guess which brand it belongs to.
          const { data: existingCamps } = await supabase
            .from("mkt_campaigns")
            .select("external_id,brand_id")
            .eq("account_id", acc.id);
          const existingBrandByExt = new Map<string, string | null>(
            (existingCamps ?? []).map((r: any) => [r.external_id, r.brand_id ?? null]),
          );
          const { data: linkedBrands } = await supabase
            .from("mkt_ad_account_brands")
            .select("brand_id")
            .eq("ad_account_id", acc.id);
          const linkedBrandIds = (linkedBrands ?? [])
            .map((r: any) => r.brand_id)
            .filter(Boolean);
          const autoBrandForNew: string | null =
            linkedBrandIds.length === 1 ? linkedBrandIds[0] : null;
          const rows = camps.map((c) => ({
            brand_id: existingBrandByExt.has(c.id)
              ? existingBrandByExt.get(c.id) ?? null
              : autoBrandForNew,
            account_id: acc.id,
            external_id: c.id,
            name: c.name,
            objective: c.objective ?? null,
            status: c.status ?? null,
            effective_status: c.effective_status ?? null,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            start_time: c.start_time ?? null,
            stop_time: c.stop_time ?? null,
            raw: c as any,
          }));
          const { error } = await supabase
            .from("mkt_campaigns")
            .upsert(rows, { onConflict: "account_id,external_id" });
          if (error) throw error;

          // Campaigns Meta no longer returns (deleted/archived) must not stay
          // ACTIVE in our copy — otherwise the Active filter over-counts.
          const liveIds = camps.map((c) => c.id);
          await supabase
            .from("mkt_campaigns")
            .update({ status: "ARCHIVED", effective_status: "ARCHIVED" })
            .eq("account_id", acc.id)
            .not("external_id", "in", `(${liveIds.join(",")})`);
        }

        const { data: campRows } = await supabase
          .from("mkt_campaigns")
          .select("id,external_id,brand_id")
          .eq("account_id", acc.id);
        const campMap = new Map<string, string>(
          (campRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        const campBrandById = new Map<string, string | null>(
          (campRows ?? []).map((r: any) => [r.id, r.brand_id ?? null]),
        );

        if (adsets.length) {
          const rows = adsets
            .filter((a) => campMap.has(a.campaign_id))
            .map((a) => {
              const campId = campMap.get(a.campaign_id)!;
              return {
              brand_id: campBrandById.get(campId) ?? null,
              account_id: acc.id,
              campaign_id: campId,
              external_id: a.id,
              name: a.name,
              status: a.status ?? null,
              effective_status: a.effective_status ?? null,
              daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
              lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
              targeting_summary: a.targeting ? JSON.stringify(a.targeting).slice(0, 500) : null,
              raw: a as any,
              };
            });
          if (rows.length) {
            const { error } = await supabase
              .from("mkt_adsets")
              .upsert(rows, { onConflict: "account_id,external_id" });
            if (error) throw error;
          }
        }

        const { data: adsetRows } = await supabase
          .from("mkt_adsets")
          .select("id,external_id")
          .eq("account_id", acc.id);
        const adsetMap = new Map<string, string>(
          (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
        );

        if (ads.length) {
          const rows = ads
            .filter((a) => campMap.has(a.campaign_id) && adsetMap.has(a.adset_id))
            .map((a) => {
              const campId = campMap.get(a.campaign_id)!;
              return {
              brand_id: campBrandById.get(campId) ?? null,
              account_id: acc.id,
              campaign_id: campId,
              adset_id: adsetMap.get(a.adset_id)!,
              external_id: a.id,
              name: a.name,
              status: a.status ?? null,
              effective_status: a.effective_status ?? null,
              creative_body: a.creative?.body ?? null,
              creative_thumbnail: a.creative?.thumbnail_url ?? null,
              raw: a as any,
              };
            });
          if (rows.length) {
            const { error } = await supabase
              .from("mkt_ads")
              .upsert(rows, { onConflict: "account_id,external_id" });
            if (error) throw error;
          }
        }

        await supabase
          .from("mkt_ad_accounts")
          .update({
            last_structure_sync_at: new Date().toISOString(),
            last_error: null,
            status: "active",
          })
          .eq("id", acc.id);

        return {
          rows: camps.length + adsets.length + ads.length,
          meta: { campaigns: camps.length, adsets: adsets.length, ads: ads.length },
        };
      },
    });
  } catch (e: any) {
    await stampAccountError(supabase, acc.id, e);
    throw e;
  }
}

export async function runInsightsSync(
  supabase: any,
  accountId: string,
  opts: { since?: string; until?: string; days: number },
) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  if (!acc.access_token) throw new Error("Access token missing — edit account and add token");
  const act = actId(acc.external_id);
  const tok = acc.access_token as string;

  const until = opts.until ?? isoDate(new Date());
  const since =
    opts.since ??
    isoDate(new Date(Date.now() - (opts.days - 1) * 24 * 60 * 60 * 1000));

  try {
    return await withSyncLog(supabase, {
      brand_id: acc.brand_id,
      account_id: acc.id,
      kind: "insights",
      run: async () => {
        const insights = await getDailyInsights(act, since, until, tok);

        const [{ data: adRows }, { data: adsetRows }, { data: campRows }] = await Promise.all([
          supabase.from("mkt_ads").select("id,external_id").eq("account_id", acc.id),
          supabase.from("mkt_adsets").select("id,external_id").eq("account_id", acc.id),
          supabase.from("mkt_campaigns").select("id,external_id,brand_id").eq("account_id", acc.id),
        ]);
        const adMap = new Map<string, string>(
          (adRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        const adsetMap = new Map<string, string>(
          (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        const campMap = new Map<string, string>(
          (campRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        // Canonical brand source — per-campaign, NOT ad-account (shared accounts run multi-brand).
        const campBrandByExt = new Map<string, string | null>(
          (campRows ?? []).map((r: any) => [r.external_id, r.brand_id ?? null]),
        );

        const rows = insights.map((ins) => {
          const conv = extractMetaConversions(ins);
          const campBrand = ins.campaign_id ? campBrandByExt.get(ins.campaign_id) ?? null : null;
          return {
            // Fall back to acc.brand_id only if the campaign has no brand assigned yet.
            brand_id: campBrand ?? acc.brand_id ?? null,
            account_id: acc.id,
            date: ins.date_start,
            ad_id: ins.ad_id ? adMap.get(ins.ad_id) ?? null : null,
            adset_id: ins.adset_id ? adsetMap.get(ins.adset_id) ?? null : null,
            campaign_id: ins.campaign_id ? campMap.get(ins.campaign_id) ?? null : null,
            spend: Number(ins.spend) || 0,
            impressions: Number(ins.impressions) || 0,
            reach: Number(ins.reach) || 0,
            clicks: Number(ins.clicks) || 0,
            cpm: ins.cpm ? Number(ins.cpm) : null,
            cpc: ins.cpc ? Number(ins.cpc) : null,
            ctr: ins.ctr ? Number(ins.ctr) : null,
            meta_purchases: conv.purchases,
            meta_purchase_value: conv.purchase_value,
            meta_add_to_cart: conv.add_to_cart,
            meta_initiate_checkout: conv.initiate_checkout,
            meta_leads: conv.leads,
            raw: ins as any,
          };
        });

        // Replace the window to keep things idempotent and remove stale rows when Meta returns 0.
        const { error: delErr } = await supabase
          .from("mkt_insights_daily")
          .delete()
          .eq("account_id", acc.id)
          .gte("date", since)
          .lte("date", until);
        if (delErr) throw delErr;

        if (rows.length) {
          const { error } = await supabase.from("mkt_insights_daily").insert(rows);
          if (error) throw error;
        }

        // ---- FIFO spend consumption (idempotent, delta-aware) ----
        // Build a stable spend_ref per insight row and call consume_meta_spend_fifo.
        // The RPC handles delta detection via meta_spend_consumptions, so re-syncing
        // the same window is safe.
        let fifoConsumed = 0;
        let fifoFallback = 0;
        try {
          const { data: freshRows } = await supabase
            .from("mkt_insights_daily")
            .select("id,date,spend,ad_id,adset_id,campaign_id")
            .eq("account_id", acc.id)
            .gte("date", since)
            .lte("date", until);
          for (const r of freshRows ?? []) {
            const usd = Number(r.spend) || 0;
            const spendRef = `meta:${acc.id}:${r.date}:${
              r.ad_id ? "ad" : r.adset_id ? "adset" : "campaign"
            }:${r.campaign_id ?? "_"}:${r.adset_id ?? "_"}:${r.ad_id ?? "_"}`;
            const { data: fifoRes, error: fifoErr } = await supabase.rpc(
              "consume_meta_spend_fifo",
              {
                _ad_account_id: acc.id,
                _spend_ref: spendRef,
                _usd_spend: usd,
                _spend_date: r.date,
                _insight_id: r.id,
              },
            );
            if (fifoErr) continue;

            // Re-read the canonical consumption row to capture cumulative BDT cost.
            const { data: consRow } = await supabase
              .from("meta_spend_consumptions")
              .select("bdt_cost,conversion_source")
              .eq("ad_account_id", acc.id)
              .eq("spend_ref", spendRef)
              .maybeSingle();

            const conv = (consRow?.conversion_source ?? (fifoRes as any)?.conversion ?? "fifo") as
              | "fifo"
              | "fx_fallback"
              | "manual";
            const bdt = Number(consRow?.bdt_cost ?? 0);

            await supabase
              .from("mkt_insights_daily")
              .update({
                spend_bdt_fifo: bdt,
                conversion_source: conv,
                estimated_bdt_cost: conv === "fx_fallback",
                fifo_consumption_ref: spendRef,
                fifo_consumed_at: new Date().toISOString(),
              })
              .eq("id", r.id);

            fifoConsumed++;
            if (conv === "fx_fallback") fifoFallback++;
          }
        } catch {
          // Non-fatal — insights sync still succeeds.
        }

        await supabase
          .from("mkt_ad_accounts")
          .update({
            last_insights_sync_at: new Date().toISOString(),
            last_error: null,
            status: "active",
          })
          .eq("id", acc.id);

        // Finance posting DISABLED — daily Meta spend is informational only.
        // Dollar purchase/funding is the real accounting expense.
        const financePosted: any = { skipped: "informational_only_no_wallet_posting" };

        return {
          rows: rows.length,
          meta: {
            since,
            until,
            finance: financePosted,
            fifo: { consumed: fifoConsumed, fallback: fifoFallback },
          },
        };
      },
    });
  } catch (e: any) {
    await stampAccountError(supabase, acc.id, e);
    throw e;
  }
}

/**
 * Auto-post Meta ad spend as marketing expense in finance (BDT).
 * - Aggregates daily spend per (account, date) from mkt_insights_daily.
 * - Converts to BDT using account.usd_to_bdt_rate (skips conversion if account currency is BDT).
 * - Upserts a mkt_manual_expenses row (source='meta_auto') per (brand, account, date).
 * - Maintains a linked erp_transactions expense row against the configured wallet
 *   (or first active wallet for the brand if none configured).
 * Idempotent — re-running for the same window updates existing rows.
 */
export async function postMetaSpendToFinance(
  supabase: any,
  acc: {
    id: string;
    brand_id: string;
    name: string;
    currency: string | null;
    usd_to_bdt_rate: number | string;
    auto_post_to_finance?: boolean;
    finance_wallet_id?: string | null;
  },
  since: string,
  until: string,
) {
  if (acc.auto_post_to_finance === false) {
    return { skipped: "auto_post_disabled" };
  }

  // Daily ad spend is INFORMATIONAL ONLY. Real cash leaves the business at
  // dollar-purchase time, so this sync must never create/delete/update
  // erp_transactions. It only maintains marketing reporting rows.

  // Aggregate daily spend (USD) for this account in window
  const { data: insRows, error: insErr } = await supabase
    .from("mkt_insights_daily")
    .select("date, spend")
    .eq("account_id", acc.id)
    .gte("date", since)
    .lte("date", until);
  if (insErr) throw insErr;

  const dailyUsd = new Map<string, number>();
  for (const r of insRows ?? []) {
    dailyUsd.set(r.date, (dailyUsd.get(r.date) ?? 0) + (Number(r.spend) || 0));
  }

  // Account-level rate, then brand-level FX as fallback, never a hardcoded constant.
  const { getBrandUsdBdt } = await import("./fx.server");
  const fx = Number(acc.usd_to_bdt_rate) || (await getBrandUsdBdt(supabase, acc.brand_id));
  const isBdtAcc = (acc.currency ?? "").toUpperCase() === "BDT";

  // Existing auto-posted rows in window
  const { data: existing, error: exErr } = await supabase
    .from("mkt_manual_expenses")
    .select("id, date, transaction_id, amount")
    .eq("brand_id", acc.brand_id)
    .eq("mkt_ad_account_id", acc.id)
    .eq("source", "meta_auto")
    .gte("date", since)
    .lte("date", until);
  if (exErr) throw exErr;
  const existingByDate = new Map<string, any>(
    (existing ?? []).map((r: any) => [r.date, r]),
  );

  let inserted = 0;
  let updated = 0;
  let removed = 0;
  let totalBdt = 0;
  const txByDate = new Map<string, string>();

  for (const [date, usd] of dailyUsd) {
    const bdt = +(isBdtAcc ? usd : usd * fx).toFixed(2);
    const ex = existingByDate.get(date);
    existingByDate.delete(date);

    if (bdt <= 0) {
      // No spend — remove any prior posting for this date
      if (ex) {
        await supabase.from("mkt_manual_expenses").delete().eq("id", ex.id);
        removed++;
      }
      continue;
    }

    totalBdt += bdt;

    if (ex) {
      const { error } = await supabase
        .from("mkt_manual_expenses")
        .update({
          amount: bdt,
          currency: "BDT",
          account_id: null,
          transaction_id: null,
        })
        .eq("id", ex.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase.from("mkt_manual_expenses").insert({
        brand_id: acc.brand_id,
        mkt_ad_account_id: acc.id,
        source: "meta_auto",
        date,
        amount: bdt,
        currency: "BDT",
        vendor: "Meta",
        category: "meta_ads",
        account_id: null,
        transaction_id: null,
        note: `Auto-synced from Meta Ads — ${acc.name}`,
      });
      if (error) throw error;
      inserted++;
    }
  }

  // Any existing rows in window with no insight day anymore → remove (Meta returned 0)
  for (const ex of existingByDate.values()) {
    await supabase.from("mkt_manual_expenses").delete().eq("id", ex.id);
    removed++;
  }

  // Per-product allocation: split each campaign's BDT spend across linked products by weight.
  let allocations = 0;
  try {
    // Clear prior Meta auto allocations for this account/window so re-syncs stay clean,
    // even when no finance wallet/transaction exists yet.
    await supabase
      .from("erp_product_expense_allocations")
      .delete()
      .eq("source", "meta_auto")
      .eq("expense_type", "meta_ads")
      .eq("mkt_ad_account_id", acc.id)
      .gte("allocation_date", since)
      .lte("allocation_date", until);

    // Per-campaign-per-day spend (USD) for this account in window
    const { data: perCamp } = await supabase
      .from("mkt_insights_daily")
      .select("date, campaign_id, spend")
      .eq("account_id", acc.id)
      .gte("date", since)
      .lte("date", until);

    // Campaign → product links with weights
    const { data: links } = await supabase
      .from("mkt_campaign_products")
      .select("campaign_id, product_id, weight")
      .eq("brand_id", acc.brand_id);
    const linkByCamp = new Map<string, Array<{ product_id: string; weight: number }>>();
    for (const l of links ?? []) {
      if (!l.campaign_id || !l.product_id) continue;
      const arr = linkByCamp.get(l.campaign_id) ?? [];
      arr.push({ product_id: l.product_id, weight: Number(l.weight) || 1 });
      linkByCamp.set(l.campaign_id, arr);
    }

    const rows: any[] = [];
    for (const r of perCamp ?? []) {
      if (!r.campaign_id) continue;
      const products = linkByCamp.get(r.campaign_id);
      if (!products || products.length === 0) continue;
      const usd = Number(r.spend) || 0;
      if (usd <= 0) continue;
      const bdt = +(isBdtAcc ? usd : usd * fx).toFixed(2);
      const totalW = products.reduce((s, p) => s + p.weight, 0) || 1;
      for (const p of products) {
        const share = +((bdt * p.weight) / totalW).toFixed(2);
        if (share <= 0) continue;
        rows.push({
          brand_id: acc.brand_id,
          product_id: p.product_id,
          campaign_id: r.campaign_id,
          mkt_ad_account_id: acc.id,
          allocation_date: r.date,
          expense_transaction_id: txByDate.get(r.date) ?? null,
          expense_type: "meta_ads",
          amount: share,
          allocation_method: "campaign_weight",
          source: "meta_auto",
          created_at: `${r.date}T00:00:00.000Z`,
          note: `Meta spend — ${r.date}`,
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from("erp_product_expense_allocations")
        .insert(rows);
      if (error) throw error;
      allocations = rows.length;
    }
  } catch (e: any) {
    // Allocation failure shouldn't fail the whole sync
    return {
      inserted,
      updated,
      removed,
      total_bdt: +totalBdt.toFixed(2),
      fx,
      wallet_id: null,
      wallet_missing: true,
      allocation_error: String(e?.message ?? e),
    };
  }

  return {
    inserted,
    updated,
    removed,
    total_bdt: +totalBdt.toFixed(2),
    fx,
    wallet_id: null,
    wallet_missing: true,
    allocations,
  };
}
