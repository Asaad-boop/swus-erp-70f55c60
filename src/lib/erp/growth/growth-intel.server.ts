/**
 * Central Growth intelligence engine.
 *
 * This is the ONLY place that turns canonical numbers into Problems,
 * Opportunities and Growth Score components. Every alert carries the exact
 * metrics it was derived from, so any claim is traceable back to the data.
 * No heuristics that are not computable from the supplied inputs.
 */

export type AlertSeverity = "critical" | "warning" | "info" | "success";

export type GrowthAlert = {
  id: string;
  type: string;
  kind: "problem" | "opportunity";
  severity: AlertSeverity;
  title: string;
  problem: string;
  why: string;
  recommended_action: string;
  supporting_metrics: { label: string; value: string }[];
  entity_type: "brand" | "product" | "campaign" | "content" | "goal" | null;
  entity_id: string | null;
  route: string | null;
};

export type PeriodKpis = {
  revenue: number; // delivered revenue
  booked_revenue: number;
  orders: number;
  delivered_orders: number;
  profit: number; // contribution profit after ad spend
  ad_spend: number;
  cpa: number | null;
  roas: number | null;
  aov: number | null;
  cvr: number | null; // orders / clicks
  clicks: number;
  impressions: number;
  return_rate: number | null;
};

export type ProductRow = {
  product_id: string;
  title: string;
  sku: string | null;
  delivered_units: number;
  delivered_revenue: number;
  gross_profit: number;
  stock: number;
  available_stock?: number;
  low_stock_threshold: number | null;
};

export type CampaignRow = {
  campaign_id: string;
  name: string;
  spend: number;
  delivered_orders: number;
  delivered_revenue: number;
  gross_profit: number;
  status: string | null;
  daily_budget: number | null;
};

export type ContentRow = {
  id: string;
  title: string;
  platform: string | null;
  views: number;
  attributed_orders: number;
  published_at: string | null;
};

const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
const bdt = (n: number) =>
  `৳${Math.round(n).toLocaleString("en-BD")}`;
const p1 = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function deltaPct(cur: number, prev: number) {
  return pct(cur, prev);
}

export type IntelInput = {
  current: PeriodKpis;
  previous: PeriodKpis;
  products: ProductRow[];
  campaigns: CampaignRow[];
  content: ContentRow[];
  goal: { target: number; achieved: number; expected: number; label: string } | null;
  days: number;
};

