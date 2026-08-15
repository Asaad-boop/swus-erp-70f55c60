/** Dhaka (UTC+6) date helpers — HRM never uses raw UTC dates. */

const DHAKA = "Asia/Dhaka";

/** Dhaka-local YYYY-MM-DD for a date (defaults to now). */
export const dhakaToday = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** Dhaka-local YYYY-MM for a date (defaults to now). */
export const dhakaMonth = (d: Date = new Date()) => dhakaToday(d).slice(0, 7);

/** ISO timestamp → "HH:MM" (24h) in Dhaka time, for <input type="time">. */
export const dhakaTimeInput = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: DHAKA,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "";

/** Fractional Dhaka hour (e.g. 13.5) for an ISO timestamp. */
export const dhakaHour = (iso: string) => {
  const [h, m] = dhakaTimeInput(iso).split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
};
