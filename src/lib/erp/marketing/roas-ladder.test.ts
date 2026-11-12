import { describe, it, expect } from "vitest";
import {
  addDays,
  campaignDecision,
  portfolioBreakeven,
  buildLadder,
  daysBetween,
  deltaPct,
  expectedDeliveredRoas,
  mergeTotals,
  sumTotals,
} from "./roas-ladder";

const rowA = {
  spend: 1000,
  meta_purchases: 12,
  meta_purchase_value: 6000,
  booked_order_count: 10,
  booked_value: 5000,
  confirmed_count: 8,
  confirmed_value: 4000,
  delivered_count: 5,
  delivered_order_value: 2500,
  cancelled_count: 2,
  returned_count: 1,
  collected_amount: null,
  realized_profit: null,
};
const rowB = { ...rowA, spend: 1000, collected_amount: 900, realized_profit: -100 };

describe("roas ladder", () => {
  it("sums rows and keeps null-only cash as null", () => {
    const t = sumTotals([rowA]);
    expect(t.spend).toBe(1000);
    expect(t.collected).toBeNull();
    expect(t.realized_profit).toBeNull();
    const t2 = sumTotals([rowA, rowB]);
    expect(t2.collected).toBe(900);
    expect(t2.realized_profit).toBe(-100);
    expect(mergeTotals([t, t]).booked_value).toBe(10000);
  });

  it("computes the four stages from one formula", () => {
    const l = buildLadder(sumTotals([rowA]));
    expect(l.stages.map((s) => s.roas)).toEqual([6, 5, 4, 2.5]);
    expect(l.stages[2].keptPct).toBe(80);
    expect(l.stages[3].keptPct).toBe(62.5);
    expect(l.confirmRate).toBe(80);
    expect(l.deliverySuccess).toBe(83.3); // 5 / (5 + 1)
    expect(l.pipelineCount).toBe(2); // 10 - 2 - 5 - 1
    expect(l.metaGapPct).toBe(20); // Meta claims 12 vs 10 booked
    expect(l.costPerDelivered).toBe(200);
  });

  it("handles zero spend without dividing by zero", () => {
    const l = buildLadder(sumTotals([{ ...rowA, spend: 0 }]));
    expect(l.stages.every((s) => s.roas === 0)).toBe(true);
  });

  it("estimates delivered ROAS for in-flight orders", () => {
    const t = sumTotals([rowA]);
    // in-flight = 8 - 5 - 1 = 2, avg 500, success 50% → +500
    expect(expectedDeliveredRoas(t, 50)).toBe(3);
    expect(expectedDeliveredRoas(t, null)).toBeNull();
  });

  it("date helpers", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-07")).toBe(7);
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(1, 0)).toBeNull();
  });
});

describe("campaign decision", () => {
  const l = buildLadder(sumTotals([rowA]));
  it("mature cash verdict wins", () => {
    expect(campaignDecision({ spend: 1000, verdict: "losing" }, l, 9)).toBe("pause");
    expect(campaignDecision({ spend: 1000, verdict: "scaling" }, l, 0.1)).toBe("scale");
  });
  it("early read uses expected vs breakeven", () => {
    const row = { spend: 1000, verdict: "no_data", breakeven_roas: 2 };
    expect(campaignDecision(row, l, 3)).toBe("early_good");
    expect(campaignDecision(row, l, 1.5)).toBe("early_weak");
    expect(campaignDecision(row, l, 2.1)).toBe("watch");
    expect(campaignDecision({ spend: 0 }, l, 3)).toBe("no_data");
  });
  it("portfolio breakeven", () => {
    expect(portfolioBreakeven([{ delivered_revenue: 1000, gross_profit: 400 }])).toBe(2.5);
    expect(portfolioBreakeven([{ delivered_revenue: 0, gross_profit: 0 }])).toBeNull();
  });
});
