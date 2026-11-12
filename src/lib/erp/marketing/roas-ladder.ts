/**
 * ROAS ladder — the ONE definition of the four ROAS stages used across the
 * marketing module. Every stage is "value ÷ ad spend (BDT)", the only thing that
 * changes is which order value counts:
 *
 *   1. Meta ROAS       — purchase value Meta's pixel claims (platform view)
 *   2. Booked ROAS     — every ERP order matched to the campaign (UTM / fb campaign id)
 *   3. Confirmed ROAS  — of those, orders confirmed by call or moved forward
 *   4. Delivered ROAS  — of those, orders actually delivered (the real number)
 *
 * All ERP stages are an order-date COHORT: orders created in the window, with
 * their CURRENT status. So a recent window naturally shows Delivered < Confirmed
 * because parcels are still in transit — `pipeline` + `expectedDeliveredRoas`
 * exist so that gap is never misread as a loss.
 *
 * Inputs come straight from `getCampaignTruth` (mkt_campaign_truth +
 * mkt_campaign_cash). Do not hand-roll another ROAS formula elsewhere.
 */
import { calcRoas } from "./roas";

export type LadderTotals = {
  spend: number;
  meta_purchases: number;
  meta_value: number;
  booked_count: number;
  booked_value: number;
  confirmed_count: number;
  confirmed_value: number;
  delivered_count: number;
  delivered_value: number;
  cancelled_count: number;
  returned_count: number;
  /** Net cash received (null = not settled yet, never fake 0) */
  collected: number | null;
  /** Realized profit after COGS/opex/returns/ad spend (null = pending) */
  realized_profit: number | null;
};

export const EMPTY_TOTALS: LadderTotals = {
  spend: 0,
  meta_purchases: 0,
  meta_value: 0,
  booked_count: 0,
  booked_value: 0,
  confirmed_count: 0,
  confirmed_value: 0,
  delivered_count: 0,
  delivered_value: 0,
  cancelled_count: 0,
  returned_count: 0,
  collected: null,
  realized_profit: null,
};

/** Minimal shape we read from a CampaignTruthRow (kept loose so tests stay simple). */
export type LadderSourceRow = {
  spend?: number | null;
  meta_purchases?: number | null;
  meta_purchase_value?: number | null;
  booked_order_count?: number | null;
  booked_value?: number | null;
  confirmed_count?: number | null;
  confirmed_value?: number | null;
  delivered_count?: number | null;
  delivered_order_value?: number | null;
  cancelled_count?: number | null;
  returned_count?: number | null;
  collected_amount?: number | null;
  realized_profit?: number | null;
};

const n = (v: unknown) => Number(v) || 0;

const addNullable = (a: number | null, b: number | null | undefined) =>
  b === null || b === undefined ? a : (a ?? 0) + Number(b);

export function totalsFromRow(r: LadderSourceRow): LadderTotals {
  return sumTotals([r]);
}

export function sumTotals(rows: LadderSourceRow[]): LadderTotals {
  const t: LadderTotals = { ...EMPTY_TOTALS };
  for (const r of rows) {
    t.spend += n(r.spend);
    t.meta_purchases += n(r.meta_purchases);
    t.meta_value += n(r.meta_purchase_value);
    t.booked_count += n(r.booked_order_count);
    t.booked_value += n(r.booked_value);
    t.confirmed_count += n(r.confirmed_count);
    t.confirmed_value += n(r.confirmed_value);
    t.delivered_count += n(r.delivered_count);
    t.delivered_value += n(r.delivered_order_value);
    t.cancelled_count += n(r.cancelled_count);
    t.returned_count += n(r.returned_count);
    t.collected = addNullable(t.collected, r.collected_amount);
    t.realized_profit = addNullable(t.realized_profit, r.realized_profit);
  }
  return t;
}

export function mergeTotals(list: LadderTotals[]): LadderTotals {
  return sumTotals(
    list.map((t) => ({
      spend: t.spend,
      meta_purchases: t.meta_purchases,
      meta_purchase_value: t.meta_value,
      booked_order_count: t.booked_count,
      booked_value: t.booked_value,
      confirmed_count: t.confirmed_count,
      confirmed_value: t.confirmed_value,
      delivered_count: t.delivered_count,
      delivered_order_value: t.delivered_value,
      cancelled_count: t.cancelled_count,
      returned_count: t.returned_count,
      collected_amount: t.collected,
      realized_profit: t.realized_profit,
    })),
  );
}

