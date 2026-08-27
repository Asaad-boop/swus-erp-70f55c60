import type { OrderStatus } from "./orders";

export type CourierProvider = "pathao" | "steadfast";

/** Normalize raw courier status: lowercase, replace spaces/hyphens with underscore. */
export function normalizeCourierStatus(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Default mapping per provider. Key = normalized raw status, value = ERP status.
 *
 * Rules:
 * - Only *fulfillment* events map. Payment/settlement events (paid, payment_invoice,
 *   invoice_paid, payment_processing, payment_completed) are intentionally NOT mapped —
 *   `paid` / `completed` are set only by the reconciliation RPCs
 *   (reconcile_courier_settlement / apply_settlement_variance_action).
 * - Unknown keys return null and the courier update is ignored (no downgrade).
 * - Keep this table in sync with the Postgres function public.map_courier_status_to_order.
 */
export const DEFAULT_PATHAO_MAP: Record<string, OrderStatus> = {
  // --- Booked / awaiting pickup ---
  pending: "ready_to_ship",
  pickup_requested: "ready_to_ship",
  waiting_for_pickup: "ready_to_ship",
  waiting_for_pick_up: "ready_to_ship",
  assigned_for_pickup: "ready_to_ship",
  pickup_rescheduled: "ready_to_ship",
  pickup_failed: "on_hold",
  pickup_cancelled: "cancelled",

  // --- Picked up by rider ---
  picked: "shipped",
  pickup: "shipped",
  picked_up: "shipped",
  collected: "shipped",

  // --- Moving through network ---
  at_the_sorting_hub: "in_transit",
  at_sorting_hub: "in_transit",
  sorting_hub: "in_transit",
  in_transit: "in_transit",
  received_at_last_mile_hub: "in_transit",
  last_mile_hub: "in_transit",
  hub_received: "in_transit",
  at_delivery_hub: "in_transit",
  on_the_way_to_delivery_hub: "in_transit",
  forwarded: "in_transit",
  reached: "in_transit",
  rider_assigned: "in_transit",
  assigned_for_delivery: "in_transit",
  on_delivery: "in_transit",
  out_for_delivery: "in_transit",

  // --- Final delivery outcomes ---
  delivered: "delivered",
  delivery_success: "delivered",
  partial_delivery: "partial_delivered",
  partial_delivered: "partial_delivered",

  // --- Problem / temporary states ---
  delivery_failed: "on_hold",
  delivery_hold: "on_hold",
  delivery_rescheduled: "on_hold",
  hold: "on_hold",
  on_hold: "on_hold",
  merchant_confirmed: "on_hold",
  customer_unreachable: "on_hold",
  lost: "on_hold",
  damaged: "on_hold",

  // --- Return journey ---
  return: "return_in_transit",
  returning: "return_in_transit",
  return_processing: "return_in_transit",
  pending_return: "return_in_transit",
  return_in_transit: "return_in_transit",
  return_to_pickup: "return_in_transit",
  return_to_merchant: "return_in_transit",
  on_the_way_to_return: "return_in_transit",
  return_rescheduled: "return_in_transit",
  returned: "returned",
  return_completed: "returned",
  paid_return: "paid_return",
  unpaid_return: "unpaid_return",
  partial_delivered_return: "partial_return",
  partial_return: "partial_return",

  // --- Exchange ---
  exchange: "exchange",
  exchanged: "exchange",

  // --- Cancellation ---
  cancelled: "cancelled",
  canceled: "cancelled",
  cancelled_by_courier: "cancelled",
};

export const DEFAULT_STEADFAST_MAP: Record<string, OrderStatus> = {
  // --- Booked / awaiting pickup ---
  pending: "ready_to_ship",
  in_review: "ready_to_ship",

  // --- Moving ---
  picked: "shipped",
  picked_up: "shipped",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",

  // --- Final delivery outcomes ---
  delivered: "delivered",
  partial_delivered: "partial_delivered",

  // --- Problem / temporary states ---
  hold: "on_hold",
  on_hold: "on_hold",
  delivery_failed: "on_hold",
  lost: "on_hold",
  damaged: "on_hold",
  unknown: "on_hold",
  unknown_approval: "on_hold",

  // Steadfast *_approval_pending — outcome claimed but not confirmed yet.
  // Treat as hold so nothing resolves before the courier confirms.
  delivered_approval_pending: "on_hold",
  partial_delivered_approval_pending: "on_hold",
  cancelled_approval_pending: "on_hold",
  unknown_approval_pending: "on_hold",
  return_approval_pending: "on_hold",
  hold_approval_pending: "on_hold",

  // --- Return journey ---
  return: "return_in_transit",
  returning: "return_in_transit",
  pending_return: "return_in_transit",
  return_in_transit: "return_in_transit",
  returned: "returned",
  partial_delivered_return: "partial_return",
  partial_return: "partial_return",
  paid_return: "paid_return",
  unpaid_return: "unpaid_return",

  // --- Exchange / cancellation ---
  exchange: "exchange",
  exchanged: "exchange",
  cancelled: "cancelled",
  canceled: "cancelled",
};


export type CourierStatusMappingOverrides = {
  pathao?: Record<string, OrderStatus>;
  steadfast?: Record<string, OrderStatus>;
};

export function getMergedMap(
  provider: CourierProvider,
  overrides?: CourierStatusMappingOverrides | null,
): Record<string, OrderStatus> {
  const base = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
  const extra = overrides?.[provider] ?? {};
  return { ...base, ...extra };
}

export function mapCourierStatus(
  provider: CourierProvider,
  raw: string | null | undefined,
  overrides?: CourierStatusMappingOverrides | null,
): OrderStatus | null {
  const key = normalizeCourierStatus(raw);
  if (!key) return null;
  const table = getMergedMap(provider, overrides);
  return table[key] ?? null;
}

/**
 * Guard against courier feeds downgrading an already-resolved fulfillment
 * outcome. Pathao keeps reporting settlement events (`paid_return`,
 * `payment_*`) after a parcel was delivered/partially delivered, which used to
 * flip real `delivered` / `partial_delivered` orders into the return family.
 *
 * Key = current order status that is already resolved.
 * Value = the only statuses a courier feed may still move it to.
 */
const ALLOWED_FROM_RESOLVED: Partial<Record<OrderStatus, OrderStatus[]>> = {
  delivered: ["paid", "completed", "partial_delivered"],
  partial_delivered: ["paid", "completed", "partial_return"],
  return_in_transit: ["returned", "paid_return", "unpaid_return", "partial_return", "delivered", "partial_delivered", "exchange", "completed"],
  returned: ["paid_return", "unpaid_return", "partial_return", "completed"],
  paid_return: ["completed"],
  unpaid_return: ["paid_return", "completed"],
  partial_return: ["completed"],
  exchange: ["exchanged", "delivered", "completed"],
  exchanged: ["completed"],

  paid: [],
  completed: [],
  cancelled: [],
};

/**
 * Forward-only ranking for the pre-delivery fulfillment pipeline.
 * A courier feed must never pull an order *backwards* here — e.g. Pathao keeps
 * emitting `Pickup_Requested` / `Pending` (→ ready_to_ship) for a few seconds
 * after booking, which used to flip a freshly shipped order back to RTS.
 * Statuses outside this map (on_hold, cancelled, return family, delivered…)
 * are unaffected and still governed by ALLOWED_FROM_RESOLVED.
 */
const PIPELINE_RANK: Partial<Record<OrderStatus, number>> = {
  confirmed: 1,
  ready_to_pack: 2,
  packaging: 2,
  packed: 3,
  ready_to_ship: 4,
  shipped: 5,
  in_transit: 6,
};

/**
 * Returns the status to apply, or `null` when the courier update must be
 * ignored (no change / illegal downgrade).
 */
export function resolveCourierTransition(
  current: OrderStatus | string | null | undefined,
  mapped: OrderStatus | null | undefined,
): OrderStatus | null {
  if (!mapped) return null;
  if (!current) return mapped;
  if (mapped === current) return null;
  const curRank = PIPELINE_RANK[current as OrderStatus];
  const nextRank = PIPELINE_RANK[mapped];
  if (curRank != null && nextRank != null && nextRank < curRank) return null;
  const allow = ALLOWED_FROM_RESOLVED[current as OrderStatus];
  if (allow && !allow.includes(mapped)) return null;
  return mapped;
}
