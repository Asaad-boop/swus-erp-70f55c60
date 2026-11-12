import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runStructureSync, runInsightsSync, postMetaSpendToFinance } from "./sync.server";

/** Admin or operations only — sync writes ad data. */
async function assertMktRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

// ---- List saved ad accounts for brand (token NOT returned) ----

export const listConnectedAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[] }) =>
    z
      .object({
        brandId: z.string().uuid().optional(),
        brandIds: z.array(z.string().uuid()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const brandIdList = data.brandIds && data.brandIds.length
      ? data.brandIds
      : data.brandId
        ? [data.brandId]
        : [];
    if (brandIdList.length === 0) return [];
    // Find ad account ids linked to any of the requested brands via junction.
    const { data: links, error: linkErr } = await context.supabase
      .from("mkt_ad_account_brands")
      .select("ad_account_id")
      .in("brand_id", brandIdList);
    if (linkErr) throw linkErr;
    const linkedIds = Array.from(new Set((links ?? []).map((r: any) => r.ad_account_id)));
    if (linkedIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select(
        "id,brand_id,external_id,name,currency,timezone,status,business_id,app_id,usd_to_bdt_rate,auto_post_to_finance,finance_wallet_id,last_structure_sync_at,last_insights_sync_at,last_error,created_at,updated_at",
      )
      .in("id", linkedIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Surface whether credentials are present without leaking values.
    const ids = (rows ?? []).map((r: any) => r.id);
    let credMap = new Map<string, { hasToken: boolean; hasSecret: boolean }>();
    let brandMap = new Map<string, { brand_ids: string[]; primary_brand_id: string | null }>();
    if (ids.length) {
      const { data: creds } = await context.supabase
        .from("mkt_ad_accounts")
        .select("id,access_token,app_secret")
        .in("id", ids);
      credMap = new Map(
        (creds ?? []).map((r: any) => [
          r.id,
          { hasToken: !!r.access_token, hasSecret: !!r.app_secret },
        ]),
      );
      const { data: allLinks } = await context.supabase
        .from("mkt_ad_account_brands")
        .select("ad_account_id, brand_id, is_primary")
        .in("ad_account_id", ids);
      for (const l of allLinks ?? []) {
        const cur = brandMap.get(l.ad_account_id) ?? { brand_ids: [], primary_brand_id: null };
        cur.brand_ids.push(l.brand_id);
        if (l.is_primary) cur.primary_brand_id = l.brand_id;
        brandMap.set(l.ad_account_id, cur);
      }
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      has_access_token: credMap.get(r.id)?.hasToken ?? false,
      has_app_secret: credMap.get(r.id)?.hasSecret ?? false,
      brand_ids: brandMap.get(r.id)?.brand_ids ?? (r.brand_id ? [r.brand_id] : []),
      primary_brand_id: brandMap.get(r.id)?.primary_brand_id ?? r.brand_id ?? null,
    }));
  });

// ---- Create / Update / Delete / Toggle ad account (per-account credentials) ----

const accountInput = z.object({
  name: z.string().min(1),
  appId: z.string().trim().min(1).optional().nullable(),
  appSecret: z.string().trim().min(1).optional().nullable(),
  accessToken: z.string().trim().min(20),
  adAccountId: z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+$/, "Ad Account ID numeric hote hobe (without act_ prefix)"),
  usdToBdtRate: z.coerce.number().positive().default(110),
  active: z.boolean().default(true),
  autoPostToFinance: z.boolean().optional().default(true),
  financeWalletId: z.string().uuid().optional().nullable(),
});

export const createAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    accountInput
      .extend({
        brandId: z.string().uuid().optional(),
        brandIds: z.array(z.string().uuid()).min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const brandIds: string[] = Array.from(
      new Set((data.brandIds && data.brandIds.length ? data.brandIds : data.brandId ? [data.brandId] : [])),
    );
    if (brandIds.length === 0) throw new Error("Kompokkho ekta brand select korun");
    const primaryBrandId = brandIds[0];
    const { data: upserted, error } = await context.supabase.from("mkt_ad_accounts").upsert(
      {
        brand_id: primaryBrandId,
        external_id: data.adAccountId,
        name: data.name,
        app_id: data.appId ?? null,
        app_secret: data.appSecret ?? null,
        access_token: data.accessToken,
        usd_to_bdt_rate: data.usdToBdtRate,
        status: data.active ? "active" : "paused",
        auto_post_to_finance: data.autoPostToFinance,
        finance_wallet_id: data.financeWalletId ?? null,
        last_error: null,
      },
      { onConflict: "brand_id,external_id" },
    ).select("id").single();
    if (error) throw error;
    await syncAdAccountBrandLinks(context.supabase, upserted.id, brandIds, primaryBrandId);
    return { ok: true };
  });

