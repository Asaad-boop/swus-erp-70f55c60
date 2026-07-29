import { supabase } from "@/integrations/supabase/client";

export type PreorderStage = "open" | "advance_paid" | "ready" | "called" | "confirmed" | "cancelled";

export const PREORDER_STAGES: { key: PreorderStage; label: string; className: string; accent: string }[] = [
  { key: "open", label: "Open", className: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300", accent: "#64748b" },
  { key: "advance_paid", label: "Advance Paid", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", accent: "#10b981" },
  { key: "ready", label: "Stock Arrived", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", accent: "#0ea5e9" },
  { key: "called", label: "Called & Confirmed", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300", accent: "#6366f1" },
  { key: "confirmed", label: "Converted", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", accent: "#8b5cf6" },
  { key: "cancelled", label: "Cancelled", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", accent: "#71717a" },
];

export function stageMeta(stage: string | null | undefined) {
  return PREORDER_STAGES.find((s) => s.key === stage) ?? PREORDER_STAGES[0];
}

export const PAYMENT_METHODS = ["bKash", "Nagad", "Rocket", "Bank Transfer", "Cash", "Card"] as const;
export const DUE_COLLECT_METHODS = ["COD", "bKash", "Nagad", "Rocket", "Bank Transfer", "Cash on pickup"] as const;
export const ADVANCE_SOURCES = ["bKash", "Nagad", "Rocket", "Bank", "Cash"] as const;

export type PreorderRecord = {
  id: string;
  order_id: string;
  brand_id: string | null;
  promise_date: string | null;
  promise_days: number | null;
  stage: PreorderStage;
  advance_amount: number;
  advance_method: string | null;
  advance_source: string | null;
  advance_txn_id: string | null;
  advance_received_at: string | null;
  due_amount: number;
  due_collect_method: string | null;
  due_note: string | null;
  ready_at: string | null;
  called_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PreorderIntake = {
  orderId: string;
  brandId: string | null;
  promiseDays: number | null;
  promiseDate: string | null;
  advanceAmount: number;
  advanceMethod: string | null;
  advanceSource: string | null;
  advanceTxnId: string | null;
  dueCollectMethod: string | null;
  dueNote: string | null;
  notes: string | null;
};

export function promiseDateFromDays(days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysLeft(promiseDate: string | null | undefined): number | null {
  if (!promiseDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${promiseDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function logPreorderEvent(args: {
  preorderId: string;
  orderId: string;
  brandId: string | null;
  event: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
}) {
  await supabase.from("preorder_events").insert({
    preorder_id: args.preorderId,
    order_id: args.orderId,
    brand_id: args.brandId,
    event: args.event,
    detail: args.detail ?? null,
    meta: (args.meta ?? {}) as never,
    created_by: await currentUserId(),
  });
}

/**
 * Move an existing order into the pre-order pipeline (or create the
 * pre-order record for a freshly inserted order).
 */
export async function moveOrderToPreorder(intake: PreorderIntake) {
  const uid = await currentUserId();
  const promiseDate = intake.promiseDate ?? promiseDateFromDays(intake.promiseDays);

  const { data: order, error: readErr } = await supabase
    .from("orders")
    .select("id,brand_id,total,subtotal,shipping_fee,discount_amount,advance_amount,advance_source,advance_txn_id,payment_method")
    .eq("id", intake.orderId)
    .single();
  if (readErr) throw readErr;

  const brandId = intake.brandId ?? order.brand_id ?? null;
  const existingAdvance = Number(order.advance_amount ?? 0);
  const advance = Number(intake.advanceAmount || 0) > 0 ? Number(intake.advanceAmount) : existingAdvance;
  const advanceMethod = intake.advanceMethod ?? order.payment_method ?? null;
  const advanceSource = intake.advanceSource ?? order.advance_source ?? advanceMethod;
  const advanceTxnId = intake.advanceTxnId ?? order.advance_txn_id ?? null;
  const gross = Math.max(0, Number(order.subtotal ?? 0) + Number(order.shipping_fee ?? 0) - Number(order.discount_amount ?? 0));
  const dueBase = gross > 0 ? gross : Number(order.total || 0);
  const due = Math.max(0, dueBase - advance);

  const orderPatch: Record<string, unknown> = {
    status: "pre_order",
    is_preorder: true,
    preorder_expected_date: promiseDate,
    preorder_ready_at: null,
    preorder_converted_at: null,
  };
  if (advance > 0) {
    orderPatch.advance_amount = advance;
    orderPatch.advance_source = advanceSource;
    if (advanceTxnId) orderPatch.advance_txn_id = advanceTxnId;
  }

  const { error: updErr } = await supabase.from("orders").update(orderPatch as never).eq("id", intake.orderId);
  if (updErr) throw updErr;

  const { data: pre, error: preErr } = await supabase
    .from("preorders")
    .upsert(
      {
        order_id: intake.orderId,
        brand_id: brandId,
        promise_date: promiseDate,
        promise_days: intake.promiseDays,
        stage: advance > 0 ? "advance_paid" : "open",
        advance_amount: advance,
        advance_method: advance > 0 ? advanceMethod : null,
        advance_source: advance > 0 ? advanceSource : null,
        advance_txn_id: advance > 0 ? advanceTxnId : null,
        advance_received_at: advance > 0 ? new Date().toISOString() : null,
        due_amount: due,
        due_collect_method: intake.dueCollectMethod,
        due_note: intake.dueNote,
        notes: intake.notes,
        cancelled_at: null,
        confirmed_at: null,
        created_by: uid,
      } as never,
      { onConflict: "order_id" },
    )
    .select("id")
    .single();
  if (preErr) throw preErr;

  await logPreorderEvent({
    preorderId: pre.id,
    orderId: intake.orderId,
    brandId,
    event: advance > 0 ? "advance_paid" : "placed",
    detail: advance > 0
      ? `Pre-order placed with ৳${advance.toLocaleString()} advance (${intake.advanceMethod ?? "—"})`
      : "Pre-order placed without advance",
    meta: { promise_date: promiseDate, due },
  });

  return pre.id as string;
}

export async function recordPreorderAdvance(args: {
  preorder: Pick<PreorderRecord, "id" | "order_id" | "brand_id" | "due_amount">;
  amount: number;
  method: string | null;
  source: string | null;
  txnId: string | null;
}) {
  const amount = Number(args.amount || 0);
  const { error } = await supabase
    .from("preorders")
    .update({
      stage: "advance_paid",
      advance_amount: amount,
      advance_method: args.method,
      advance_source: args.source,
      advance_txn_id: args.txnId,
      advance_received_at: new Date().toISOString(),
    } as never)
    .eq("id", args.preorder.id);
  if (error) throw error;

  const { data: order } = await supabase.from("orders").select("total").eq("id", args.preorder.order_id).single();
  const due = Math.max(0, Number(order?.total || 0) - amount);
  await supabase.from("preorders").update({ due_amount: due } as never).eq("id", args.preorder.id);

  const { error: oErr } = await supabase
    .from("orders")
    .update({
      advance_amount: amount,
      advance_source: args.source ?? args.method ?? null,
      ...(args.txnId ? { advance_txn_id: args.txnId } : {}),
    } as never)
    .eq("id", args.preorder.order_id);
  if (oErr) throw oErr;

  await logPreorderEvent({
    preorderId: args.preorder.id,
    orderId: args.preorder.order_id,
    brandId: args.preorder.brand_id,
    event: "advance_paid",
    detail: `Advance ৳${amount.toLocaleString()} received via ${args.method ?? "—"}`,
  });
}

export async function markPreordersReady(rows: Pick<PreorderRecord, "id" | "order_id" | "brand_id">[]) {
  const now = new Date().toISOString();
  const ids = rows.map((r) => r.id);
  const { error } = await supabase.from("preorders").update({ stage: "ready", ready_at: now } as never).in("id", ids);
  if (error) throw error;
  await supabase.from("orders").update({ preorder_ready_at: now } as never).in("id", rows.map((r) => r.order_id));
  for (const r of rows) {
    await logPreorderEvent({ preorderId: r.id, orderId: r.order_id, brandId: r.brand_id, event: "ready", detail: "Stock arrived — ready to call customer" });
  }
}

export async function markPreorderCalled(row: Pick<PreorderRecord, "id" | "order_id" | "brand_id">, note?: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("preorders").update({ stage: "called", called_at: now } as never).eq("id", row.id);
  if (error) throw error;
  await logPreorderEvent({ preorderId: row.id, orderId: row.order_id, brandId: row.brand_id, event: "called", detail: note ?? "Customer called & confirmed" });
}

/** Push the pre-order into the normal packaging pipeline. */
export async function confirmPreorderToPipeline(row: Pick<PreorderRecord, "id" | "order_id" | "brand_id">) {
  const now = new Date().toISOString();
  const uid = await currentUserId();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      confirmation_status: "confirmed",
      confirmed_at: now,
      confirmed_by: uid,
      web_status: "complete",
      is_preorder: true,
      preorder_converted_at: now,
    } as never)
    .eq("id", row.order_id);
  if (error) throw error;
  const { error: pErr } = await supabase
    .from("preorders")
    .update({ stage: "confirmed", confirmed_at: now } as never)
    .eq("id", row.id);
  if (pErr) throw pErr;
  await logPreorderEvent({ preorderId: row.id, orderId: row.order_id, brandId: row.brand_id, event: "confirmed", detail: "Converted to a confirmed order (pending queue)" });
}

export async function cancelPreorder(row: Pick<PreorderRecord, "id" | "order_id" | "brand_id">, reason: string | null) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("orders").update({ status: "cancelled", cancelled_at: now } as never).eq("id", row.order_id);
  if (error) throw error;
  const { error: pErr } = await supabase
    .from("preorders")
    .update({ stage: "cancelled", cancelled_at: now, cancel_reason: reason } as never)
    .eq("id", row.id);
  if (pErr) throw pErr;
  await logPreorderEvent({ preorderId: row.id, orderId: row.order_id, brandId: row.brand_id, event: "cancelled", detail: reason ?? "Pre-order cancelled" });
}

export async function updatePreorderPlan(row: Pick<PreorderRecord, "id" | "order_id" | "brand_id">, patch: {
  promise_days?: number | null;
  promise_date?: string | null;
  due_collect_method?: string | null;
  due_note?: string | null;
  notes?: string | null;
}) {
  const { error } = await supabase.from("preorders").update(patch as never).eq("id", row.id);
  if (error) throw error;
  if (patch.promise_date !== undefined) {
    await supabase.from("orders").update({ preorder_expected_date: patch.promise_date } as never).eq("id", row.order_id);
  }
  await logPreorderEvent({ preorderId: row.id, orderId: row.order_id, brandId: row.brand_id, event: "updated", detail: "Pre-order plan updated" });
}