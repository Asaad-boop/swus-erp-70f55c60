import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type ConfirmationStatus = Database["public"]["Enums"]["confirmation_status"];

// Canonical 16-value pipeline: New → Fulfillment → Return → Exchange → Closing.
// Finance state (Paid/Unpaid) now lives on `orders.payment_status`, not `orders.status`.
export const ORDER_STATUSES: OrderStatus[] = [
  "new",
  // Fulfillment
  "confirmed", "packed", "shipped", "in_transit",
  "delivered", "partial_delivered", "completed",
  // Return
  "pending_return", "return_in_transit", "returned", "partial_return",
  // Exchange
  "exchange", "exchanged",
  // Closing
  "on_hold", "cancelled",
];

export type StatusGroup = "intake" | "fulfillment" | "return" | "exchange" | "closing";

export const STATUS_GROUPS: { key: StatusGroup; label: string; statuses: OrderStatus[] }[] = [
  { key: "intake", label: "New", statuses: ["new"] },
  {
    key: "fulfillment", label: "Fulfillment",
    statuses: ["confirmed", "packed", "shipped", "in_transit", "delivered", "partial_delivered", "completed"],
  },
  { key: "return", label: "Return", statuses: ["pending_return", "return_in_transit", "returned", "partial_return"] },
  { key: "exchange", label: "Exchange", statuses: ["exchange", "exchanged"] },
  { key: "closing", label: "Closing", statuses: ["on_hold", "cancelled"] },
];

// Top-of-page tabs (reference layout). Each tab maps to one or more of our statuses.
export type StatusTabKey =
  | "all" | "pending" | "packing" | "shipped" | "in_transit" | "delivered"
  | "partial" | "pending_return" | "returned" | "exchange" | "on_hold" | "cancelled" | "incomplete" | "ready_to_ship";

