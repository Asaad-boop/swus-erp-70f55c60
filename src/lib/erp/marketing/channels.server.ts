/** Phase 9 — multi-channel (Google Ads / TikTok Ads) account + spend ingest logic. */

export const CHANNEL_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
};

export type ChannelSpendRow = {
  date: string;
  campaign: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
};

export async function assertMarketingWriter(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

export async function syncAccountBrandLinks(
  supabase: any,
  accountId: string,
  brandIds: string[],
  primaryBrandId: string,
) {
  await supabase.from("mkt_ad_account_brands").delete().eq("ad_account_id", accountId);
  const rows = brandIds.map((b) => ({
    ad_account_id: accountId,
    brand_id: b,
    is_primary: b === primaryBrandId,
  }));
  const { error } = await supabase.from("mkt_ad_account_brands").insert(rows);
  if (error) throw error;
}

/** Parse a pasted CSV / TSV block into normalized spend rows. */
export function parseChannelSpendCsv(text: string): { rows: ChannelSpendRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ChannelSpendRow[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const cells = line.split(/\t|,|;/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /date/i.test(cells[0] ?? "")) continue; // header
    const [date, campaign, spend, impressions, clicks, purchases, value] = cells;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Line ${i + 1}: date YYYY-MM-DD hote hobe`);
      continue;
    }
    if (!campaign) {
      errors.push(`Line ${i + 1}: campaign name nei`);
      continue;
    }
    const num = (v?: string) => {
      const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    rows.push({
      date,
      campaign,
      spend: num(spend),
      impressions: Math.round(num(impressions)),
      clicks: Math.round(num(clicks)),
      purchases: Math.round(num(purchases)),
      purchase_value: num(value),
    });
  }
  return { rows, errors };
}

/** Upsert campaign shells + campaign-level daily insight rows for a non-Meta account. */
export async function ingestChannelSpend(
  supabase: any,
  opts: { accountId: string; rows: ChannelSpendRow[] },
) {
  const { data: account, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("id, brand_id, platform, usd_to_bdt_rate, currency")
    .eq("id", opts.accountId)
    .single();
  if (accErr) throw accErr;
  if (account.platform === "meta") throw new Error("Meta account API theke sync hoy — manual import na");

  const names = Array.from(new Set(opts.rows.map((r) => r.campaign)));
  const campaignIdByName = new Map<string, string>();
  for (const name of names) {
    const externalId = `${account.platform}:${name}`.slice(0, 180);
    const { data: camp, error } = await supabase
      .from("mkt_campaigns")
      .upsert(
        {
          account_id: account.id,
          brand_id: account.brand_id,
          external_id: externalId,
          name,
          status: "ACTIVE",
          effective_status: "ACTIVE",
        },
        { onConflict: "account_id,external_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    campaignIdByName.set(name, camp.id);
  }

  let inserted = 0;
  for (const r of opts.rows) {
    const campaignId = campaignIdByName.get(r.campaign)!;
    await supabase
      .from("mkt_insights_daily")
      .delete()
      .eq("account_id", account.id)
      .eq("date", r.date)
      .eq("campaign_id", campaignId)
      .is("ad_id", null);
    const { error } = await supabase.from("mkt_insights_daily").insert({
      account_id: account.id,
      brand_id: account.brand_id,
      campaign_id: campaignId,
      date: r.date,
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      reach: 0,
      meta_purchases: r.purchases,
      meta_purchase_value: r.purchase_value,
      ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
      cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
      cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0,
      conversion_source: `${account.platform}_manual`,
      estimated_bdt_cost: true,
      raw: { source: "manual_import", platform: account.platform },
    });
    if (error) throw error;
    inserted += 1;
  }

  await supabase
    .from("mkt_ad_accounts")
    .update({ last_insights_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", account.id);

  return { inserted, campaigns: names.length };
}