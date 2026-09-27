import { calcRoas } from "@/lib/erp/marketing/roas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marketing Overview — single-shot aggregator for /erp/marketing (Phase 1).
 * All numbers come from canonical RPCs; no calculation here.
 *   - get_meta_spend_bdt : ad spend (BDT, FIFO w/ fallback)
 *   - get_campaign_profit: delivered revenue + orders
 * Action-strip counts come from raw tables (read-only).
 */

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Dhaka-local YYYY-MM-DD from client
});

function daysBack(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export const getMarketingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { brandIds, today } = data;
    const from7 = daysBack(today, 6);

    // Per-brand parallel fan-out; keeps each RPC signature untouched.
    const perBrand = await Promise.all(
      brandIds.map(async (bid) => {
        const [spendToday, spend7d, profitToday] = await Promise.all([
          context.supabase.rpc("get_meta_spend_bdt", {
            _brand_id: bid,
            _from: today,
            _to: today,
          }),
          context.supabase.rpc("get_meta_spend_bdt", {
            _brand_id: bid,
            _from: from7,
            _to: today,
          }),
          context.supabase.rpc("get_campaign_profit", {
            _brand_id: bid,
            _from: today,
            _to: today,
          }),
        ]);
        if (spendToday.error) throw spendToday.error;
        if (spend7d.error) throw spend7d.error;
        if (profitToday.error) throw profitToday.error;
        return {
          spendTodayRows: (spendToday.data ?? []) as any[],
          spend7dRows: (spend7d.data ?? []) as any[],
          profitTodayRows: (profitToday.data ?? []) as any[],
        };
      }),
    );

    // Today totals
    let spend_today = 0;
    let revenue_today = 0;
    let orders_today = 0;
    for (const b of perBrand) {
      for (const r of b.spendTodayRows) spend_today += Number(r.spend_bdt) || 0;
      for (const r of b.profitTodayRows) {
        revenue_today += Number(r.delivered_revenue) || 0;
        orders_today += Number(r.delivered_orders) || 0;
      }
    }

    // 7-day sparkline: sum spend across brands per day
    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) dayMap.set(daysBack(today, i), 0);
    for (const b of perBrand) {
      for (const r of b.spend7dRows) {
        const key = String(r.day).slice(0, 10);
        dayMap.set(key, (dayMap.get(key) ?? 0) + (Number(r.spend_bdt) || 0));
      }
    }
    const sparkline = Array.from(dayMap.entries()).map(([day, spend]) => ({
      day,
      spend,
    }));

    // Action strip: sync health + pending queues + wallet balance
    const [accts, pendAttr, unassigned, wallet] = await Promise.all([
      context.supabase
        .from("mkt_ad_accounts")
        .select("id,name,status,last_insights_sync_at,last_error")
        .eq("status", "active"),
      context.supabase
        .from("mkt_attribution_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      context.supabase
        .from("mkt_campaigns")
        .select("id", { count: "exact", head: true })
        .is("brand_id", null),
      context.supabase
        .from("meta_ad_wallet_ledger")
        .select("ad_account_id,balance_usd_after,created_at")
        .order("created_at", { ascending: false }),
    ]);
    if (accts.error) throw accts.error;
    if (wallet.error) throw wallet.error;

    const nowMs = Date.now();
    const staleThresholdMs = 2 * 60 * 60 * 1000;
    let stale = 0;
    for (const a of accts.data ?? []) {
      const ts = a.last_insights_sync_at ? new Date(a.last_insights_sync_at).getTime() : 0;
      if (!ts || nowMs - ts > staleThresholdMs) stale += 1;
    }
    const activeCount = (accts.data ?? []).length;

    // Latest balance per account, then sum (matches dashboard/ledger convention)
    const seen = new Set<string>();
    let walletUsd = 0;
    for (const row of wallet.data ?? []) {
      if (!row.ad_account_id || seen.has(row.ad_account_id)) continue;
      seen.add(row.ad_account_id);
      walletUsd += Number(row.balance_usd_after) || 0;
    }

    return {
      today: {
        date: today,
        spend_bdt: spend_today,
        revenue_bdt: revenue_today,
        orders: orders_today,
        roas: calcRoas(revenue_today, spend_today),
        cpo: orders_today > 0 ? spend_today / orders_today : 0,
      },
      sparkline,
      actions: {
        active_accounts: activeCount,
        stale_accounts: stale,
        pending_attribution: pendAttr.count ?? 0,
        unassigned_campaigns: unassigned.count ?? 0,
        wallet_usd: walletUsd,
      },
    };
  });
