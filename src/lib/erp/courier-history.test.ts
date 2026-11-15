import { describe, expect, it, vi } from "vitest";
import { getCourierHistory } from "./courier-history.server";

vi.mock("./bdcourier.server", () => ({
  fetchBdCourierHistory: vi.fn().mockRejectedValue(new Error("Settings lookup failed")),
}));

describe("courier history provider isolation", () => {
  it("preserves cached Pathao history when the other courier settings lookup rejects", async () => {
    const pathao = { name: "pathao", label: "Pathao", ok: true, total: 12, success: 10, cancelled: 2 };
    const cached = { phone: "01700000000", fetched_at: new Date().toISOString(), providers: [pathao] };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = { from: vi.fn(() => ({
      select: () => ({ in: async () => ({ data: [{ phone: cached.phone, data: cached, fetched_at: cached.fetched_at }] }) }),
      upsert,
    })) };
    const result = await getCourierHistory(db, null, [cached.phone], false);
    expect(result[cached.phone].summary).toEqual({ total: 12, success: 10, cancelled: 2 });
    expect(result[cached.phone].providers.find(p => p.name === "bdcourier")?.ok).toBe(false);
    expect(upsert).toHaveBeenCalledOnce();
  });
});