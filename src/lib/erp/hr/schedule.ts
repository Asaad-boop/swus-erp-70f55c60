/**
 * Per-employee duty schedule: shift window, weekly off days and overtime rules.
 * Stored on `hr_employees`; falls back to the company-wide HR policy where blank.
 */
export type EmployeeSchedule = {
  shift_start: string; // "HH:MM" or "HH:MM:SS"
  shift_end: string;
  week_offs: number[]; // 0 = Sunday .. 6 = Saturday
  late_grace_min: number | null;
  overtime_enabled: boolean;
  overtime_rate: number; // BDT per overtime hour
  overtime_holiday_multiplier: number;
  overtime_min_minutes: number;
  /** Paid break minutes per day; extra break time is unpaid when `unpaid_break`. */
  break_allowance_min: number;
  unpaid_break: boolean;
};

export const DEFAULT_SCHEDULE: EmployeeSchedule = {
  shift_start: "10:00",
  shift_end: "19:00",
  week_offs: [5],
  late_grace_min: null,
  overtime_enabled: false,
  overtime_rate: 0,
  overtime_holiday_multiplier: 2,
  overtime_min_minutes: 30,
  break_allowance_min: 60,
  unpaid_break: true,
};

export const BREAK_KINDS = [
  { value: "lunch", label: "Lunch", emoji: "🍽️" },
  { value: "prayer", label: "Prayer", emoji: "🕌" },
  { value: "tea", label: "Tea", emoji: "☕" },
  { value: "personal", label: "Personal", emoji: "🚶" },
  { value: "other", label: "Other", emoji: "⏸️" },
] as const;

export const breakKindLabel = (v?: string | null) =>
  BREAK_KINDS.find((k) => k.value === v)?.label ?? "Break";

export const WEEK_DAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

/** Normalizes a raw hr_employees row (or partial) into a full schedule. */
export function toSchedule(row: Partial<EmployeeSchedule> | null | undefined): EmployeeSchedule {
  return {
    ...DEFAULT_SCHEDULE,
    ...(row ?? {}),
    shift_start: hhmm(row?.shift_start ?? DEFAULT_SCHEDULE.shift_start),
    shift_end: hhmm(row?.shift_end ?? DEFAULT_SCHEDULE.shift_end),
    week_offs: Array.isArray(row?.week_offs) ? row!.week_offs!.map(Number) : DEFAULT_SCHEDULE.week_offs,
    break_allowance_min: Number(row?.break_allowance_min ?? DEFAULT_SCHEDULE.break_allowance_min),
    unpaid_break: row?.unpaid_break ?? DEFAULT_SCHEDULE.unpaid_break,
  };
}

/** Break minutes that exceed the paid allowance (0 when breaks are fully paid). */
export function unpaidBreakMinutes(s: EmployeeSchedule, breakMinutes: number) {
  if (!s.unpaid_break) return 0;
  return Math.max(0, Math.round(breakMinutes) - (Number(s.break_allowance_min) || 0));
}

/** "09:00:00" → "09:00" */
export function hhmm(t: string) {
  return String(t ?? "").slice(0, 5) || "00:00";
}

export function minutesOfDay(t: string) {
  const [h, m] = hhmm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Shift length in minutes; supports shifts that cross midnight. */
export function shiftMinutes(s: EmployeeSchedule) {
  const start = minutesOfDay(s.shift_start);
  const end = minutesOfDay(s.shift_end);
  return end > start ? end - start : 24 * 60 - start + end;
}

export function shiftLabel(s: EmployeeSchedule) {
  return `${fmt12(s.shift_start)} – ${fmt12(s.shift_end)}`;
}

export function fmt12(t: string) {
  const [h, m] = hhmm(t).split(":").map(Number);
  const ampm = (h ?? 0) < 12 ? "AM" : "PM";
  const hr = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
  return `${hr}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

/** Day-of-week (0-6) for a YYYY-MM-DD date string. */
export function dowOf(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function isWeekOff(s: EmployeeSchedule, dateStr: string) {
  return s.week_offs.includes(dowOf(dateStr));
}

export function weekOffLabel(s: EmployeeSchedule) {
  if (!s.week_offs.length) return "No weekly off";
  return s.week_offs
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEK_DAYS[d]?.short ?? d)
    .join(", ");
}

/** Dhaka-local minutes since midnight for an ISO timestamp. */
export function dhakaMinutes(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = parts.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type DayMetrics = {
  isOff: boolean;
  isLate: boolean;
  lateMinutes: number;
  expectedMs: number;
  overtimeMinutes: number;
  overtimeAmount: number;
  multiplier: number;
};

/**
 * Attendance verdict for one day: late-ness against the employee's own shift,
 * and overtime (full day on a weekly off, extra hours on a normal day).
 */
export function dayMetrics(args: {
  schedule: EmployeeSchedule;
  workDate: string;
  netMs: number;
  firstIn: string | null;
  fallbackGraceMin?: number;
}): DayMetrics {
  const s = args.schedule;
  const off = isWeekOff(s, args.workDate);
  const grace = s.late_grace_min ?? args.fallbackGraceMin ?? 0;
  const netMin = Math.max(0, Math.round(args.netMs / 60000));

  let lateMinutes = 0;
  if (!off && args.firstIn) {
    lateMinutes = Math.max(0, dhakaMinutes(args.firstIn) - (minutesOfDay(s.shift_start) + grace));
  }

  const expectedMin = off ? 0 : shiftMinutes(s);
  const extra = Math.max(0, netMin - expectedMin);
  const multiplier = off ? Number(s.overtime_holiday_multiplier) || 1 : 1;

  let overtimeMinutes = 0;
  if (s.overtime_enabled && extra >= (s.overtime_min_minutes || 0)) overtimeMinutes = extra;

  return {
    isOff: off,
    isLate: lateMinutes > 0,
    lateMinutes,
    expectedMs: expectedMin * 60000,
    overtimeMinutes,
    overtimeAmount: Math.round(((overtimeMinutes / 60) * (Number(s.overtime_rate) || 0) * multiplier + Number.EPSILON) * 100) / 100,
    multiplier,
  };
}
