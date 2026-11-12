import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sumTotals, type LadderTotals } from "./roas-ladder";

/**
 * Day-by-day ROAS ladder (order-date cohort) for the Today page trend.
 *
 * Calls the same `mkt_campaign_truth` RPC the Campaigns page uses, once per
 * day, and sums campaigns into one ladder row per day. No new SQL, no second
 * revenue definition — the numbers reconcile exactly with the campaign table
 * for any single day.
 */
export type DailyLadderRow = { day: string } & LadderTotals;

const MAX_DAYS = 31;
const CONCURRENCY = 6;

export const getDailyLadder = createServerFn({ method: "POST" })
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
    const days: string[] = [];
    const cur = new Date(`${data.from}T00:00:00Z`);
    const end = new Date(`${data.to}T00:00:00Z`);
    while (cur <= end && days.length < MAX_DAYS) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const out: DailyLadderRow[] = new Array(days.length);
    let next = 0;
    const worker = async () => {
      while (next < days.length) {
        const i = next++;
        const day = days[i];
        const { data: rows, error } = await context.supabase.rpc("mkt_campaign_truth", {
          _brand_ids: data.brandIds,
          _from: day,
          _to: day,
        } as never);
        if (error) throw error;
        // Cash + realized profit need the courier-fee / canonical cost pass in
        // getCampaignTruth — raw RPC cash is gross, so never show it per day.
        const t = sumTotals((Array.isArray(rows) ? rows : []) as never[]);
        out[i] = { day, ...t, collected: null, realized_profit: null };
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, days.length) }, worker));
    return out;
  });