/** Build every problem + opportunity from canonical numbers. */
export function buildAlerts(input: IntelInput): GrowthAlert[] {
  const { current: c, previous: p } = input;
  const out: GrowthAlert[] = [];
  const add = (a: GrowthAlert) => out.push(a);

  // --- CPA spike ---
  if (c.cpa !== null && p.cpa !== null && p.cpa > 0 && c.orders >= 5) {
    const d = pct(c.cpa, p.cpa)!;
    if (d >= 15)
      add({
        id: "cpa_spike",
        type: "cpa_spike",
        kind: "problem",
        severity: d >= 40 ? "critical" : "warning",
        title: `CPA ${p1(d)}`,
        problem: `Cost per order rose from ${bdt(p.cpa)} to ${bdt(c.cpa)}.`,
        why: `Ad spend ${bdt(c.ad_spend)} (was ${bdt(p.ad_spend)}) produced ${c.orders} orders (was ${p.orders}).`,
        recommended_action:
          "Check Media Center for the campaigns whose CPA is above break-even and pause or rebuild their creatives.",
        supporting_metrics: [
          { label: "CPA now", value: bdt(c.cpa) },
          { label: "CPA before", value: bdt(p.cpa) },
          { label: "Spend", value: bdt(c.ad_spend) },
        ],
        entity_type: "brand",
        entity_id: null,
        route: "/erp/growth/media",
      });
  }

  // --- ROAS drop ---
  if (c.roas !== null && p.roas !== null && p.roas > 0) {
    const d = pct(c.roas, p.roas)!;
    if (d <= -15)
      add({
        id: "roas_drop",
        type: "roas_drop",
        kind: "problem",
        severity: d <= -35 ? "critical" : "warning",
        title: `Delivered ROAS ${p1(d)}`,
        problem: `ROAS fell from ${p.roas.toFixed(2)}x to ${c.roas.toFixed(2)}x.`,
        why: `Delivered revenue ${bdt(c.revenue)} against ad spend ${bdt(c.ad_spend)}.`,
        recommended_action: "Shift budget to campaigns whose CPA sits below break-even; stop the rest.",
        supporting_metrics: [
          { label: "ROAS now", value: `${c.roas.toFixed(2)}x` },
          { label: "ROAS before", value: `${p.roas.toFixed(2)}x` },
        ],
        entity_type: "brand",
        entity_id: null,
        route: "/erp/growth/media",
      });
  }

  // --- Sales drop ---
  if (p.orders >= 10) {
    const d = pct(c.orders, p.orders)!;
    if (d <= -15)
      add({
        id: "sales_drop",
        type: "sales_drop",
        kind: "problem",
        severity: d <= -30 ? "critical" : "warning",
        title: `Orders ${p1(d)}`,
        problem: `${c.orders} orders this period vs ${p.orders} in the previous equivalent period.`,
        why: `Booked revenue ${bdt(c.booked_revenue)} vs ${bdt(p.booked_revenue)}.`,
        recommended_action: "Check traffic and creative fatigue in Media Center, and confirm no campaign was paused.",
        supporting_metrics: [
          { label: "Orders", value: String(c.orders) },
          { label: "Previous", value: String(p.orders) },
        ],
        entity_type: "brand",
        entity_id: null,
        route: "/erp/growth/analytics",
      });
  }

  // --- Profit drop ---
  if (p.profit > 0) {
    const d = pct(c.profit, p.profit)!;
    if (d <= -20)
      add({
        id: "profit_drop",
        type: "profit_drop",
        kind: "problem",
        severity: c.profit < 0 ? "critical" : "warning",
        title: `Profit ${p1(d)}`,
        problem: `Contribution profit ${bdt(c.profit)} vs ${bdt(p.profit)} previously.`,
        why: `Delivered revenue ${bdt(c.revenue)} minus product, courier, packaging and ${bdt(c.ad_spend)} ad cost.`,
        recommended_action: "Review unit economics in Product Lab for the products carrying most of the spend.",
        supporting_metrics: [
          { label: "Profit", value: bdt(c.profit) },
          { label: "Previous", value: bdt(p.profit) },
        ],
        entity_type: "brand",
        entity_id: null,
        route: "/erp/growth/products",
      });
  }

  // --- Return rate increase ---
  if (c.return_rate !== null && p.return_rate !== null && c.return_rate - p.return_rate >= 3)
    add({
      id: "return_rate_up",
      type: "return_rate_up",
      kind: "problem",
      severity: c.return_rate >= 20 ? "critical" : "warning",
      title: `Return rate ${c.return_rate.toFixed(1)}%`,
      problem: `Returns moved from ${p.return_rate.toFixed(1)}% to ${c.return_rate.toFixed(1)}% of orders.`,
      why: "Higher returns destroy delivered margin and inflate courier cost per delivered order.",
      recommended_action: "Tighten order confirmation calls and review the products driving returns.",
      supporting_metrics: [
        { label: "Now", value: `${c.return_rate.toFixed(1)}%` },
        { label: "Before", value: `${p.return_rate.toFixed(1)}%` },
      ],
      entity_type: "brand",
      entity_id: null,
      route: "/erp/returns",
    });

  // --- Target behind pace ---
  if (input.goal && input.goal.target > 0) {
    const g = input.goal;
    const gap = pct(g.expected, g.target)!;
    if (gap <= -5)
      add({
        id: "target_behind",
        type: "target_behind",
        kind: "problem",
        severity: gap <= -20 ? "critical" : "warning",
        title: `${g.label} forecast ${p1(gap)} vs target`,
        problem: `At the current pace the month closes at ${bdt(g.expected)} against a ${bdt(g.target)} target.`,
        why: `${bdt(g.achieved)} achieved so far.`,
        recommended_action: "Raise daily budget on profitable products or launch an offer to close the gap.",
        supporting_metrics: [
          { label: "Target", value: bdt(g.target) },
          { label: "Achieved", value: bdt(g.achieved) },
          { label: "Forecast", value: bdt(g.expected) },
        ],
        entity_type: "goal",
        entity_id: null,
        route: "/erp/growth/goals",
      });
  }

  // --- Low stock on selling products ---
  for (const pr of input.products.filter((x) => x.delivered_units > 0).slice(0, 40)) {
    const daily = pr.delivered_units / Math.max(1, input.days);
    if (daily <= 0) continue;
    const available = Number(pr.available_stock ?? pr.stock);
    const daysLeft = available / daily;
    if (daysLeft <= 7)
      add({
        id: `low_stock_${pr.product_id}`,
        type: "low_stock",
        kind: "problem",
        severity: daysLeft <= 3 ? "critical" : "warning",
        title: `${pr.title} — ${Math.floor(daysLeft)}d stock left`,
        problem: `${available} pcs available after reservations while selling ${daily.toFixed(1)} pcs/day.`,
        why: `${pr.delivered_units} pcs delivered over the last ${input.days} day(s).`,
        recommended_action: "Reorder now or the ads will spend on a product you cannot ship.",
        supporting_metrics: [
          { label: "Available", value: String(available) },
          { label: "Daily sales", value: daily.toFixed(1) },
        ],
        entity_type: "product",
        entity_id: pr.product_id,
        route: "/erp/reorder-queue",
      });
  }

  // --- Campaign overspend (spend, no delivered profit) ---
  for (const cp of input.campaigns) {
    if (cp.spend >= 3000 && cp.delivered_orders === 0)
      add({
        id: `overspend_${cp.campaign_id}`,
        type: "campaign_overspend",
        kind: "problem",
        severity: "critical",
        title: `${cp.name} spent ${bdt(cp.spend)}, 0 delivered orders`,
        problem: "Budget is running with no delivered order attributed in this period.",
        why: "Either the campaign is not converting or attribution is missing for it.",
        recommended_action: "Stop the campaign, or fix attribution before it spends further.",
        supporting_metrics: [
          { label: "Spend", value: bdt(cp.spend) },
          { label: "Delivered orders", value: "0" },
        ],
        entity_type: "campaign",
        entity_id: cp.campaign_id,
        route: "/erp/growth/media",
      });
  }

  // ================= OPPORTUNITIES =================

  // Winning products: profitable and cheap to acquire
  const profitable = [...input.products]
    .filter((x) => x.gross_profit > 0 && x.delivered_units >= 3)
    .sort((a, b) => b.gross_profit - a.gross_profit);
  const topProduct = profitable[0];
  if (topProduct) {
    const marginPct = (topProduct.gross_profit / Math.max(1, topProduct.delivered_revenue)) * 100;
    if (marginPct >= 20)
      add({
        id: `winning_product_${topProduct.product_id}`,
        type: "winning_product",
        kind: "opportunity",
        severity: "success",
        title: `${topProduct.title} is the profit leader`,
        problem: `${bdt(topProduct.gross_profit)} contribution profit on ${bdt(topProduct.delivered_revenue)} delivered revenue.`,
        why: `${marginPct.toFixed(1)}% contribution margin across ${topProduct.delivered_units} delivered units.`,
        recommended_action: "Increase budget on this product and produce 3 creative variations of its best ad.",
        supporting_metrics: [
          { label: "Profit", value: bdt(topProduct.gross_profit) },
          { label: "Margin", value: `${marginPct.toFixed(1)}%` },
          { label: "Units", value: String(topProduct.delivered_units) },
        ],
        entity_type: "product",
        entity_id: topProduct.product_id,
        route: "/erp/growth/products",
      });
  }

  // Winning campaign: profitable with headroom
  const bestCampaign = [...input.campaigns]
    .filter((x) => x.spend > 0 && x.delivered_orders >= 3)
    .sort((a, b) => b.gross_profit - a.gross_profit)[0];
  if (bestCampaign && bestCampaign.gross_profit > 0) {
    const cpa = bestCampaign.spend / bestCampaign.delivered_orders;
    const profitPerOrder = bestCampaign.gross_profit / bestCampaign.delivered_orders;
    const breakEven = cpa + profitPerOrder;
    if (profitPerOrder > 0)
      add({
        id: `winning_campaign_${bestCampaign.campaign_id}`,
        type: "winning_campaign",
        kind: "opportunity",
        severity: "success",
        title: `${bestCampaign.name} is ${(((breakEven - cpa) / breakEven) * 100).toFixed(0)}% below break-even CPA`,
        problem: `CPA ${bdt(cpa)} against a break-even CPA of ${bdt(breakEven)}.`,
        why: `${bestCampaign.delivered_orders} delivered orders, ${bdt(bestCampaign.gross_profit)} profit on ${bdt(bestCampaign.spend)} spend.`,
        recommended_action: "Scale this campaign's daily budget by 20% and re-check CPA in 3 days.",
        supporting_metrics: [
          { label: "CPA", value: bdt(cpa) },
          { label: "Break-even CPA", value: bdt(breakEven) },
          { label: "Profit", value: bdt(bestCampaign.gross_profit) },
        ],
        entity_type: "campaign",
        entity_id: bestCampaign.campaign_id,
        route: "/erp/growth/media",
      });
  }

  // Winning creative / content
  const bestContent = [...input.content]
    .filter((x) => x.attributed_orders > 0)
    .sort((a, b) => b.attributed_orders - a.attributed_orders)[0];
  if (bestContent) {
    const avg =
      input.content.reduce((s, x) => s + x.attributed_orders, 0) / Math.max(1, input.content.length);
    if (avg > 0 && bestContent.attributed_orders >= avg * 2)
      add({
        id: `winning_creative_${bestContent.id}`,
        type: "winning_creative",
        kind: "opportunity",
        severity: "success",
        title: `${bestContent.title} drives ${(bestContent.attributed_orders / avg).toFixed(1)}x the average orders`,
        problem: `${bestContent.attributed_orders} attributed orders vs an average of ${avg.toFixed(1)} per content piece.`,
        why: `${bestContent.views.toLocaleString()} views on ${bestContent.platform ?? "its platform"}.`,
        recommended_action: "Create 3 variations of this creative with the same hook.",
        supporting_metrics: [
          { label: "Orders", value: String(bestContent.attributed_orders) },
          { label: "Views", value: bestContent.views.toLocaleString() },
        ],
        entity_type: "content",
        entity_id: bestContent.id,
        route: "/erp/growth/content",
      });
  }

  // Stock opportunity: profitable product with deep stock and low velocity
  const slowRich = input.products.find(
    (x) => x.stock >= 100 && x.delivered_units > 0 && x.delivered_units / Math.max(1, input.days) < 1 && x.gross_profit > 0,
  );
  if (slowRich)
    add({
      id: `stock_opportunity_${slowRich.product_id}`,
      type: "stock_opportunity",
      kind: "opportunity",
      severity: "info",
      title: `${slowRich.title} has ${slowRich.stock} pcs but sells under 1/day`,
      problem: `Capital is parked in stock while the product still returns ${bdt(slowRich.gross_profit)} profit.`,
      why: `${slowRich.delivered_units} units delivered in ${input.days} day(s).`,
      recommended_action: "Push traffic or bundle it with a fast mover to convert stock into cash.",
      supporting_metrics: [
        { label: "Stock", value: String(slowRich.stock) },
        { label: "Profit", value: bdt(slowRich.gross_profit) },
      ],
      entity_type: "product",
      entity_id: slowRich.product_id,
      route: "/erp/growth/products",
    });

  return out;
}

