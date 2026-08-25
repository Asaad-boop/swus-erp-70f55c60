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
  r({ id: "sales.breakdown", name: "Sales by dimension", category: "Sales", tab: "sales", source: "rpt_sales_breakdown", formula: "delivered lines grouped by channel / category / payment / courier / city / zone / brand / status", basis: "delivered", status: "live" }),
  r({ id: "sales.weekly", name: "Weekly / monthly roll-up", category: "Sales", tab: "sales", source: "rpt_sales_timeseries", formula: "daily series rolled up to Saturday-start week / Dhaka month", basis: "delivered", status: "live" }),
  r({ id: "sales.category", name: "Category-wise sales", category: "Sales", tab: "sales", source: "rpt_sales_breakdown (_dim = category)", formula: "delivered lines grouped by product category", basis: "delivered", status: "live" }),
  r({ id: "sales.zone", name: "Zone-wise sales", category: "Sales", tab: "sales", source: "rpt_sales_breakdown (_dim = zone)", formula: "delivered lines grouped by Pathao delivery zone", basis: "delivered", status: "live" }),

  // Orders
  r({ id: "orders.funnel", name: "Order funnel", category: "Orders", tab: "orders", source: "rpt_order_funnel", formula: "placed → confirmed → shipped → delivered", basis: "created", status: "live" }),
  r({ id: "orders.ops", name: "Ops performance", category: "Orders", tab: "orders", source: "rpt_order_performance", formula: "rates + hours per stage", basis: "created", status: "live" }),
  r({ id: "orders.ledger", name: "All orders — line by line", category: "Orders", tab: "finance", source: "rpt_order_ledger", formula: "one row per order with revenue, cost and cash", basis: "delivered", status: "live" }),

  // Products / inventory
  r({ id: "products.profit", name: "Product profitability", category: "Products", tab: "products", source: "rpt_product_performance", formula: "net revenue − COGS − courier per SKU", basis: "delivered", status: "live" }),
  r({ id: "inventory.summary", name: "Inventory summary", category: "Inventory", tab: "inventory", source: "rpt_inventory_summary", formula: "stock × weighted average cost", basis: "n/a", status: "live" }),
  r({ id: "inventory.adjustments", name: "Stock adjustments audit", category: "Inventory", tab: "inventory", source: "rpt_stock_adjustments / rpt_stock_adjustment_rows", formula: "stock movements grouped by reason, with value at movement unit cost", basis: "n/a", status: "live" }),
  r({ id: "inventory.aging", name: "Stock aging", category: "Inventory", tab: "inventory", source: "rpt_stock_aging", formula: "days since last stock-in per product, bucketed 0-30/31-60/61-90/91-180/180+", basis: "n/a", status: "live" }),
  r({ id: "inventory.stocktake", name: "Stocktake variance", category: "Inventory", tab: "inventory", source: "rpt_stocktake_variance", formula: "counted qty − system qty per session, valued at unit cost", basis: "n/a", status: "live" }),

  // Customers / marketing
  r({ id: "customers.summary", name: "Customer summary & RFM", category: "Customers", tab: "customers", source: "rpt_customer_summary", formula: "orders and revenue per normalised phone", basis: "delivered", status: "live" }),
  r({ id: "marketing.roas", name: "Campaign profit & ROAS", category: "Marketing", tab: "marketing", source: "get_campaign_profit", formula: "delivered revenue − COGS − opex vs spend", basis: "delivered", status: "live" }),
  r({ id: "marketing.ads", name: "Ad-level performance", category: "Marketing", tab: "marketing", source: "rpt_marketing_ads", formula: "spend (FIFO BDT) vs attributed delivered revenue per ad", basis: "created", status: "live" }),

  // Returns
  r({ id: "returns.summary", name: "Returns & loss", category: "Returns", tab: "returns", source: "rpt_returns_summary", formula: "returned value, cost loss, courier loss", basis: "created", status: "live" }),
  r({ id: "returns.taxonomy", name: "Return / RTO / unpaid taxonomy", category: "Returns", tab: "control", source: "rpt_return_taxonomy", formula: "each failure type counted separately, never merged", basis: "created", status: "live" }),
  r({ id: "delivery.courier", name: "Courier performance", category: "Returns", tab: "returns", source: "rpt_courier_performance", formula: "delivered ÷ (delivered + returned) per courier, on parcels shipped in range", basis: "created", status: "live" }),
  r({ id: "delivery.area", name: "Delivery area performance", category: "Returns", tab: "returns", source: "rpt_delivery_areas", formula: "success and return rate per Pathao zone / city", basis: "created", status: "live" }),

  // Supply chain
  r({ id: "supply.po", name: "Purchase orders & landed cost", category: "Supply chain", tab: "supply", source: "imp_purchase_orders", formula: "PO value + freight allocated per unit", basis: "n/a", status: "live" }),
  r({ id: "supply.supplier", name: "Supplier performance", category: "Supply chain", tab: "supply", source: "rpt_supplier_performance", formula: "POs, value, due, avg lead days, on-time % per supplier", basis: "n/a", status: "live" }),
  r({ id: "supply.cargo", name: "Cargo agent ledger", category: "Supply chain", tab: "supply", source: "rpt_cargo_ledger", formula: "deposits − charges per agent, running balance to period end", basis: "transaction_date", status: "live" }),

  // Finance
  r({ id: "finance.pnl", name: "Profit & loss", category: "Finance", tab: "finance", source: "rpt_pnl_v2", formula: "revenue − COGS − variable − ad spend − opex", basis: "delivered", status: "live" }),
  r({ id: "finance.cash", name: "Courier cash actually received", category: "Finance", tab: "finance", source: "rpt_order_ledger_summary", formula: "unique applied invoice payouts", basis: "transaction_date", status: "live" }),
  r({ id: "finance.cash_daily", name: "Daily cash report", category: "Finance", tab: "finance", source: "rpt_cash_daily", formula: "income − expense per day (transfers excluded)", basis: "transaction_date", status: "live" }),
  r({ id: "finance.wallets", name: "Bank & MFS account report", category: "Finance", tab: "finance", source: "rpt_cash_accounts", formula: "in, out, transfers and live balance per account", basis: "transaction_date", status: "live" }),
  r({ id: "finance.arap", name: "Receivables & payables (AR/AP)", category: "Finance", tab: "finance", source: "rpt_ar_ap", formula: "courier COD + unpaid delivered vs PO due, cargo balance and unpaid bills", basis: "transaction_date", status: "live" }),

  r({ id: "finance.cashflow", name: "Cash flow statement", category: "Finance", tab: "finance", source: "rpt_cash_flow", formula: "opening + cash in − cash out = closing (transfers excluded)", basis: "transaction_date", status: "live" }),
  r({ id: "finance.brand_pnl", name: "Brand-wise P&L", category: "Finance", tab: "finance", source: "rpt_pnl_by_brand", formula: "rpt_pnl_v2 computed per brand + company total", basis: "delivered", status: "live" }),
  r({ id: "finance.expenses", name: "Expense breakdown", category: "Finance", tab: "expenses", source: "rpt_expense_breakdown", formula: "expenses grouped by category / month / brand / account, vs budget", basis: "transaction_date", status: "live" }),

  // Warehouse & team
  r({ id: "ops.warehouse", name: "Warehouse stock summary", category: "Inventory", tab: "ops", source: "rpt_warehouse_summary", formula: "on-hand qty × cost, plus period in / out / damage / adjustment", basis: "transaction_date", status: "live" }),
  r({ id: "ops.team", name: "Team performance", category: "Orders", tab: "ops", source: "rpt_team_performance", formula: "confirmed / packed / shipped / cancelled actions per user from status history", basis: "created", status: "live" }),
  r({ id: "ops.cost_history", name: "Product cost history", category: "Products", tab: "ops", source: "rpt_product_cost_history", formula: "unit cost and landed cost per purchase receipt", basis: "transaction_date", status: "live" }),

  // Advanced analytics
  r({ id: "adv.abc", name: "ABC analysis", category: "Products", tab: "advanced", source: "rpt_abc_analysis", formula: "products ranked by revenue share; A = first 80%, B = next 15%, C = rest", basis: "delivered", status: "live" }),
  r({ id: "adv.cohort", name: "Customer cohort retention", category: "Customers", tab: "advanced", source: "rpt_customer_cohort", formula: "repeat customers per first-purchase month", basis: "delivered", status: "live" }),
  r({ id: "adv.breakeven", name: "Break-even analysis", category: "Finance", tab: "advanced", source: "rpt_breakeven", formula: "fixed cost ÷ contribution per order", basis: "delivered", status: "live" }),
  r({ id: "adv.forecast", name: "Stock & cash forecast", category: "Inventory", tab: "advanced", source: "rpt_forecast", formula: "daily velocity → stock-out date, reorder qty and cash required", basis: "delivered", status: "live" }),

  // Control layer
  r({ id: "control.chain", name: "Sales → Cash reconciliation chain", category: "Control", tab: "control", source: "rpt_reconcile_chain", formula: "revenue vs finance vs cash vs courier charge, with status per check", basis: "delivered", status: "live" }),
  r({ id: "control.close", name: "Period close", category: "Control", tab: "control", source: "rpt_period_close", formula: "frozen monthly revenue / cost / profit / cash snapshot", basis: "transaction_date", status: "live" }),
  r({ id: "control.archive", name: "Monthly business report (PDF)", category: "Control", tab: "control", source: "rpt_period_close.snapshot", formula: "printed from the closed-month snapshot", basis: "transaction_date", status: "planned" }),
];

export const REPORT_CATEGORIES = Array.from(new Set(REPORT_REGISTRY.map((x) => x.category)));
