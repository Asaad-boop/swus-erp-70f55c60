/**
 * Expense classification for the Finance overview P&L.
 *
 * Some `erp_transactions` rows of type `expense` are really capital / asset
 * movements, not operating cost:
 *  - `imp_payment`          — import PO payments (becomes inventory, then COGS on sale)
 *  - `meta_dollar_purchase` — buying ad dollars (prepaid ad wallet, spend recognised on consumption)
 *
 * Counting them as opex double-charges the P&L (once as cash-out, again as
 * COGS/ad-spend) and is what made Net Profit look deeply negative.
 */
const CAPITAL_REFS = new Set(["imp_payment", "meta_dollar_purchase"]);

export function isCapitalOutflow(referenceType: string | null | undefined): boolean {
  return !!referenceType && CAPITAL_REFS.has(referenceType);
}

const REF_LABELS: Record<string, string> = {
  order_courier: "Courier Charges",
  courier_shipment: "Courier Charges",
  order_settlement: "Courier Charges",
  cod_invoice: "Courier Charges",
  order_return_charge: "Return Charges",
  order_advance_refund: "Refunds",
  order: "Order Costs",
  wallet_reconciliation: "Reconciliation Adjustments",
  reconciliation_row: "Reconciliation Adjustments",
};

export function refLabel(referenceType: string | null | undefined): string {
  if (!referenceType) return "General / Manual";
  return REF_LABELS[referenceType] ?? "Other";
}
