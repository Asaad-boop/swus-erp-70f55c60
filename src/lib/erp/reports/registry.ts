/**
 * Master Report Registry — every report in the hub is declared here with its
 * source, formula and status. Nothing ships without a registry entry.
 */
export type ReportStatus = "live" | "planned";

export type ReportEntry = {
  id: string;
  name: string;
  category:
    | "Sales" | "Orders" | "Products" | "Customers" | "Inventory"
    | "Marketing" | "Returns" | "Supply chain" | "Finance" | "Control";
  /** Reports Hub tab that renders it. */
  tab: string;
  source: string;
  formula: string;
  basis: "created" | "confirmed" | "delivered" | "transaction_date" | "n/a";
  status: ReportStatus;
  definition_version: "v1";
};

const r = (e: Omit<ReportEntry, "definition_version">): ReportEntry => ({ ...e, definition_version: "v1" });

export const REPORT_REGISTRY: ReportEntry[] = [
  // Sales
  r({ id: "sales.summary", name: "Sales summary", category: "Sales", tab: "overview", source: "rpt_sales_summary", formula: "delivered lines aggregated", basis: "delivered", status: "live" }),
  r({ id: "sales.daily", name: "Daily revenue & profit", category: "Sales", tab: "sales", source: "rpt_sales_timeseries", formula: "delivered lines grouped by Dhaka day", basis: "delivered", status: "live" }),
  r({ id: "sales.breakdown", name: "Sales by dimension", category: "Sales", tab: "sales", source: "rpt_sales_breakdown", formula: "delivered lines grouped by brand / channel / courier", basis: "delivered", status: "live" }),
  r({ id: "sales.weekly", name: "Weekly / monthly roll-up", category: "Sales", tab: "sales", source: "rpt_sales_timeseries", formula: "daily series rolled up to ISO week / month", basis: "delivered", status: "planned" }),
  r({ id: "sales.category", name: "Category-wise sales", category: "Sales", tab: "products", source: "rpt_lines × categories", formula: "delivered lines grouped by product category", basis: "delivered", status: "planned" }),

  // Orders
  r({ id: "orders.funnel", name: "Order funnel", category: "Orders", tab: "orders", source: "rpt_order_funnel", formula: "placed → confirmed → shipped → delivered", basis: "created", status: "live" }),
  r({ id: "orders.ops", name: "Ops performance", category: "Orders", tab: "orders", source: "rpt_order_performance", formula: "rates + hours per stage", basis: "created", status: "live" }),
  r({ id: "orders.ledger", name: "All orders — line by line", category: "Orders", tab: "finance", source: "rpt_order_ledger", formula: "one row per order with revenue, cost and cash", basis: "delivered", status: "live" }),

  // Products / inventory
  r({ id: "products.profit", name: "Product profitability", category: "Products", tab: "products", source: "rpt_product_performance", formula: "net revenue − COGS − courier per SKU", basis: "delivered", status: "live" }),
  r({ id: "inventory.summary", name: "Inventory summary", category: "Inventory", tab: "inventory", source: "rpt_inventory_summary", formula: "stock × weighted average cost", basis: "n/a", status: "live" }),
  r({ id: "inventory.adjustments", name: "Stock adjustments audit", category: "Inventory", tab: "inventory", source: "stock_movements", formula: "manual adjustments grouped by reason", basis: "n/a", status: "planned" }),

  // Customers / marketing
  r({ id: "customers.summary", name: "Customer summary & RFM", category: "Customers", tab: "customers", source: "rpt_customer_summary", formula: "orders and revenue per normalised phone", basis: "delivered", status: "live" }),
  r({ id: "marketing.roas", name: "Campaign profit & ROAS", category: "Marketing", tab: "marketing", source: "get_campaign_profit", formula: "delivered revenue − COGS − opex vs spend", basis: "delivered", status: "live" }),

  // Returns
  r({ id: "returns.summary", name: "Returns & loss", category: "Returns", tab: "returns", source: "rpt_returns_summary", formula: "returned value, cost loss, courier loss", basis: "created", status: "live" }),
  r({ id: "returns.taxonomy", name: "Return / RTO / unpaid taxonomy", category: "Returns", tab: "control", source: "rpt_return_taxonomy", formula: "each failure type counted separately, never merged", basis: "created", status: "live" }),

  // Supply chain
  r({ id: "supply.po", name: "Purchase orders & landed cost", category: "Supply chain", tab: "supply", source: "imp_purchase_orders", formula: "PO value + freight allocated per unit", basis: "n/a", status: "live" }),

  // Finance
  r({ id: "finance.pnl", name: "Profit & loss", category: "Finance", tab: "finance", source: "rpt_pnl_v2", formula: "revenue − COGS − variable − ad spend − opex", basis: "delivered", status: "live" }),
  r({ id: "finance.cash", name: "Courier cash actually received", category: "Finance", tab: "finance", source: "rpt_order_ledger_summary", formula: "unique applied invoice payouts", basis: "transaction_date", status: "live" }),

  // Control layer
  r({ id: "control.chain", name: "Sales → Cash reconciliation chain", category: "Control", tab: "control", source: "rpt_reconcile_chain", formula: "revenue vs finance vs cash vs courier charge, with status per check", basis: "delivered", status: "live" }),
  r({ id: "control.close", name: "Period close", category: "Control", tab: "control", source: "rpt_period_close", formula: "frozen monthly revenue / cost / profit / cash snapshot", basis: "transaction_date", status: "live" }),
  r({ id: "control.archive", name: "Monthly business report (PDF)", category: "Control", tab: "control", source: "rpt_period_close.snapshot", formula: "printed from the closed-month snapshot", basis: "transaction_date", status: "planned" }),
];

export const REPORT_CATEGORIES = Array.from(new Set(REPORT_REGISTRY.map((x) => x.category)));
