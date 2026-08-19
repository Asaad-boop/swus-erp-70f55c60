import type { OrderStatus } from "./orders";

export type CourierProvider = "pathao" | "steadfast";

/** Normalize raw courier status: lowercase, replace spaces/hyphens with underscore. */
export function normalizeCourierStatus(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Default mapping per provider. Key = normalized raw status, value = ERP status. */
export const DEFAULT_PATHAO_MAP: Record<string, OrderStatus> = {
  pickup_requested: "ready_to_ship",
  assigned_for_pickup: "ready_to_ship",
  pending: "ready_to_ship",
  picked: "shipped",
  pickup: "shipped",
  pickup_failed: "on_hold",
  pickup_cancelled: "cancelled",
  pickup_rescheduled: "on_hold",
  at_the_sorting_hub: "in_transit",
  at_sorting_hub: "in_transit",
  in_transit: "in_transit",
  received_at_last_mile_hub: "in_transit",
  at_delivery_hub: "in_transit",
  on_the_way_to_delivery_hub: "in_transit",
  assigned_for_delivery: "in_transit",
  on_delivery: "in_transit",
  out_for_delivery: "in_transit",
  delivery_rescheduled: "on_hold",
  delivered: "delivered",
  partial_delivery: "partial_delivered",
  partial_delivered: "partial_delivered",
  paid_return: "paid_return",
  unpaid_return: "unpaid_return",
  // Payment/settlement events — NOT fulfillment. Do NOT transition order.status
  // from raw courier payment pings; `completed` is set only via the
  // reconcile_courier_settlement / apply_settlement_variance_action RPCs.
  // Keys intentionally omitted: paid, invoice_paid, payment_invoice,
  // payment_completed, payment_processing.
  payment_processing: "on_hold",
  completed: "completed",
  delivery_failed: "on_hold",
  hold: "on_hold",
  on_hold: "on_hold",
  merchant_confirmed: "on_hold",
  return: "return_in_transit",
  returning: "return_in_transit",
  returned: "returned",
  return_to_pickup: "return_in_transit",
  return_to_merchant: "return_in_transit",
  return_rescheduled: "on_hold",
  cancelled: "cancelled",
  canceled: "cancelled",
  exchange: "exchange",
  exchanged: "exchange",
  lost: "on_hold",
  damaged: "on_hold",
};

export const DEFAULT_STEADFAST_MAP: Record<string, OrderStatus> = {
  pending: "ready_to_ship",
  in_review: "ready_to_ship",
  hold: "on_hold",
  in_transit: "in_transit",
  delivered: "delivered",
  partial_delivered: "partial_delivered",
  // Payment events — see Pathao note above. Not fulfillment transitions.
  // Omitted: paid, payment_paid.
  delivery_failed: "on_hold",
  cancelled: "cancelled",
  unknown: "on_hold",
  unknown_approval: "on_hold",
  return: "return_in_transit",
  returned: "returned",
  partial_delivered_return: "partial_return",
  // *_approval_pending variants — awaiting merchant/courier approval, treat as hold.
  delivered_approval_pending: "on_hold",
  partial_delivered_approval_pending: "on_hold",
  cancelled_approval_pending: "on_hold",
  unknown_approval_pending: "on_hold",
  return_approval_pending: "on_hold",
  hold_approval_pending: "on_hold",
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
  partial_delivered: ["completed"],
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
  const allow = ALLOWED_FROM_RESOLVED[current as OrderStatus];
  if (allow && !allow.includes(mapped)) return null;
  return mapped;
}