export const STATUS_TABS: { key: StatusTabKey; label: string; statuses: OrderStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: ["confirmed"] },
  { key: "packing", label: "Packing", statuses: ["packed"] },
  { key: "ready_to_ship", label: "RTS", statuses: ["ready_to_ship"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "in_transit", label: "In Transit", statuses: ["in_transit"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered", "completed"] },
  { key: "partial", label: "Partial", statuses: ["partial_delivered", "partial_return"] },
  { key: "pending_return", label: "Pending Return", statuses: ["pending_return", "return_in_transit"] },
  { key: "returned", label: "Returned", statuses: ["returned"] },
  { key: "exchange", label: "Exchange", statuses: ["exchange", "exchanged"] },
  { key: "on_hold", label: "On Hold", statuses: ["on_hold"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: [] },
];

export function tabForStatuses(statuses: OrderStatus[]): StatusTabKey {
  if (!statuses.length) return "all";
  for (const t of STATUS_TABS) {
    if (t.statuses.length === statuses.length && t.statuses.every((s) => statuses.includes(s))) return t.key;
  }
  return "all";
}

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  // Fulfillment
  confirmed: { label: "Pending", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  ready_to_pack: { label: "Ready to Pack", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  packed: { label: "Packed", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  ready_to_ship: { label: "RTS", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" },
  shipped: { label: "Shipped", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  in_transit: { label: "In Transit", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  partial_delivered: { label: "Partial Delivery", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  // Legacy fulfillment status kept as fallback (migrated to delivered — badge retained for older history rows)
  paid: { label: "Delivered", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  return_in_transit: { label: "Return In Transit", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  // Return
  pending_return: { label: "Return In Transit", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  returned: { label: "Returned", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  partial_return: { label: "Partial Return", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  // Exchange
  exchange: { label: "Exchange", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  exchanged: { label: "Exchange Delivery", className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  // Finance
  paid_return: { label: "Paid Return", className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  unpaid_return: { label: "Refund", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  // Closing
  on_hold: { label: "On Hold", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  // Legacy / fallbacks (still in DB enum)
  new: { label: "New", className: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300" },
  pre_order: { label: "Pre-order", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  packaging: { label: "Packaging", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  fake: { label: "Fake", className: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300" },
};

export function statusBadge(s: string) {
  return STATUS_BADGE[s] ?? { label: s, className: "bg-zinc-100 text-zinc-700" };
}

/** Accent color (Tailwind hex-ish) for status, used as row left border. */
export const STATUS_ACCENT: Record<string, string> = {
  confirmed: "#3b82f6", ready_to_pack: "#6366f1", packed: "#a855f7",
  ready_to_ship: "#06b6d4", shipped: "#f59e0b", in_transit: "#f59e0b",
  delivered: "#10b981", partial_delivered: "#10b981",
  paid: "#0d9488",
  pending_return: "#f97316", returned: "#ef4444", partial_return: "#ef4444",
  exchange: "#8b5cf6", exchanged: "#8b5cf6",
  paid_return: "#14b8a6", unpaid_return: "#14b8a6",
  on_hold: "#eab308", cancelled: "#71717a",
  pre_order: "#6366f1",
};
export function statusAccent(s: string) { return STATUS_ACCENT[s] ?? "#a1a1aa"; }

/**
 * Settlement = post-delivery financial state. Once an order reaches
 * delivered / returned / exchanged (any partial variant included), it
 * must show Paid or Unpaid consistently across list & detail pages.
 * Note: 'paid' / 'paid_return' / 'unpaid_return' kept here so older
 * history rows (pre-migration) still render a settlement badge.
 */
export const SETTLEMENT_STATUSES = new Set<string>([
  "delivered", "partial_delivered", "completed",
  "returned", "partial_return",
  "exchange", "exchanged",
  "paid", "paid_return", "unpaid_return",
]);

export function isSettlementStatus(status: string | null | undefined): boolean {
  return !!status && SETTLEMENT_STATUSES.has(status);
}

export function isOrderPaid(o: { status?: string | null; paid_at?: string | null; payment_status?: string | null }): boolean {
  if (!o) return false;
  if (o.payment_status === "paid") return true;
  // Legacy fallback for un-migrated / historical rows.
  if (o.status === "paid" || o.status === "paid_return") return true;
  return !!o.paid_at;
}

export function settlementBadge(o: { status?: string | null; paid_at?: string | null }):
  { label: "Paid" | "Unpaid"; className: string } | null {
  if (!isSettlementStatus(o.status)) return null;
  return isOrderPaid(o)
    ? { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" }
    : { label: "Unpaid", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
}

export type OrderRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  status: OrderStatus;
  confirmation_status: ConfirmationStatus;
  total: number;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  payment_method: string | null;
  advance_amount: number | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  shipping_thana: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  is_guest_order: boolean;
  user_id: string | null;
  brand_id: string | null;
  source: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  assigned_to: string | null;
  admin_notes: string | null;
  customer_note: string | null;
  shipping_note: string | null;
  call_status: string | null;
  call_attempt_count: number | null;
  delivered_at: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
  /** Set by useOrdersQuery from order_status_history (latest matching to_status). */
  status_since?: string | null;
  items?: OrderItemMini[];
  actual_shipping_cost?: number | null;
  reconciliation_status?: string | null;
  net_collected?: number | null;
  printed_at?: string | null;
};

export type OrderItemMini = {
  id: string;
  name: string | null;
  image: string | null;
  quantity: number;
  variant_label: string | null;
  line_total: number | null;
};

export function customerName(o: Pick<OrderRow, "shipping_name" | "guest_name">) {
  return o.shipping_name ?? o.guest_name ?? "—";
}
export function customerPhone(o: Pick<OrderRow, "shipping_phone" | "guest_phone">) {
  return o.shipping_phone ?? o.guest_phone ?? "";
}
export function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

/** Display invoice number, falling back to a short order id. */
export function invoiceDisplay(o: { invoice_no: string | null; id: string }) {
  return o.invoice_no ?? shortId(o.id);
}

/**
 * COD reconciliation badge for delivered-family orders.
 * Reads `orders.reconciliation_status` (populated by COD Settlement system):
 *   - "reconciled" / "waived" → matched (green)
 *   - "needs_review" → variance / in review queue (amber)
 *   - "pending" / null → not reconciled yet (faint grey)
 * Display only — no writes. Only render for delivered/partial_delivered/paid.
 */
export const RECONCILE_BADGE_STATUSES = new Set<string>([
  "delivered", "partial_delivered", "completed",
]);

export type ReconcileTone = "matched" | "review" | "pending";

export function reconcileBadge(o: {
  status?: string | null;
  reconciliation_status?: string | null;
  total?: number | null;
  net_collected?: number | null;
}): { tone: ReconcileTone; label: string; icon: string; className: string; tooltip: string } | null {
  if (!o.status || !RECONCILE_BADGE_STATUSES.has(o.status)) return null;
  const rs = o.reconciliation_status ?? "pending";
  const expected = Number(o.total ?? 0);
  const collected = o.net_collected == null ? null : Number(o.net_collected);
  const variance = collected == null ? null : collected - expected;
  const money = (n: number) => `৳${n.toLocaleString()}`;
  const varLine = variance == null
    ? "Collected: —"
    : `Collected: ${money(collected!)}${variance !== 0 ? ` · Variance: ${variance > 0 ? "+" : ""}${money(variance)}` : ""}`;
  const tip = `Expected: ${money(expected)}\n${varLine}`;
  if (rs === "reconciled" || rs === "waived") {
    return {
      tone: "matched", label: rs === "waived" ? "Waived" : "Matched", icon: "✓",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
      tooltip: `COD ${rs === "waived" ? "waived" : "matched"}\n${tip}`,
    };
  }
  if (rs === "needs_review") {
    return {
      tone: "review", label: "Review", icon: "!",
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
      tooltip: `COD needs review\n${tip}`,
    };
  }
  return {
    tone: "pending", label: "Unrec.", icon: "○",
    className: "bg-muted/40 text-muted-foreground border-border/60",
    tooltip: `COD not reconciled yet\n${tip}`,
  };
}

/**
 * Best-available timestamp for "current status since".
 * Priority:
 *   1. `status_since` — pre-hydrated by useOrdersQuery from order_status_history
 *      (single batched query for the visible page; matches to_status = current status).
 *   2. Status-specific timestamp column (confirmed_at, shipped_at, etc).
 *   3. updated_at, then created_at.
 * Fallback to updated_at is used only for the ~16% of orders with no history row
 * (pre-history-table legacy orders). Never trust updated_at alone for fresh orders —
 * it bumps on any field edit, hiding genuinely stuck rows.
 */
export function statusSinceTs(o: {
  status: string;
  created_at: string;
  updated_at?: string | null;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  status_since?: string | null;
}): string {
  if (o.status_since) return o.status_since;
  switch (o.status) {
    case "confirmed":
      return o.confirmed_at ?? o.updated_at ?? o.created_at;
    case "shipped":
    case "in_transit":
      return o.shipped_at ?? o.updated_at ?? o.created_at;
    case "delivered":
    case "partial_delivered":
      return o.delivered_at ?? o.updated_at ?? o.created_at;
    case "paid":
    case "paid_return":
    case "unpaid_return":
      return o.paid_at ?? o.updated_at ?? o.created_at;
    case "cancelled":
      return o.cancelled_at ?? o.updated_at ?? o.created_at;
    default:
      return o.updated_at ?? o.created_at;
  }
}

export type StatusAgeTone = "fresh" | "warn" | "stale";

export function statusAge(sinceIso: string, nowMs: number = Date.now()): {
  label: string;
  tone: StatusAgeTone;
  hours: number;
} {
  const then = new Date(sinceIso).getTime();
  const diffMs = Math.max(0, nowMs - then);
  const hours = diffMs / (1000 * 60 * 60);
  const days = hours / 24;
  let label: string;
  if (hours < 1) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    label = `${mins} মিনিট`;
  } else if (hours < 24) {
    label = `${Math.round(hours)} ঘণ্টা`;
  } else {
    label = `${Math.floor(days)} দিন`;
  }
  const tone: StatusAgeTone = days < 1 ? "fresh" : days < 3 ? "warn" : "stale";
  return { label, tone, hours };
}

export function exportOrdersCsv(orders: OrderRow[]): string {
  const headers = [
    "Order ID", "Date", "Customer", "Phone", "Address", "City", "District",
    "Total", "Subtotal", "Shipping", "Discount", "Payment",
    "Status", "Confirmation", "Courier", "Tracking", "Source",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const o of orders) {
    lines.push([
      shortId(o.id),
      new Date(o.created_at).toLocaleString(),
      customerName(o),
      customerPhone(o),
      o.shipping_address ?? "",
      o.shipping_city ?? "",
      o.shipping_district ?? "",
      o.total,
      o.subtotal,
      o.shipping_fee,
      o.discount_amount,
      o.payment_method ?? "",
      o.status,
      o.confirmation_status,
      o.courier_name ?? "",
      o.tracking_number ?? "",
      o.source ?? "",
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}