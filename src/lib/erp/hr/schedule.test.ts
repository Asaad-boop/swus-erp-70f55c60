import { describe, it, expect } from "vitest";
import { dayMetrics, holidayOn, toSchedule } from "./schedule";

const s = toSchedule({ shift_start: "10:00", shift_end: "19:00", week_offs: [5], overtime_enabled: true, overtime_rate: 100, overtime_holiday_multiplier: 2, overtime_min_minutes: 30 });
const hours = (h: number) => h * 3600000;

describe("HR schedule rules", () => {
  it("public holiday works like an off day: full worked time is 2x overtime", () => {
    const m = dayMetrics({ schedule: s, workDate: "2026-12-16", netMs: hours(4), firstIn: "2026-12-16T05:00:00Z", holiday: "Victory Day" });
    expect(m.isOff).toBe(true);
    expect(m.overtimeMinutes).toBe(240);
    expect(m.overtimeAmount).toBe(800);
  });
  it("weekly off day (Friday) counts all work as overtime", () => {
    const m = dayMetrics({ schedule: s, workDate: "2026-11-06", netMs: hours(2), firstIn: null });
    expect(m.isOff).toBe(true);
    expect(m.overtimeMinutes).toBe(120);
  });
  it("no late mark on a holiday", () => {
    const m = dayMetrics({ schedule: s, workDate: "2026-12-16", netMs: hours(1), firstIn: "2026-12-16T08:00:00Z", holiday: "Victory Day" });
    expect(m.isLate).toBe(false);
  });
  it("recurring holiday matches every year", () => {
    expect(holidayOn([{ holiday_date: "2025-12-16", title: "Victory Day", is_recurring: true }], "2026-12-16")).toBe("Victory Day");
    expect(holidayOn([{ holiday_date: "2025-12-16", title: "X", is_recurring: false }], "2026-12-16")).toBeNull();
  });
});
