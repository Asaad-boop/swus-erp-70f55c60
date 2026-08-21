export function courierCodDue(total: number | null | undefined, advance: number | null | undefined) {
  const orderTotal = Math.max(0, Number(total ?? 0));
  const paidAdvance = Math.max(0, Number(advance ?? 0));
  return Math.max(0, Math.round(orderTotal - Math.min(orderTotal, paidAdvance)));
}