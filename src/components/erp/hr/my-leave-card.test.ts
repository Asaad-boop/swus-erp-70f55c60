import { describe, it, expect } from "vitest";
import { leaveWorkDays } from "./my-leave-card";
describe("leaveWorkDays", () => {
  it("skips weekly off (Friday=5)", () => expect(leaveWorkDays("2026-11-05", "2026-11-08", [5])).toBe(3));
  it("single day", () => expect(leaveWorkDays("2026-11-02", "2026-11-02", [])).toBe(1));
  it("end before start = 0", () => expect(leaveWorkDays("2026-11-05", "2026-11-02", [])).toBe(0));
});
