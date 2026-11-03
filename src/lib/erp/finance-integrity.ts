export type DeliveredRow = {
  id: string; invoice_no: string; brand: string | null; status: string; total: number; advance: number;
  partial_amount: number | null; delivered_at: string | null; posted: number | null; advance_posted: number | null;
  refs: string | null; recon_rows: number;
};

export type DeliveredClass = {
  kind: "nothing_due" | "recon_only" | "unposted" | "advance_double" | "partial_mismatch" | "ok";
  severity: "info" | "warn" | "error";
  label: string;
  fix: string;
};

/**
 * Mirror of the Phase 2 SQL formula in fn_post_order_delivery_to_finance (orders
 * delivered on/after 2026-11-04). Kept in sync for tests: net COD receivable =
 * collected − advance − courier fee − refund. Legacy partial rows (semantics null)
 * store the uncollected part; new rows (semantics 'collected') store the amount collected.
 */
export function deliveryNetV2(o: {
  status: string; total: number; advance?: number | null; shipping?: number | null;
  refund?: number | null; partial_amount?: number | null; partial_amount_semantics?: string | null;
}): number {
  const total = Number(o.total) || 0;
  const collected = o.status === "partial_delivered"
    ? (o.partial_amount_semantics === "collected" ? Number(o.partial_amount) || 0 : Math.max(total - (Number(o.partial_amount) || 0), 0))
    : total;
  const net = collected - (Number(o.advance) || 0) - (Number(o.shipping) || 0) - (Number(o.refund) || 0);
  return net > 0 ? net : 0;
}

/** Read-only classification of a delivered/partial order's finance posting. */
export function classifyDelivered(d: DeliveredRow): DeliveredClass {
  const total = Number(d.total) || 0;
  const adv = Number(d.advance) || 0;
  const posted = d.posted == null ? null : Number(d.posted);
  const advPosted = d.advance_posted == null ? 0 : Number(d.advance_posted);

  if (d.status === "partial_delivered" && posted != null && d.partial_amount != null) {
    const uncollected = total - Number(d.partial_amount);
    if (Math.abs(posted - Number(d.partial_amount)) > 0.5 && Math.abs(posted - uncollected) <= 0.5)
      return { kind: "partial_mismatch", severity: "error", label: "Partial mismatch", fix: "Posted amount equals total − partial_amount, i.e. the uncollected part. Confirm the collected amount with the courier statement before any correction." };
  }
  if (posted != null && advPosted > 0 && posted + advPosted > total + 0.5)
    return { kind: "advance_double", severity: "error", label: "Advance counted twice", fix: `Delivery ${posted} + advance ${advPosted} exceeds order total ${total}. Phase 2: correcting entry for the excess.` };
  if (posted == null) {
    if (total - adv <= 0.5) return { kind: "nothing_due", severity: "info", label: "Nothing to collect", fix: "Order total minus advance is ৳0; no delivery posting expected." };
    if (d.recon_rows > 0) return { kind: "recon_only", severity: "warn", label: "In courier recon only", fix: "Matched in courier reconciliation but no finance income row. Verify the courier payout, then post after owner approval." };
    return { kind: "unposted", severity: "error", label: "Truly unposted", fix: "No settlement, delivery, or reconciliation record. Usually no wallet was found for the brand/courier. Post after owner approval." };
  }
  return { kind: "ok", severity: "info", label: "OK", fix: "" };
}
