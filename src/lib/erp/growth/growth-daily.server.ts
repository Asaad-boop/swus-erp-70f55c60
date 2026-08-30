/**
 * Growth Studio daily-cockpit + retention helpers.
 * All money/profit numbers come from the canonical marketing RPCs — no
 * hand-rolled cost math here.
 */

export type DailyWindowKpis = {
  orders: number;
  booked_revenue: number;
  delivered_revenue: number;
  delivered_orders: number;
  spend_bdt: number;
  contribution_profit: number;
  gross_profit: number;
  roas: number | null;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
const nullNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function emptyWindow(): DailyWindowKpis {
  return {
    orders: 0,
    booked_revenue: 0,
    delivered_revenue: 0,
    delivered_orders: 0,
    spend_bdt: 0,
    contribution_profit: 0,
    gross_profit: 0,
    roas: null,
  };
}

export function mapWindow(row: Record<string, unknown> | undefined): DailyWindowKpis {
  if (!row) return emptyWindow();
  return {
    orders: num(row.orders),
    booked_revenue: num(row.booked_revenue),
    delivered_revenue: num(row.delivered_revenue),
    delivered_orders: num(row.delivered_orders),
    spend_bdt: num(row.spend_bdt),
    contribution_profit: num(row.contribution_profit),
    gross_profit: num(row.gross_profit),
    roas: nullNum(row.roas),
  };
}

/** Asia/Dhaka calendar date (YYYY-MM-DD) for a given instant. */
export function dhakaToday(now = new Date()) {
  return new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
}

export function dhakaShift(date: string, days: number) {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function monthBounds(today: string) {
  const start = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOfMonth = Number(today.slice(8, 10));
  return { start, daysInMonth, dayOfMonth, daysLeft: Math.max(1, daysInMonth - dayOfMonth + 1) };
}