export const updateAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        accountId: z.string().uuid(),
          brandId: z.string().uuid().optional(),
          brandIds: z.array(z.string().uuid()).min(1).optional(),
        name: z.string().min(1),
        appId: z.string().trim().optional().nullable(),
        appSecret: z.string().trim().optional().nullable(),
        // Allow leaving token blank to keep existing.
        accessToken: z.string().trim().optional().nullable(),
        adAccountId: z.string().trim().regex(/^\d+$/),
        usdToBdtRate: z.coerce.number().positive(),
        active: z.boolean(),
        autoPostToFinance: z.boolean().optional(),
        financeWalletId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const brandIds: string[] = Array.from(
      new Set(
        (data.brandIds && data.brandIds.length
          ? data.brandIds
          : data.brandId
            ? [data.brandId]
            : []) as string[],
      ),
    );
    const primaryBrandId = brandIds[0] ?? data.brandId ?? null;
    const patch: any = {
      name: data.name,
      external_id: data.adAccountId,
      app_id: data.appId ?? null,
      usd_to_bdt_rate: data.usdToBdtRate,
      status: data.active ? "active" : "paused",
    };
    if (primaryBrandId) {
      patch.brand_id = primaryBrandId;
    }
    if (typeof data.autoPostToFinance === "boolean") {
      patch.auto_post_to_finance = data.autoPostToFinance;
    }
    if (data.financeWalletId !== undefined) {
      patch.finance_wallet_id = data.financeWalletId ?? null;
    }
    if (data.appSecret && data.appSecret.trim().length > 0) {
      patch.app_secret = data.appSecret.trim();
    }
    if (data.accessToken && data.accessToken.trim().length > 20) {
      patch.access_token = data.accessToken.trim();
      patch.last_error = null;
    }
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .update(patch)
      .eq("id", data.accountId);
    if (error) throw error;
    if (brandIds.length > 0 && primaryBrandId) {
      await syncAdAccountBrandLinks(context.supabase, data.accountId, brandIds, primaryBrandId);
    }
    return { ok: true };
  });

export async function syncAdAccountBrandLinks(
  supabase: any,
  adAccountId: string,
  brandIds: string[],
  primaryBrandId: string,
) {
  // Delete links no longer selected
  await supabase
    .from("mkt_ad_account_brands")
    .delete()
    .eq("ad_account_id", adAccountId)
    .not("brand_id", "in", `(${brandIds.map((b) => `"${b}"`).join(",")})`);
  // Upsert each selected brand (primary flag only true for primary)
  for (const bid of brandIds) {
    await supabase.from("mkt_ad_account_brands").upsert(
      { ad_account_id: adAccountId, brand_id: bid, is_primary: bid === primaryBrandId },
      { onConflict: "ad_account_id,brand_id" },
    );
  }
  // Ensure only one primary — clear other primary flags
  await supabase
    .from("mkt_ad_account_brands")
    .update({ is_primary: false })
    .eq("ad_account_id", adAccountId)
    .neq("brand_id", primaryBrandId);
}

