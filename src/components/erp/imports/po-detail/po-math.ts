import { netDue } from "@/lib/erp/imports/types";

const SUPPLIER_TYPES = ["supplier_advance", "supplier_payment", "supplier_balance", "carton_release"];
const FREIGHT_TYPES = ["shipping", "local_courier"];

export type PoMath = {
  /** total ordered pieces (PO line items) */
  qtyOrdered: number;
  /** pieces already released (quantity mode: releases; carton mode: released+in_stock cartons) */
  qtyReleased: number;
  qtyRemaining: number;
  releasedPct: number;
  /** money */
  supplierPaid: number;
  freightPaid: number;
  totalPaid: number;
  grandTotal: number;
  due: number;
  paidPct: number;
  /** landed cost per received unit */
  landedPerUnit: number;
  /** true when PO grand total does not match line subtotal + charges */
  totalsMismatch: boolean;
  mismatchAmount: number;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function computePoMath(args: {
  po: any;
  items: any[];
  cartons: any[];
  releases: any[];
  payments: any[];
  isQtyMode: boolean;
}): PoMath {
  const { po, items, cartons, releases, payments, isQtyMode } = args;

  const qtyOrdered = items.reduce((s, i) => s + num(i.quantity), 0);

  const qtyReleased = isQtyMode
    ? releases.reduce(
        (s: number, r: any) =>
          s + (r.items ?? []).reduce((n: number, i: any) => n + num(i.quantity) + num(i.damaged_qty), 0),
        0,
      )
    : cartons
        .filter((c) => ["released", "in_stock"].includes(c.status))
        .reduce((s, c) => s + num(c.expected_quantity), 0);

  const qtyRemaining = Math.max(0, qtyOrdered - qtyReleased);
  const releasedPct = qtyOrdered > 0 ? Math.round((qtyReleased / qtyOrdered) * 100) : 0;

  const live = payments.filter((p: any) => !p.is_reversed);
  const supplierPaid = live
    .filter((p: any) => SUPPLIER_TYPES.includes(p.payment_type))
    .reduce((s: number, p: any) => s + num(p.amount_bdt), 0);
  const freightPaid = live
    .filter((p: any) => FREIGHT_TYPES.includes(p.payment_type))
    .reduce((s: number, p: any) => s + num(p.amount_bdt), 0);
  const totalPaid = num(po.paid_bdt) || supplierPaid + freightPaid;

  const grandTotal = num(po.grand_total_bdt);
  const due = netDue(po.due_bdt ?? grandTotal - totalPaid);
  const paidPct = grandTotal > 0 ? Math.min(100, Math.round((totalPaid / grandTotal) * 100)) : 0;

  const receivedUnits = qtyReleased > 0 ? qtyReleased : qtyOrdered;
  const landedPerUnit = receivedUnits > 0 ? grandTotal / receivedUnits : 0;

  const lineSubtotal = items.reduce((s, i) => s + num(i.subtotal_bdt), 0);
  const charges =
    num(po.shipping_total_bdt) +
    num(po.local_courier_total_bdt) +
    num(po.customs_duty_bdt) +
    num(po.other_charges_bdt);
  const expected = lineSubtotal + charges;
  const mismatchAmount = grandTotal > 0 && expected > 0 ? +(grandTotal - expected).toFixed(2) : 0;

  return {
    qtyOrdered,
    qtyReleased,
    qtyRemaining,
    releasedPct,
    supplierPaid,
    freightPaid,
    totalPaid,
    grandTotal,
    due,
    paidPct,
    landedPerUnit,
    totalsMismatch: Math.abs(mismatchAmount) > 1,
    mismatchAmount,
  };
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
