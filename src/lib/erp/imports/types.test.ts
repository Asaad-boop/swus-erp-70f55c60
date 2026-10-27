import { describe, it, expect } from "vitest";
import { poEtaDays } from "./types";

describe("poEtaDays", () => {
  it("counts days late after ETA", () => expect(poEtaDays("2026-10-20", "in_transit", "2026-10-27")).toBe(7));
  it("negative before ETA", () => expect(poEtaDays("2026-10-30", "ordered", "2026-10-27")).toBe(-3));
  it("ignores arrived POs", () => expect(poEtaDays("2026-10-01", "arrived_bd", "2026-10-27")).toBeNull());
  it("null without ETA", () => expect(poEtaDays(null, "ordered", "2026-10-27")).toBeNull());
});