// ---- Manually re-post Meta spend to finance for a window ----
export const repostMetaSpendToFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string; since: string; until: string }) =>
    z
      .object({
        accountId: z.string().uuid(),
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { data: acc, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select(
        "id, brand_id, name, currency, usd_to_bdt_rate, auto_post_to_finance, finance_wallet_id",
      )
      .eq("id", data.accountId)
      .single();
    if (error || !acc) throw new Error("Ad account not found");
    return postMetaSpendToFinance(context.supabase, acc, data.since, data.until);
  });

export const deleteAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleAdAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string; active: boolean }) =>
    z.object({ accountId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .update({ status: data.active ? "active" : "paused" })
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

/** Test connection — verifies token against Meta Graph API. */
export const testAdAccountConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        // Either pass live form values, OR an accountId to use stored creds.
        accountId: z.string().uuid().optional(),
        accessToken: z.string().trim().optional(),
        adAccountId: z
          .string()
          .trim()
          .regex(/^\d+$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    let token = data.accessToken ?? "";
    let actId = data.adAccountId ?? "";
    if ((!token || !actId) && data.accountId) {
      const { data: acc } = await context.supabase
        .from("mkt_ad_accounts")
        .select("access_token,external_id")
        .eq("id", data.accountId)
        .single();
      if (!acc) throw new Error("Account not found");
      token = token || acc.access_token || "";
      actId = actId || acc.external_id;
    }
    if (!token) throw new Error("Access token nei");
    if (!actId) throw new Error("Ad Account ID nei");
    const { verifyAdAccount } = await import("./meta.server");
    try {
      const info = await verifyAdAccount(actId, token);
      if (data.accountId) {
        const { data: cur } = await context.supabase
          .from("mkt_ad_accounts")
          .select("status")
          .eq("id", data.accountId)
          .single();
        await context.supabase
          .from("mkt_ad_accounts")
          .update({
            currency: info.currency ?? null,
            timezone: info.timezone_name ?? null,
            business_id: info.business?.id ?? null,
            last_error: null,
            // Recover from "error" state once the token verifies again.
            ...(cur?.status === "error" ? { status: "active" } : {}),
          })
          .eq("id", data.accountId);
      }
      return {
        ok: true as const,
        info: {
          name: info.name,
          currency: info.currency,
          timezone: info.timezone_name,
          business: info.business?.name ?? null,
          account_status: info.account_status,
        },
      };
    } catch (e: any) {
      const raw = String(e?.message ?? e ?? "Connection failed");
      const expired =
        /access token/i.test(raw) && /(expired|session has expired|invalid)/i.test(raw);
      const message = expired
        ? "Meta access token expire hoye geche — Meta Business theke notun token niye ekhane paste korun."
        : raw;
      if (data.accountId) {
        await context.supabase
          .from("mkt_ad_accounts")
          .update({ last_error: message, status: "error" })
          .eq("id", data.accountId);
      }
      // Return instead of throw: throwing from the server fn blanks the screen.
      return { ok: false as const, error: message, tokenExpired: expired };
    }
  });

// ---- 5. Sync structure (campaigns / adsets / ads) ----

export const syncAdAccountStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    return runStructureSync(context.supabase, data.accountId);
  });

// ---- 6. Sync insights (daily metrics per ad) ----

export const syncAdAccountInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string; since?: string; until?: string; days?: number }) =>
    z
      .object({
        accountId: z.string().uuid(),
        since: z.string().optional(),
        until: z.string().optional(),
        days: z.number().int().min(1).max(90).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    return runInsightsSync(context.supabase, data.accountId, {
      since: data.since,
      until: data.until,
      days: data.days ?? 90,
    });
  });

export const syncBrandInsightsRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; since: string; until: string }) =>
    z
      .object({
        brandId: z.string().uuid(),
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { data: accounts, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select("id,name")
      .eq("brand_id", data.brandId)
      .eq("status", "active");
    if (error) throw error;

    const results = [] as Array<{ accountId: string; name: string; rows: number }>;
    for (const acc of accounts ?? []) {
      const r = await runInsightsSync(context.supabase, acc.id, {
        since: data.since,
        until: data.until,
        days: 90,
      });
      results.push({ accountId: acc.id, name: acc.name, rows: r.rows });
    }
    return { accounts: results.length, rows: results.reduce((n, r) => n + r.rows, 0), results };
  });

// ---- 7. Read sync log ----

export const listSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; limit?: number }) =>
    z.object({ brandId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_sync_log")
      .select("*, mkt_ad_accounts(name)")
      .eq("brand_id", data.brandId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw error;
    return rows ?? [];
  });

// ---- 8. Last sync status (across brands) ----

export const getLastSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) =>
    z.object({ brandIds: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_sync_log")
      .select("started_at, finished_at, status, rows_processed, error, brand_id")
      .in("brand_id", data.brandIds)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const list = rows ?? [];
    const lastCompleted = list.find((r) => r.status === "success" && r.finished_at);
    const lastAny = list[0] ?? null;
    return {
      lastCompletedAt: lastCompleted?.finished_at ?? lastCompleted?.started_at ?? null,
      lastStatus: lastAny?.status ?? null,
      lastError: lastAny?.error ?? null,
      lastStartedAt: lastAny?.started_at ?? null,
    };
  });

