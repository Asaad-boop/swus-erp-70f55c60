import { describe, it, expect } from "vitest";
import { classifyDelivered, type DeliveredRow } from "./finance-integrity";

const base: DeliveredRow = { id: "x", invoice_no: "HS-1", brand: "HobbyShop", status: "delivered", total: 1000, advance: 0, partial_amount: null, delivered_at: null, posted: null, advance_posted: null, refs: null, recon_rows: 0 };

describe("classifyDelivered", () => {
  it("total 0 order is not an exception", () => expect(classifyDelivered({ ...base, total: 0, advance: 350 }).kind).toBe("nothing_due"));
  it("fully prepaid order is not an exception", () => expect(classifyDelivered({ ...base, total: 660, advance: 660 }).kind).toBe("nothing_due"));
  it("COD due with recon row but no posting", () => expect(classifyDelivered({ ...base, recon_rows: 2 }).kind).toBe("recon_only"));
  it("COD due with no records is truly unposted", () => expect(classifyDelivered(base).kind).toBe("unposted"));
  it("advance + delivery above total is double count", () => expect(classifyDelivered({ ...base, advance: 200, posted: 900, advance_posted: 200 }).kind).toBe("advance_double"));
  it("correct split is ok", () => expect(classifyDelivered({ ...base, advance: 200, posted: 800, advance_posted: 200 }).kind).toBe("ok"));
  it("partial posted as uncollected amount", () => expect(classifyDelivered({ ...base, status: "partial_delivered", partial_amount: 400, posted: 600 }).kind).toBe("partial_mismatch"));
});