export type ScoreComponent = {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
  sufficient: boolean;
};

export type GrowthScore = {
  score: number | null;
  grade: string;
  components: ScoreComponent[];
  strength: ScoreComponent | null;
  weakness: ScoreComponent | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Growth score — every component is computed, never guessed. */
export function buildScore(input: IntelInput): GrowthScore {
  const { current: c, previous: p } = input;
  const comps: ScoreComponent[] = [];

  // Revenue growth
  const rg = p.revenue > 0 ? pct(c.revenue, p.revenue)! : null;
  comps.push({
    key: "revenue_growth",
    label: "Revenue growth",
    score: rg === null ? 0 : clamp(50 + rg * 2),
    weight: 20,
    detail: rg === null ? "No comparable previous period" : `${p1(rg)} vs previous period`,
    sufficient: rg !== null,
  });

  // Profitability (contribution margin on delivered revenue)
  const margin = c.revenue > 0 ? (c.profit / c.revenue) * 100 : null;
  comps.push({
    key: "profitability",
    label: "Profitability",
    score: margin === null ? 0 : clamp(margin * 3.3),
    weight: 25,
    detail: margin === null ? "No delivered revenue in period" : `${margin.toFixed(1)}% contribution margin`,
    sufficient: margin !== null,
  });

  // ROAS
  comps.push({
    key: "roas",
    label: "Delivered ROAS",
    score: c.roas === null ? 0 : clamp((c.roas / 4) * 100),
    weight: 15,
    detail: c.roas === null ? "No ad spend recorded" : `${c.roas.toFixed(2)}x (4x = full marks)`,
    sufficient: c.roas !== null,
  });

  // CPA trend
  const cpaTrend = c.cpa !== null && p.cpa !== null && p.cpa > 0 ? pct(c.cpa, p.cpa)! : null;
  comps.push({
    key: "cpa",
    label: "CPA trend",
    score: cpaTrend === null ? 0 : clamp(50 - cpaTrend * 2),
    weight: 10,
    detail: cpaTrend === null ? "Insufficient CPA history" : `${p1(cpaTrend)} vs previous period`,
    sufficient: cpaTrend !== null,
  });

  // Conversion rate
  comps.push({
    key: "cvr",
    label: "Conversion rate",
    score: c.cvr === null ? 0 : clamp((c.cvr / 3) * 100),
    weight: 10,
    detail: c.cvr === null ? "No click data from ad platforms" : `${c.cvr.toFixed(2)}% of clicks (3% = full marks)`,
    sufficient: c.cvr !== null,
  });

  // Return rate
  comps.push({
    key: "return_rate",
    label: "Return rate",
    score: c.return_rate === null ? 0 : clamp(100 - c.return_rate * 5),
    weight: 10,
    detail: c.return_rate === null ? "No delivered orders in period" : `${c.return_rate.toFixed(1)}% of orders returned`,
    sufficient: c.return_rate !== null,
  });

  // Stock health — share of selling products with more than 7 days of cover
  const selling = input.products.filter((x) => x.delivered_units > 0);
  const healthy = selling.filter(
    (x) => x.stock / Math.max(0.01, x.delivered_units / Math.max(1, input.days)) > 7,
  ).length;
  comps.push({
    key: "stock",
    label: "Stock health",
    score: selling.length ? (healthy / selling.length) * 100 : 0,
    weight: 10,
    detail: selling.length
      ? `${healthy}/${selling.length} selling products have over 7 days of cover`
      : "No products sold in period",
    sufficient: selling.length > 0,
  });

  const usable = comps.filter((x) => x.sufficient);
  if (!usable.length) return { score: null, grade: "Insufficient data", components: comps, strength: null, weakness: null };
  const totalWeight = usable.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(usable.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight);
  const grade = score >= 85 ? "Excellent" : score >= 70 ? "Healthy" : score >= 50 ? "Needs work" : "At risk";
  const sorted = [...usable].sort((a, b) => b.score - a.score);
  return {
    score,
    grade,
    components: comps,
    strength: sorted[0] ?? null,
    weakness: sorted[sorted.length - 1] ?? null,
  };
}
