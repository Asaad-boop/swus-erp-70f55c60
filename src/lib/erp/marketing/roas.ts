/**
 * Single ROAS formula for every marketing surface: revenue ÷ ad spend (both BDT).
 * Which revenue (booked / delivered / Meta-reported) is chosen by the caller and
 * must be labelled in UI. Returns 0 when there is no spend (callers render "—").
 */
export function calcRoas(revenue: number | null | undefined, spend: number | null | undefined): number {
  const s = Number(spend) || 0;
  if (s <= 0) return 0;
  return Math.round(((Number(revenue) || 0) / s) * 100) / 100;
}
