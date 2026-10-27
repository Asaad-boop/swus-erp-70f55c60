export type ImpPoStatus =
  | "pending_review"
  | "ordered"
  | "at_china_warehouse"
  | "in_transit"
  | "arrived_bd"
  | "partially_received"
  | "completed"
  | "cancelled";

export type ImpCartonStatus =
  | "ordered"
  | "at_china_warehouse"
  | "in_transit"
  | "arrived_bd"
  | "released"
  | "in_stock"
  | "cancelled";

export type ImpPaymentType =
  | "supplier_advance"
  | "supplier_payment"
  | "shipping"
  | "carton_release"
  | "supplier_balance"
  | "local_courier"
  | "adjustment";

export const PO_STATUS_LABEL: Record<ImpPoStatus, { label: string; tone: string }> = {
  pending_review:     { label: "Pending Review",     tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  ordered:            { label: "Ordered",            tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  at_china_warehouse: { label: "At China WH",        tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  in_transit:         { label: "In Transit",         tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  arrived_bd:         { label: "Arrived BD",         tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  partially_received: { label: "Partial Received",   tone: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  completed:          { label: "Completed",          tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled:          { label: "Cancelled",          tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export const CARTON_STATUS_LABEL: Record<ImpCartonStatus, { label: string; tone: string }> = {
  ordered:            { label: "Ordered",       tone: "bg-slate-100 text-slate-700" },
  at_china_warehouse: { label: "At China WH",   tone: "bg-amber-100 text-amber-800" },
  in_transit:         { label: "In Transit",    tone: "bg-blue-100 text-blue-800" },
  arrived_bd:         { label: "Arrived BD",    tone: "bg-violet-100 text-violet-800" },
  released:           { label: "Released",      tone: "bg-cyan-100 text-cyan-800" },
  in_stock:           { label: "In Stock",      tone: "bg-emerald-100 text-emerald-800" },
  cancelled:          { label: "Cancelled",     tone: "bg-red-100 text-red-700" },
};

export function fmtBdt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "৳0";
  return "৳" + v.toLocaleString("en-BD", { maximumFractionDigits: 2 });
}

/**
 * Compact lakh/crore shorthand for big money: 1,25,000 -> "৳1.25L", 1.2 crore -> "৳1.2Cr".
 * Boro amount tile/bill row-te choto jaygay dekhanor jonno; full value title/tooltip-e thakbe.
 */
export function fmtBdtShort(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "৳0";
  const abs = Math.abs(v);
  if (abs >= 1e7) return `৳${+(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `৳${+(v / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `৳${+(v / 1e3).toFixed(1)}K`;
  return fmtBdt(v);
}

/**
 * FX/pro-rata rounding-e ৳0.01–0.99 residue thake — eta due na.
 * UI-te "Pay Due ৳0.02" dekhano bondho korte ei helper use korun.
 */
export function netDue(n: number | string | null | undefined): number {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return 0;
  return Math.abs(v) < 1 ? 0 : v;
}

export function newIdemKey(prefix: string = "imp"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
/** ETA status: days late (>0) / days left (<=0) for POs not yet arrived in BD. null = no ETA or already arrived. */
export const PO_ARRIVED_STATUSES = ["arrived_bd", "partially_received", "completed", "cancelled"];
export function poEtaDays(eta: string | null | undefined, status: string, today: string): number | null {
  if (!eta || PO_ARRIVED_STATUSES.includes(status)) return null;
  const ms = Date.parse(today + "T00:00:00Z") - Date.parse(eta.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}
