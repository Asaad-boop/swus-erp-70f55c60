# Reports Hub — accurate, accounting-grade reporting

আমাদের এখনকার report গুলো আলাদা আলাদা page-এ ছড়ানো, একেকটা একেক formula ব্যবহার করে, তাই number মেলে না। Plan হলো একটাই **Reports Hub** বানানো যেখানে সব report একই canonical accounting source থেকে আসবে — sales, orders, products, customers, inventory, finance, marketing।

## Core principle: one source of truth

সব report একই definition মানবে:

```text
Gross Sales      = delivered order items line_total
- Discounts      = order-level discount allocated per line
= Net Revenue
- COGS           = unit_cost_snapshot → variant avg → product avg → cost_price
= Gross Profit
- Courier cost   = reconciled courier charge (actual, not estimate)
- Return loss    = returned/unpaid-return cost + courier both-way
- Ad spend       = get_meta_spend_bdt (FX-converted)
- Opex           = erp_transactions expense (non-informational only)
= Net Profit
```

Cash vs Accrual আলাদা করে দেখানো হবে — "Delivered (earned)" আর "Received (wallet-এ ঢুকেছে)" দুটো column, যাতে reconciliation-এর সাথে মিলে।

## Reports (7 tabs)

1. **Overview** — KPI strip (Net revenue, Gross profit, Net profit, Orders, AOV, Delivery rate, Return rate, ROAS), revenue vs profit trend chart, top movers।
2. **Sales** — daily/weekly/monthly sales, brand-wise, channel-wise (website/manual/Shopify/FB), payment-method wise, courier-wise, city/zone-wise।
3. **Orders** — status funnel (new → confirmed → shipped → delivered), delivery/return/cancel rate, courier performance, avg fulfilment time, fake/hold analysis।
4. **Products** — per SKU + variant: units sold, revenue, COGS, gross profit, margin %, return rate, stock cover (days), dead stock, combo breakdown।
5. **Customers** — new vs repeat, repeat rate, LTV, RFM segments, top customers, cohort retention।
6. **Inventory** — stock value (at cost), aging, low stock, reorder need, stock movement summary, landed-cost sync।
7. **Finance** — বিদ্যমান P&L / Balance Sheet / Cash Flow / Trial Balance / GL / Budget vs Actual, কিন্তু নতুন canonical P&L দিয়ে (COGS + courier + returns + ad spend সহ)।

প্রতিটা report-এ: date range picker (advanced variant), brand scope, compare-to-previous-period, drill-down (row click → underlying orders), Excel + PDF export।

## Technical work

- **New SQL RPCs** (brand-scoped, security definer, indexed):
  `rpt_sales_summary`, `rpt_sales_timeseries`, `rpt_order_funnel`, `rpt_product_performance`, `rpt_customer_summary`, `rpt_inventory_valuation`, `rpt_pnl_v2`।
  সবগুলো একটা shared internal view `rpt_delivered_lines` ব্যবহার করবে (existing `mkt_delivered_line_costs`-এর superset) যাতে COGS fallback chain একই থাকে।
- `erp_profit_loss` রিপ্লেস না করে `rpt_pnl_v2` বানানো হবে যেটা COGS, courier cost, return loss, ad spend আলাদা line হিসেবে দেবে; পুরোনো P&L tab নতুনটায় সুইচ হবে।
- **New route** `/erp/reports` (hub, 7 tabs), sidebar-এ "Reports" এখান থেকে point করবে। পুরোনো `/erp/finance/reports` Finance tab হিসেবে থেকে যাবে (redirect), যাতে কোনো link ভাঙে না।
- Shared components: `ReportShell` (header + range + export), `KpiStrip`, `ReportTable` (sort/pin/drilldown), `TrendChart`।
- Export: `exportAoaXlsx` reuse + jsPDF PDF (Bengali font already wired)।

## Rollout (যাতে একবারে ভেঙে না যায়)

- Phase 1 — canonical SQL layer + Overview + Sales tab
- Phase 2 — Orders + Products tab
- Phase 3 — Customers + Inventory tab
- Phase 4 — Finance tab migrate to `rpt_pnl_v2`, পুরোনো duplicate report page গুলো cleanup

## Verification

প্রতিটা phase-এ live data দিয়ে cross-check: Reports-এর revenue = reconciliation-এর received + pending, Reports-এর profit = brand-profitability page-এর profit, product report-এর units = stock movement। না মিললে ship করব না।
