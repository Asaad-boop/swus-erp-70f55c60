import { describe, it, expect } from "vitest";
import { bomMaterialCost, maxBuildable, requiredPerUnit } from "./bom";

const lines = [
  { quantity: 1, est_unit_cost: 60, current_cost: 0, available: 100 },
  { quantity: 1, est_unit_cost: 240, current_cost: 0, available: 30 },
  { quantity: 2, est_unit_cost: null, current_cost: 20, available: 50 },
];

describe("bom math", () => {
  it("wastage raises required qty", () => {
    expect(requiredPerUnit(2, 10)).toBeCloseTo(2.2);
  });
  it("material cost uses estimate, falls back to current cost", () => {
    expect(bomMaterialCost(lines, 0)).toBe(60 + 240 + 40);
  });
  it("buildable limited by scarcest component", () => {
    expect(maxBuildable(lines, 0)).toBe(25);
  });
  it("no lines -> 0 buildable", () => {
    expect(maxBuildable([], 0)).toBe(0);
  });
});
