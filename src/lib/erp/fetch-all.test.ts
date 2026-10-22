import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";

describe("complete paginated aggregation inputs", () => {
  it("returns every row beyond the 1000-row cap exactly once", async () => {
    const rows = Array.from({ length: 2507 }, (_, id) => ({ id, cost: 2 }));
    const result = await fetchAllRows(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(result).toHaveLength(2507);
    expect(new Set(result.map((row) => row.id)).size).toBe(2507);
    expect(result.reduce((sum, row) => sum + row.cost, 0)).toBe(5014);
  });
  it("rejects rather than returning a partial total when a later page fails", async () => {
    await expect(fetchAllRows(async (from) => ({ data: from === 0 ? Array(1000).fill(1) : null, error: from === 0 ? null : new Error("page failed") }))).rejects.toThrow("page failed");
  });
});