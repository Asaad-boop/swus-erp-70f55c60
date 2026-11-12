import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMktRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export const getMetaLoginUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { metaAppCreds, signState, buildLoginUrl } = await import("./meta-oauth.server");
    const { appId, appSecret } = metaAppCreds();
    const origin = new URL(data.origin).origin;
    const state = await signState({ uid: context.userId, origin, exp: Date.now() + 10 * 60_000 }, appSecret);
    return { url: buildLoginUrl(appId, origin, state) };
  });

/** Facebook login er por, ei user-er token diye sob ad account list */
export const getMetaOAuthAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMktRole(context.supabase, context.userId);
    const sb = await admin();
    const { data: sess } = await sb.from("mkt_meta_oauth_sessions").select("*").eq("user_id", context.userId).maybeSingle();
    if (!sess) return { connected: false as const, accounts: [] };
    const { listMyAdAccounts } = await import("./meta.server");
    const accounts = await listMyAdAccounts(sess.access_token);
    const { data: existing } = await context.supabase.from("mkt_ad_accounts").select("external_id");
    const have = new Set((existing ?? []).map((r: any) => String(r.external_id)));
    return {
      connected: true as const,
      fbName: sess.fb_user_name as string | null,
      expiresAt: sess.expires_at as string | null,
      accounts: accounts.map((a: any) => ({
        id: String(a.account_id ?? String(a.id).replace(/^act_/, "")),
        name: a.name as string,
        currency: a.currency as string,
        status: a.account_status as number,
        business: a.business?.name ?? null,
        alreadyAdded: have.has(String(a.account_id ?? String(a.id).replace(/^act_/, ""))),
      })),
    };
  });

export const importMetaOAuthAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      accounts: z.array(z.object({ id: z.string().regex(/^\d+$/), name: z.string().min(1) })).min(1).max(50),
      brandIds: z.array(z.string().uuid()).min(1),
      usdToBdtRate: z.coerce.number().positive().default(125),
      syncNow: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const sb = await admin();
    const { data: sess } = await sb.from("mkt_meta_oauth_sessions").select("access_token").eq("user_id", context.userId).maybeSingle();
    if (!sess) throw new Error("Age Facebook diye login koro");
    const { syncAdAccountBrandLinks } = await import("./meta.functions");
    const { runStructureSync, runInsightsSync } = await import("./sync.server");
    const primary = data.brandIds[0];
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const a of data.accounts) {
      try {
        const { data: row, error } = await context.supabase.from("mkt_ad_accounts").upsert(
          {
            brand_id: primary, external_id: a.id, name: a.name, access_token: sess.access_token,
            usd_to_bdt_rate: data.usdToBdtRate, status: "active", last_error: null,
          },
          { onConflict: "brand_id,external_id" },
        ).select("id").single();
        if (error) throw error;
        await syncAdAccountBrandLinks(context.supabase, row.id, data.brandIds, primary);
        if (data.syncNow) {
          await runStructureSync(context.supabase, row.id);
          await runInsightsSync(context.supabase, row.id, { days: 30 });
        }
        results.push({ id: a.id, ok: true });
      } catch (e: any) {
        results.push({ id: a.id, ok: false, error: e?.message ?? String(e) });
      }
    }
    return { results };
  });

export const disconnectMetaLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    await sb.from("mkt_meta_oauth_sessions").delete().eq("user_id", context.userId);
    return { ok: true };
  });