export type StageKey = "meta" | "booked" | "confirmed" | "delivered";

export type LadderStage = {
  key: StageKey;
  label: string;
  short: string;
  /** One-line plain explanation, shown as tooltip */
  hint: string;
  value: number;
  count: number;
  roas: number;
  /** % of the previous ERP stage's value that survived (null for meta/booked) */
  keptPct: number | null;
};

export type Ladder = {
  stages: LadderStage[];
  spend: number;
  /** Booked orders whose status is not final yet (still could deliver) */
  pipelineCount: number;
  /** Confirmed ÷ booked orders */
  confirmRate: number | null;
  /** Delivered ÷ (delivered + returned) — success of parcels that finished */
  deliverySuccess: number | null;
  /** Booked orders vs Meta purchases: >0 means Meta over-claims */
  metaGapPct: number | null;
  /** Spend per delivered order */
  costPerDelivered: number | null;
  /** Spend per booked order */
  costPerBooked: number | null;
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export const STAGE_META: Record<StageKey, { label: string; short: string; hint: string }> = {
  meta: {
    label: "Meta ROAS",
    short: "Meta",
    hint: "Meta pixel যত purchase value দাবি করে ÷ ad spend। প্ল্যাটফর্মের দাবি, আসল না।",
  },
  booked: {
    label: "Booked ROAS",
    short: "Booked",
    hint: "UTM / campaign ID দিয়ে ERP তে match হওয়া সব order এর value ÷ ad spend।",
  },
  confirmed: {
    label: "Confirmed ROAS",
    short: "Confirmed",
    hint: "Booked order এর মধ্যে যেগুলো confirm হয়েছে (cancel/fake বাদ) তার value ÷ ad spend।",
  },
  delivered: {
    label: "Delivered ROAS",
    short: "Delivered",
    hint: "যেগুলো আসলেই deliver হয়েছে তার value ÷ ad spend। Scale/pause এর সিদ্ধান্ত এটা দিয়ে।",
  },
};

export function buildLadder(t: LadderTotals): Ladder {
  const stage = (
    key: StageKey,
    value: number,
    count: number,
    keptPct: number | null,
  ): LadderStage => ({
    key,
    ...STAGE_META[key],
    value,
    count,
    roas: calcRoas(value, t.spend),
    keptPct,
  });
  const finished = t.delivered_count + t.returned_count;
  const pipelineCount = Math.max(
    0,
    t.booked_count - t.cancelled_count - t.delivered_count - t.returned_count,
  );
  return {
    spend: t.spend,
    stages: [
      stage("meta", t.meta_value, t.meta_purchases, null),
      stage("booked", t.booked_value, t.booked_count, null),
      stage(
        "confirmed",
        t.confirmed_value,
        t.confirmed_count,
        pct(t.confirmed_value, t.booked_value),
      ),
      stage(
        "delivered",
        t.delivered_value,
        t.delivered_count,
        pct(t.delivered_value, t.confirmed_value),
      ),
    ],
    pipelineCount,
    confirmRate: pct(t.confirmed_count, t.booked_count),
    deliverySuccess: pct(t.delivered_count, finished),
    metaGapPct:
      t.booked_count > 0 && t.meta_purchases > 0
        ? Math.round(((t.meta_purchases - t.booked_count) / t.booked_count) * 1000) / 10
        : null,
    costPerDelivered: t.delivered_count > 0 ? t.spend / t.delivered_count : null,
    costPerBooked: t.booked_count > 0 ? t.spend / t.booked_count : null,
  };
}

/**
 * Expected Delivered ROAS for a window whose parcels are still moving.
 *
 * In-flight confirmed orders (confirmed − delivered − returned) are valued at
 * the window's average confirmed order value and multiplied by a delivery
 * success rate learned from an OLDER, matured window (default caller: days
 * −37…−8). This is an estimate, always labelled as such in the UI, and never
 * feeds verdicts or profit.
 */
export function expectedDeliveredRoas(
  t: LadderTotals,
  maturedSuccessRate: number | null,
): number | null {
  if (t.spend <= 0 || maturedSuccessRate === null) return null;
  const inflight = Math.max(0, t.confirmed_count - t.delivered_count - t.returned_count);
  if (inflight === 0) return calcRoas(t.delivered_value, t.spend);
  const avg = t.confirmed_count > 0 ? t.confirmed_value / t.confirmed_count : 0;
  const expected = t.delivered_value + inflight * avg * (maturedSuccessRate / 100);
  return calcRoas(expected, t.spend);
}

/** Relative change (%) between two numbers; null when not comparable. */
export function deltaPct(cur: number | null | undefined, prev: number | null | undefined) {
  const c = Number(cur);
  const p = Number(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}

/* ---------------- Dhaka date helpers (shared by marketing pages) ---------------- */

export function dhakaDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const base = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return (
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

/* ---------------- Campaign decision (Scale / Keep / Watch / Pause) ---------------- */

export type Decision =
  "scale" | "keep" | "watch" | "pause" | "early_good" | "early_weak" | "no_data";

export const DECISION_META: Record<
  Decision,
  { label: string; hint: string; tone: "good" | "ok" | "warn" | "bad" | "muted" }
> = {
  scale: {
    label: "Scale",
    hint: "Cash এ লাভ, ROAS breakeven এর অনেক উপরে। Budget বাড়ানো যায়।",
    tone: "good",
  },
  keep: { label: "লাভে", hint: "Cash এ লাভে আছে। এভাবেই চালাও।", tone: "good" },
  watch: {
    label: "নজর রাখো",
    hint: "Breakeven এর কাছাকাছি। Creative/অডিয়েন্স টেস্ট করো।",
    tone: "warn",
  },
  pause: {
    label: "Pause?",
    hint: "Settle হওয়া cash এ লস। Pause বা fix করার কথা ভাবো।",
    tone: "bad",
  },
  early_good: {
    label: "শুরু ভালো",
    hint: "এখনো settle হয়নি, তবে আনুমানিক Delivered ROAS breakeven এর উপরে।",
    tone: "ok",
  },
  early_weak: {
    label: "শুরু দুর্বল",
    hint: "এখনো settle হয়নি, আনুমানিক Delivered ROAS breakeven এর নিচে।",
    tone: "warn",
  },
  no_data: { label: "ডেটা কম", hint: "Spend বা order যথেষ্ট না।", tone: "muted" },
};

/**
 * Cash verdict (from getCampaignTruth) wins whenever the data is mature.
 * Only while it is "too early" do we fall back to an early read: expected
 * delivered ROAS (or confirmed ROAS) against the campaign's breakeven ROAS.
 */
export function campaignDecision(
  row: {
    spend?: number | null;
    verdict?: string | null;
    truth_status?: string | null;
    breakeven_roas?: number | null;
  },
  ladder: Ladder,
  expected: number | null,
): Decision {
  const spend = Number(row.spend) || 0;
  if (spend <= 0) return "no_data";
  switch (row.verdict) {
    case "scaling":
      return "scale";
    case "profitable":
      return "keep";
    case "breakeven":
      return "watch";
    case "losing":
      return "pause";
  }
  const booked = ladder.stages[1];
  if (booked.count === 0) return spend >= 500 ? "early_weak" : "no_data";
  const est = expected ?? ladder.stages[2].roas;
  const be = Number(row.breakeven_roas) || 0;
  if (be <= 0 || est <= 0) return "watch";
  if (est >= be * 1.2) return "early_good";
  if (est < be) return "early_weak";
  return "watch";
}

/** Portfolio breakeven ROAS: delivered revenue ÷ gross profit (pre-ad) across rows. */
export function portfolioBreakeven(
  rows: { delivered_revenue?: number | null; gross_profit?: number | null }[],
): number | null {
  let rev = 0;
  let gp = 0;
  for (const r of rows) {
    rev += Number(r.delivered_revenue) || 0;
    gp += Number(r.gross_profit) || 0;
  }
  return rev > 0 && gp > 0 ? Math.round((rev / gp) * 100) / 100 : null;
}
