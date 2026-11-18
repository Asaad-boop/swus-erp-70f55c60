/**
 * Islamic Gift Box (KIGB) — dedicated costing, stock & QC.
 *
 * Parts (mat, tasbeeh, camera, box × blue/pink) carry their own stock and
 * weighted-average landed cost. Purchases are batches (China shipment or local
 * box order) received through QC; damaged units are absorbed into the good
 * units' cost. Order stock movements on the gift-set product auto-deduct the
 * parts in the DB, and the gift-set variant cost is kept = sum of its parts.
 *
 * All writes go through SECURITY DEFINER RPCs (kigb_*), reads through RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// kigb_* tables are newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

export type PartCode = "mat" | "tasbeeh" | "camera" | "box";
export type Color = "blue" | "pink";

export type KigbPart = {
  id: string;
  code: PartCode;
  color: Color;
  name: string;
  source: "china" | "local";
  on_hand: number;
  wac: number;
  reorder_point: number;
  sort: number;
};

export type KigbSettings = {
  kit_product_id: string | null;
  blue_variant_id: string | null;
  pink_variant_id: string | null;
  default_color: Color;
  sync_cost: boolean;
  sell_price_single: number;
  sell_price_pair: number;
  packaging_cost: number;
  delivery_cost: number;
  ad_cost_per_order: number;
};

export type KigbBatchLine = {
  id: string;
  batch_id: string;
  part_id: string;
  ordered_qty: number;
  unit_price_bdt: number;
  unit_price_rmb: number | null;
  paid_qty: number | null;
  received_qty: number | null;
  good_qty: number | null;
  damaged_qty: number | null;
  extra_alloc_bdt: number | null;
  landed_unit_cost: number | null;
  qc_note: string | null;
};

export type KigbBatch = {
  id: string;
  batch_no: string;
  kind: "china" | "box";
  supplier: string | null;
  status: "ordered" | "in_transit" | "received" | "cancelled";
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  rmb_rate: number | null;
  china_shipping_bdt: number;
  cargo_bdt: number;
  agent_fee_bdt: number;
  other_cost_bdt: number;
  allocation: "value" | "qty";
  notes: string | null;
  created_at: string;
  lines: KigbBatchLine[];
};

export type KigbMovement = {
  id: string;
  part_id: string;
  delta: number;
  unit_cost: number;
  total_cost: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  order_id: string | null;
  note: string | null;
  on_hand_after: number;
  wac_after: number;
  created_at: string;
};

export const PART_LABEL: Record<PartCode, string> = {
  mat: "Prayer Mat",
  tasbeeh: "Tasbeeh",
  camera: "Camera",
  box: "Box / Money Bank",
};

export const REASON_LABEL: Record<string, string> = {
  purchase: "Purchase received",
  order_sale: "Order dispatched",
  order_sale_reversal: "Order reversed",
  order_return: "Return received",
  order_return_reversal: "Return reversed",
  order_item_update: "Order item changed",
  order_item_update_reversal: "Order item changed",
  order_item_delete: "Order item removed",
  damage: "Damaged",
  lost: "Lost",
  found: "Found",
  adjust: "Adjustment",
  opening: "Opening stock",
  count: "Physical count",
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchGiftBox() {
  const [parts, settings, batches, lines] = await Promise.all([
    db.from("kigb_parts").select("*").eq("active", true).order("sort"),
    db.from("kigb_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("kigb_batches").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("kigb_batch_lines").select("*"),
  ]);
  throwIf(parts.error);
  throwIf(settings.error);
  throwIf(batches.error);
  throwIf(lines.error);

  const partRows: KigbPart[] = (parts.data ?? []).map((p) => ({
    ...p,
    on_hand: num(p.on_hand),
    wac: num(p.wac),
    reorder_point: num(p.reorder_point),
  }));
  const lineRows: KigbBatchLine[] = (lines.data ?? []).map((l) => ({
    ...l,
    ordered_qty: num(l.ordered_qty),
    unit_price_bdt: num(l.unit_price_bdt),
  }));
  const batchRows: KigbBatch[] = (batches.data ?? []).map((b) => ({
    ...b,
    china_shipping_bdt: num(b.china_shipping_bdt),
    cargo_bdt: num(b.cargo_bdt),
    agent_fee_bdt: num(b.agent_fee_bdt),
    other_cost_bdt: num(b.other_cost_bdt),
    lines: lineRows.filter((l) => l.batch_id === b.id),
  }));
  const s = settings.data;
  const settingsRow: KigbSettings | null = s
    ? {
        ...s,
        sell_price_single: num(s.sell_price_single),
        sell_price_pair: num(s.sell_price_pair),
        packaging_cost: num(s.packaging_cost),
        delivery_cost: num(s.delivery_cost),
        ad_cost_per_order: num(s.ad_cost_per_order),
      }
    : null;
  return { parts: partRows, settings: settingsRow, batches: batchRows };
}

export async function fetchMovements(opts: {
  partId?: string | null;
  reason?: string | null;
  limit?: number;
}) {
  let q = db
    .from("kigb_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 300);
  if (opts.partId) q = q.eq("part_id", opts.partId);
  if (opts.reason) q = q.eq("reason", opts.reason);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []).map((m) => ({
    ...m,
    delta: num(m.delta),
    unit_cost: num(m.unit_cost),
    total_cost: num(m.total_cost),
    wac_after: num(m.wac_after),
  })) as KigbMovement[];
}

export type BatchLineInput = {
  part_id: string;
  ordered_qty: number;
  unit_price_bdt: number;
  unit_price_rmb?: number | null;
};
export type BatchInput = {
  id?: string;
  kind: "china" | "box";
  supplier?: string;
  status?: string;
  ordered_at?: string;
  expected_at?: string;
  rmb_rate?: number | null;
  china_shipping_bdt?: number;
  cargo_bdt?: number;
  agent_fee_bdt?: number;
  other_cost_bdt?: number;
  allocation?: "value" | "qty";
  notes?: string;
  lines: BatchLineInput[];
};

export async function saveBatch(input: BatchInput) {
  const { data, error } = await db.rpc("kigb_save_batch", { p: input });
  throwIf(error);
  return data as string;
}

export async function setBatchStatus(id: string, status: "ordered" | "in_transit" | "cancelled") {
  const { error } = await db.rpc("kigb_set_batch_status", { p_id: id, p_status: status });
  throwIf(error);
}

export type ReceiveLineInput = {
  id: string;
  paid_qty: number;
  received_qty: number;
  good_qty: number;
  damaged_qty: number;
  qc_note?: string;
};

export async function receiveBatch(id: string, lines: ReceiveLineInput[]) {
  const { error } = await db.rpc("kigb_receive_batch", { p_id: id, p_lines: lines });
  throwIf(error);
}

export async function adjustPart(input: {
  partId: string;
  delta: number;
  reason: "damage" | "lost" | "found" | "adjust" | "opening";
  unitCost?: number | null;
  note?: string;
}) {
  const { error } = await db.rpc("kigb_adjust", {
    p_part: input.partId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_unit_cost: input.unitCost ?? null,
    p_note: input.note ?? null,
  });
  throwIf(error);
}

export async function stockCount(
  counts: { part_id: string; counted: number; unit_cost?: number | null }[],
  note?: string,
) {
  const { data, error } = await db.rpc("kigb_stock_count", {
    p_counts: counts,
    p_note: note ?? null,
  });
  throwIf(error);
  return Number(data ?? 0);
}

export async function updateSettings(
  input: Partial<KigbSettings> & { reorder_points?: { part_id: string; reorder_point: number }[] },
) {
  const { error } = await db.rpc("kigb_update_settings", { p: input });
  throwIf(error);
}

/** Landed-cost preview identical to the DB formula in kigb_receive_batch. */
export function previewLanded(
  batch: Pick<
    KigbBatch,
    "china_shipping_bdt" | "cargo_bdt" | "agent_fee_bdt" | "other_cost_bdt" | "allocation"
  >,
  lines: { key: string; paid: number; received: number; good: number; unit: number }[],
) {
  const extra =
    batch.china_shipping_bdt + batch.cargo_bdt + batch.agent_fee_bdt + batch.other_cost_bdt;
  const baseTotal = lines.reduce((s, l) => s + l.paid * l.unit, 0);
  const qtyTotal = lines.reduce((s, l) => s + l.received, 0);
  const out: Record<string, { alloc: number; landed: number }> = {};
  for (const l of lines) {
    let alloc = 0;
    if (extra > 0) {
      if (batch.allocation === "qty" && qtyTotal > 0) alloc = (extra * l.received) / qtyTotal;
      else if (baseTotal > 0) alloc = (extra * l.paid * l.unit) / baseTotal;
      else if (qtyTotal > 0) alloc = (extra * l.received) / qtyTotal;
    }
    out[l.key] = { alloc, landed: l.good > 0 ? (l.paid * l.unit + alloc) / l.good : 0 };
  }
  return out;
}

export const bdt = (n: number, digits = 0) =>
  `৳${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
