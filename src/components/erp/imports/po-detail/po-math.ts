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

  // Landed cost is a PER-UNIT rate: always spread the PO grand total over the
  // FULL ordered quantity. Dividing by only the released pcs inflated the rate
  // on partially-released POs (e.g. 279,200 / 800 = 349 instead of 279.2).
  const costUnits = qtyOrdered > 0 ? qtyOrdered : qtyReleased;
  const landedPerUnit = costUnits > 0 ? grandTotal / costUnits : 0;

  const lineSubtotal = items.reduce((s, i) => s + num(i.subtotal_bdt), 0);
  // Freight lives in one of three legacy columns — take the largest, never the sum.
  const freight = Math.max(
    num(po.shipping_total_bdt),
    num(po.shipping_cost_bdt),
    num(po.freight_cost_bdt),
  );
  const charges =
    freight +
    num(po.local_courier_total_bdt) +
    num(po.local_delivery_total_bdt) +
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

/** Anchors that live inside a specific PO detail tab. */
const SECTION_TAB: Record<string, string> = {
  "release-section": "shipment",
  "cartons-section": "shipment",
  "freight-section": "shipment",
};

export const PO_GOTO_EVENT = "po-detail-goto-section";

export function scrollToSection(id: string) {
  const tab = SECTION_TAB[id];
  if (tab && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PO_GOTO_EVENT, { detail: { id, tab } }));
  }
  // The target may live in a tab that is still mounting — retry a few frames.
  const attempt = (n: number) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (n < 30) requestAnimationFrame(() => attempt(n + 1));
  };
  attempt(0);
}

