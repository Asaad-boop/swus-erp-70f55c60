import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertMarketingWriter,
  ingestChannelSpend,
  syncAccountBrandLinks,
} from "./channels.server";

/** Phase 9 — Google / TikTok channel accounts + manual spend ingest. */

export const listChannelAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ brandIds: z.array(z.string().uuid()).default([]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.brandIds.length) return [];
    const { data: links, error: linkErr } = await context.supabase
      .from("mkt_ad_account_brands")
      .select("ad_account_id")
      .in("brand_id", data.brandIds);
    if (linkErr) throw linkErr;
    const ids = Array.from(new Set((links ?? []).map((r: any) => r.ad_account_id)));
    if (!ids.length) return [];
    const { data: rows, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select(
        "id,name,platform,external_id,currency,usd_to_bdt_rate,status,brand_id,last_insights_sync_at,last_error,created_at",
      )
      .in("id", ids)
      .order("platform", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: agg } = await context.supabase
      .from("mkt_insights_daily")
      .select("account_id, spend, date")
      .in("account_id", ids);
    const stats = new Map<string, { spend: number; days: Set<string> }>();
    for (const r of (agg ?? []) as any[]) {
      const cur = stats.get(r.account_id) ?? { spend: 0, days: new Set<string>() };
      cur.spend += Number(r.spend ?? 0);
      cur.days.add(r.date);
      stats.set(r.account_id, cur);
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      total_spend: stats.get(r.id)?.spend ?? 0,
      days_with_data: stats.get(r.id)?.days.size ?? 0,
    }));
  });

export const saveChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid().optional(),
        platform: z.enum(["google", "tiktok"]),
        name: z.string().trim().min(1).max(120),
        externalId: z.string().trim().min(1).max(120),
        currency: z.string().trim().min(2).max(6).default("BDT"),
        usdToBdtRate: z.coerce.number().positive().default(120),
        active: z.boolean().default(true),
        brandIds: z.array(z.string().uuid()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingWriter(context.supabase, context.userId);
    const primary = data.brandIds[0];
    const payload = {
      brand_id: primary,
      platform: data.platform,
      external_id: data.externalId,
      name: data.name,
      currency: data.currency.toUpperCase(),
      usd_to_bdt_rate: data.usdToBdtRate,
      status: data.active ? "active" : "paused",
      auto_post_to_finance: false,
    };
    let accountId = data.accountId;
    if (accountId) {
      const { error } = await context.supabase
        .from("mkt_ad_accounts")
        .update(payload as never)
        .eq("id", accountId);
      if (error) throw error;
    } else {
      const { data: row, error } = await context.supabase
        .from("mkt_ad_accounts")
        .upsert(payload as never, { onConflict: "brand_id,external_id" })
        .select("id")
        .single();
      if (error) throw error;
      accountId = row.id as string;
    }
    await syncAccountBrandLinks(context.supabase, accountId!, data.brandIds, primary);
    return { ok: true, accountId };
  });

export const deleteChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMarketingWriter(context.supabase, context.userId);
    const { data: acc, error: accErr } = await context.supabase
      .from("mkt_ad_accounts")
      .select("platform")
      .eq("id", data.accountId)
      .single();
    if (accErr) throw accErr;
    if (acc.platform === "meta") throw new Error("Meta account ekhan theke delete kora jabe na");
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

export const importChannelSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              campaign: z.string().min(1).max(180),
              spend: z.number().min(0),
              impressions: z.number().min(0),
              clicks: z.number().min(0),
              purchases: z.number().min(0),
              purchase_value: z.number().min(0),
            }),
          )
          .min(1)
          .max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingWriter(context.supabase, context.userId);
    return ingestChannelSpend(context.supabase, { accountId: data.accountId, rows: data.rows });
  });