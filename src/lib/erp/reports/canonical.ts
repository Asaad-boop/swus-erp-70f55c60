/**
 * Canonical metric dictionary — Phase 0 of the Reporting + Accounting Control Layer.
 *
 * RULE: one number = one source = one formula.
 * Every KPI shown anywhere in the Reports Hub must map to an entry here.
 * If a surface needs a number that is not defined here, define it here first.
 */

export type MetricBasis = "created" | "confirmed" | "delivered" | "transaction_date" | "n/a";

export type MetricDef = {
  key: string;
  label: string;
  /** Canonical SQL source (RPC / table) — never recomputed in the client. */
  source: string;
  /** Human-readable formula. Displayed in tooltips and the report index. */
  formula: string;
  basis: MetricBasis;
  /** What is deliberately excluded — the most common source of arguments. */
  excludes?: string;
  version: "v1";
};

const def = (m: Omit<MetricDef, "version">): MetricDef => ({ ...m, version: "v1" });

export const METRICS: Record<string, MetricDef> = Object.fromEntries(
  [
    // ---- Revenue chain -------------------------------------------------
    def({
      key: "gross_sales",
      label: "Gross sales",
      source: "rpt_sales_summary → rpt_lines",
      formula: "SUM(unit_price × quantity) of delivered lines",
      basis: "delivered",
      excludes: "delivery charge, cancelled, RTO and returned orders",
    }),
    def({
      key: "discounts",
      label: "Discounts",
      source: "rpt_sales_summary → rpt_lines.discount_alloc",
      formula: "line discount + order discount allocated pro-rata to each line",
      basis: "delivered",
    }),
    def({
      key: "net_revenue",
      label: "Net revenue",
      source: "rpt_sales_summary",
      formula: "gross_sales − discounts",
      basis: "delivered",
      excludes: "delivery charge income (kept separate on purpose)",
    }),
    def({
      key: "shipping_income",
      label: "Delivery charge income",
      source: "rpt_sales_summary → orders.shipping_fee",
      formula: "SUM(shipping_fee) of delivered orders",
      basis: "delivered",
    }),
    def({
      key: "total_revenue",
      label: "Total revenue",
      source: "rpt_sales_summary",
      formula: "net_revenue + shipping_income",
      basis: "delivered",
      excludes: "cash actually received — that is a separate metric",
    }),

    // ---- Cost chain ----------------------------------------------------
    def({
      key: "cogs",
      label: "COGS",
      source: "rpt_lines.line_cogs",
      formula: "SUM(unit_cost_snapshot × quantity); snapshot is frozen at delivery",
      basis: "delivered",
      excludes: "courier cost, packaging, ad spend",
    }),
    def({
      key: "gross_profit",
      label: "Gross profit",
      source: "rpt_sales_summary",
      formula: "net_revenue − COGS",
      basis: "delivered",
    }),
    def({
      key: "courier_cost",
      label: "Courier cost",
      source: "rpt_lines.courier_cost (from reconciled invoices)",
      formula: "actual courier charge from reconciliation, allocated to lines",
      basis: "delivered",
      excludes: "estimated rates — only reconciled charges count",
    }),
    def({
      key: "contribution_profit",
      label: "Contribution profit",
      source: "rpt_sales_summary",
      formula: "total_revenue − COGS − courier − packaging − refunds − return courier",
      basis: "delivered",
      excludes: "ad spend and operating expenses",
    }),
    def({
      key: "net_profit",
      label: "Net profit",
      source: "rpt_pnl_v2",
      formula: "contribution_profit − ad_spend − opex + other income",
      basis: "delivered",
    }),

    // ---- Cash chain ----------------------------------------------------
    def({
      key: "cod_expected",
      label: "COD expected",
      source: "rpt_order_ledger_summary",
      formula: "SUM(order total − advance) of delivered orders",
      basis: "delivered",
    }),
    def({
      key: "courier_collected",
      label: "Courier payout received",
      source: "erp_reconciliation_rows (applied, unique consignment)",
      formula: "SUM(payout) of applied unique invoice rows",
      basis: "transaction_date",
      excludes: "duplicate invoice rows, unapplied rows",
    }),
    def({
      key: "advance_total",
      label: "Advance received",
      source: "orders.advance_amount",
      formula: "SUM(advance_amount) of delivered orders",
      basis: "delivered",
    }),
    def({
      key: "cash_received",
      label: "Cash received",
      source: "rpt_order_ledger_summary",
      formula: "courier_collected + advance_total",
      basis: "transaction_date",
    }),

    // ---- Return taxonomy (Return ≠ RTO ≠ Unpaid ≠ Cancelled) -----------
    def({
      key: "customer_return",
      label: "Customer return",
      source: "rpt_return_taxonomy",
      formula: "orders with status returned / paid_return",
      basis: "created",
      excludes: "RTO, partial returns, cancellations",
    }),
    def({
      key: "partial_return",
      label: "Partial return",
      source: "rpt_return_taxonomy",
      formula: "orders with status partial_return / partial_delivered",
      basis: "created",
    }),
    def({
      key: "rto",
      label: "RTO (returned to origin)",
      source: "rpt_return_taxonomy",
      formula: "orders with status unpaid_return / return_in_transit / pending_return",
      basis: "created",
      excludes: "customer-initiated returns after delivery",
    }),
    def({
      key: "failed_delivery",
      label: "Failed delivery",
      source: "rpt_return_taxonomy",
      formula: "shipped orders now on_hold or damaged",
      basis: "created",
    }),
    def({
      key: "cancelled",
      label: "Cancelled",
      source: "rpt_return_taxonomy",
      formula: "orders with status cancelled / fake (never shipped or recalled)",
      basis: "created",
      excludes: "returns and RTO",
    }),
    def({
      key: "unpaid",
      label: "Delivered but unpaid",
      source: "rpt_return_taxonomy",
      formula: "delivered orders where payment_status ≠ paid; value = total − advance",
      basis: "created",
      excludes: "returns — the goods were delivered, only the cash is missing",
    }),
  ].map((m) => [m.key, m]),
);

export function metric(key: string): MetricDef | undefined {
  return METRICS[key];
}

/** Short "source · formula" line for tooltips. */
export function metricHint(key: string): string | undefined {
  const m = METRICS[key];
  if (!m) return undefined;
  return `${m.formula} — source: ${m.source}${m.excludes ? ` · excludes ${m.excludes}` : ""}`;
}