// ---- 9. Sync Meta account "Account Spending Limit" to match our tracked USD-on-hand ----
// Meta's spend_cap is a lifetime, cumulative cap in currency minor units (cents for USD).
// To make "remaining under cap" == our wallet balance, set:
//     new spend_cap (cents) = amount_spent (cents) + wallet_balance_usd * 100
// Runs across all active USD ad accounts (optionally filtered by brand).

export const syncSpendCapToWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; accountId?: string }) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).optional(),
        accountId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);

    // Resolve accounts
    let accountIds: string[] = [];
    if (data.accountId) {
      accountIds = [data.accountId];
    } else if (data.brandIds && data.brandIds.length) {
      const { data: links, error } = await context.supabase
        .from("mkt_ad_account_brands")
        .select("ad_account_id")
        .in("brand_id", data.brandIds);
      if (error) throw error;
      accountIds = Array.from(new Set((links ?? []).map((r: any) => r.ad_account_id)));
    } else {
      const { data: allAcc, error } = await context.supabase
        .from("mkt_ad_accounts")
        .select("id")
        .eq("status", "active");
      if (error) throw error;
      accountIds = (allAcc ?? []).map((r: any) => r.id);
    }
    if (accountIds.length === 0) return { updated: [], skipped: [] as any[] };

    const { data: accounts, error: accErr } = await context.supabase
      .from("mkt_ad_accounts")
      .select("id,name,external_id,currency,status,access_token")
      .in("id", accountIds);
    if (accErr) throw accErr;

    // Latest wallet balance per account
    const { data: ledger, error: ledErr } = await context.supabase
      .from("meta_ad_wallet_ledger")
      .select("ad_account_id,balance_usd_after,created_at")
      .in("ad_account_id", accountIds)
      .order("created_at", { ascending: false });
    if (ledErr) throw ledErr;
    const balanceByAcc = new Map<string, number>();
    for (const row of ledger ?? []) {
      if (!row.ad_account_id || balanceByAcc.has(row.ad_account_id)) continue;
      balanceByAcc.set(row.ad_account_id, Number(row.balance_usd_after) || 0);
    }

    const { getAdAccountSpendState, setAdAccountSpendCap } = await import("./meta.server");

    const updated: Array<{
      accountId: string;
      name: string;
      wallet_usd: number;
      amount_spent_usd: number;
      new_spend_cap_usd: number;
    }> = [];
    const skipped: Array<{ accountId: string; name: string; reason: string }> = [];

    for (const acc of accounts ?? []) {
      const name = acc.name as string;
      const token = acc.access_token as string | null;
      if (!token) {
        skipped.push({ accountId: acc.id, name, reason: "No access token" });
        continue;
      }
      if (acc.currency && acc.currency !== "USD") {
        skipped.push({ accountId: acc.id, name, reason: `Currency ${acc.currency} not USD` });
        continue;
      }
      const balance = balanceByAcc.get(acc.id) ?? 0;
      if (balance <= 0) {
        skipped.push({ accountId: acc.id, name, reason: `Balance ${balance.toFixed(2)}` });
        continue;
      }
      try {
        const state = await getAdAccountSpendState(acc.external_id, token);
        const amountSpentCents = Number(state.amount_spent) || 0;
        const newCapCents = amountSpentCents + Math.round(balance * 100);
        await setAdAccountSpendCap(acc.external_id, newCapCents, token);
        await context.supabase
          .from("mkt_ad_accounts")
          .update({ last_error: null })
          .eq("id", acc.id);
        updated.push({
          accountId: acc.id,
          name,
          wallet_usd: balance,
          amount_spent_usd: amountSpentCents / 100,
          new_spend_cap_usd: newCapCents / 100,
        });
      } catch (e: any) {
        let reason = e?.message ?? String(e);
        if (/invalid parameter/i.test(reason)) {
          reason +=
            " — ei ad account e spend cap set kora jacche na (prepaid/credit-line funding othoba cap must be > already spent). Meta Ads Manager > Billing theke manually check korun.";
        }
        skipped.push({ accountId: acc.id, name, reason });
        await context.supabase
          .from("mkt_ad_accounts")
          .update({ last_error: reason })
          .eq("id", acc.id);
      }
    }
    return { updated, skipped };
  });