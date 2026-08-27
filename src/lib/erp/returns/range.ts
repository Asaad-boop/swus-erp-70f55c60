/** Date-range helpers for returns/exchanges filters (date-only string -> ISO bounds). */
export function dayStart(d: string): string {
  return d.includes("T") ? d : `${d}T00:00:00.000Z`;
}

export function dayEnd(d: string): string {
  return d.includes("T") ? d : `${d}T23:59:59.999Z`;
}
