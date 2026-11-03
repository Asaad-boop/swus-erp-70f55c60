import { describe, it, expect } from "vitest";
import { classifyDelivered, deliveryNetV2, type DeliveredRow } from "./finance-integrity";

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

describe("deliveryNetV2 (Phase 2 formula)", () => {
  it("full COD: total minus courier fee", () => expect(deliveryNetV2({ status: "delivered", total: 1000, shipping: 100 })).toBe(900));
  it("advance-paid: advance is subtracted once", () => expect(deliveryNetV2({ status: "delivered", total: 1000, advance: 200, shipping: 100 })).toBe(700));
  it("free shipping: no fee subtracted", () => expect(deliveryNetV2({ status: "delivered", total: 1000, shipping: 0 })).toBe(1000));
  it("fully prepaid: nothing to collect", () => expect(deliveryNetV2({ status: "delivered", total: 660, advance: 660, shipping: 0 })).toBe(0));
  it("refunded order: refund subtracted", () => expect(deliveryNetV2({ status: "delivered", total: 1000, shipping: 100, refund: 300 })).toBe(600));
  it("zero-collection order posts nothing", () => expect(deliveryNetV2({ status: "delivered", total: 100, advance: 0, shipping: 100 })).toBe(0));
  it("partial, legacy semantics (uncollected stored): collected = total - partial", () =>
    expect(deliveryNetV2({ status: "partial_delivered", total: 1000, partial_amount: 400, partial_amount_semantics: null, shipping: 100 })).toBe(500));
  it("partial, new semantics (collected stored)", () =>
    expect(deliveryNetV2({ status: "partial_delivered", total: 1000, partial_amount: 600, partial_amount_semantics: "collected", shipping: 100 })).toBe(500));
  it("partial with advance", () =>
    expect(deliveryNetV2({ status: "partial_delivered", total: 1000, advance: 200, partial_amount: 600, partial_amount_semantics: "collected", shipping: 100 })).toBe(300));
});
