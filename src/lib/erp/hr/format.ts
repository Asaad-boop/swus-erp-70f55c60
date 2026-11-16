import type { DayStatus } from "@/lib/erp/hr/api";

const TZ = "Asia/Dhaka";

/** YYYY-MM-DD for "today" in Dhaka. */
export function dhakaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** YYYY-MM-DD shifted by n days. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function monthEnd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** "7h 05m" from minutes. */
export function hm(mins: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "07:05:09" from seconds — for live timers. */
export function hms(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "10:05 AM" in Dhaka. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "HH:MM" (24h, Dhaka) for <input type="time">. */
export function toTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
    hour12: false,
  });
}

/** Dhaka wall time (date + HH:MM) → ISO instant. Dhaka has no DST (UTC+6). */
export function dhakaToIso(ymd: string, hhmm: string, nextDay = false): string {
  const d = new Date(`${ymd}T${hhmm}:00+06:00`);
  if (nextDay) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** "10:00" → "10:00 AM". */
export function time12(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

export function dayLabel(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Date(`${ymd}T00:00:00+06:00`).toLocaleDateString("en-GB", { ...opts, timeZone: TZ });
}

export function monthLabel(ymd: string): string {
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00+06:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

export const WEEKDAYS = [
  { v: 6, short: "Sat", bn: "শনি" },
  { v: 0, short: "Sun", bn: "রবি" },
  { v: 1, short: "Mon", bn: "সোম" },
  { v: 2, short: "Tue", bn: "মঙ্গল" },
  { v: 3, short: "Wed", bn: "বুধ" },
  { v: 4, short: "Thu", bn: "বৃহঃ" },
  { v: 5, short: "Fri", bn: "শুক্র" },
];

export function money(n: number | null | undefined): string {
  return `৳${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

export const STATUS_META: Record<DayStatus, { label: string; className: string; dot: string }> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  working: {
    label: "Working",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500 animate-pulse",
  },
  on_break: {
    label: "On break",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500 animate-pulse",
  },
  absent: {
    label: "Absent",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  off: {
    label: "Weekly off",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  holiday: {
    label: "Holiday",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  leave: {
    label: "Leave",
    className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  not_yet: { label: "Not in yet", className: "bg-muted text-foreground/70", dot: "bg-amber-400" },
  upcoming: { label: "—", className: "text-muted-foreground", dot: "bg-transparent" },
  not_employed: { label: "—", className: "text-muted-foreground", dot: "bg-transparent" },
};

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
