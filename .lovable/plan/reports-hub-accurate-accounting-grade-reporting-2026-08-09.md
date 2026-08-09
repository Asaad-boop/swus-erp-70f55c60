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

### দুইটা জিনিস যা এখন ভুল হচ্ছে, আগে ঠিক করব

- **Timezone** — এখন বেশিরভাগ report UTC তে date কাটে, তাই Dhaka রাত ৬টার পরের order আগের/পরের দিনে চলে যায় আর daily total মেলে না। সব RPC-তে `(timestamp at time zone 'Asia/Dhaka')::date` ব্যবহার হবে।
- **Date basis** — "কোন তারিখ" সেটা report ভেদে আলাদা (created / confirmed / delivered / reconciled)। প্রতিটা report-এ basis স্পষ্ট করে দেখানো হবে ও switch করা যাবে; default: sales = delivered, orders = created, cash = reconciled।

## Reports (10 tabs)

1. **Overview** — KPI strip (Net revenue, Gross profit, Net profit, Orders, AOV, Delivery rate, Return rate, ROAS), revenue vs profit trend chart, top movers।
2. **Sales** — daily/weekly/monthly sales, brand-wise, channel-wise (website/manual/Shopify/FB), payment-method wise, courier-wise, city/zone-wise।
3. **Orders** — status funnel (new → confirmed → shipped → delivered), delivery/return/cancel rate, courier performance, avg fulfilment time, fake/hold analysis।
4. **Products** — per SKU + variant: units sold, revenue, COGS, gross profit, margin %, return rate, stock cover (days), dead stock, combo breakdown।
5. **Customers** — new vs repeat, repeat rate, LTV, RFM segments, top customers, cohort retention।
6. **Inventory** — stock value (at cost), aging, low stock, reorder need, stock movement summary, landed-cost sync।
7. **Finance** — বিদ্যমান P&L / Balance Sheet / Cash Flow / Trial Balance / GL / Budget vs Actual, কিন্তু নতুন canonical P&L দিয়ে (COGS + courier + returns + ad spend সহ)।
8. **Marketing** — ad spend, ROAS (blended + per campaign/product), CAC, attribution coverage, content/influencer খরচ, daily spend vs delivered profit।
9. **Returns & Courier** — return/exchange rate (product-wise, courier-wise, area-wise), return loss ৳, COD reconciliation status, courier charge vs estimate variance, outstanding COD।
10. **Supply chain** — import PO landed cost, supplier-wise খরচ, cargo agent ledger, local PO, purchase vs sale price gap, pre-order pipeline (advance collected vs due)।

এছাড়া প্রতি tab-এর উপরে একটা **Data Health** strip: cost missing units, unmatched reconciliation rows, orders without courier cost, unattributed ad spend — যাতে বোঝা যায় number টা কতটা নির্ভরযোগ্য। এই strip না থাকলে "accurate" দাবি করা যায় না।

প্রতিটা report-এ: date range picker (advanced variant — presets + typeable from/to + 2-month calendar), brand scope (single/all), compare-to-previous-period, drill-down (row click → underlying order list), Excel + PDF export।

## Technical work

- **New SQL RPCs** (brand-scoped, security definer, indexed):
  `rpt_sales_summary`, `rpt_sales_timeseries`, `rpt_order_funnel`, `rpt_product_performance`, `rpt_customer_summary`, `rpt_inventory_valuation`, `rpt_pnl_v2`।
  সবগুলো একটা shared internal view `rpt_delivered_lines` ব্যবহার করবে (existing `mkt_delivered_line_costs`-এর superset) যাতে COGS fallback chain একই থাকে।
- `erp_profit_loss` রিপ্লেস না করে `rpt_pnl_v2` বানানো হবে যেটা COGS, courier cost, return loss, ad spend আলাদা line হিসেবে দেবে; পুরোনো P&L tab নতুনটায় সুইচ হবে।
- **New route** `/erp/reports` (hub, 7 tabs), sidebar-এ "Reports" এখান থেকে point করবে। পুরোনো `/erp/finance/reports` Finance tab হিসেবে থেকে যাবে (redirect), যাতে কোনো link ভাঙে না।
- Shared components: `ReportShell` (header + range + export), `KpiStrip`, `ReportTable` (sort/pin/drilldown), `TrendChart`।
- Export: `exportAoaXlsx` reuse + jsPDF PDF (Bengali font already wired)।
- **Performance** — বড় range-এ live aggregation ধীর হবে, তাই একটা nightly snapshot table `rpt_daily_facts` (brand × date × product) রাখা হবে; report গুলো snapshot থেকে পড়বে, আজকের দিনটা live। Snapshot rebuild করার manual button ও থাকবে।
- **Permissions** — `page-catalog.ts`-এ নতুন report page গুলো যোগ হবে যাতে staff role অনুযায়ী access control কাজ করে (accountant সব দেখবে, packer দেখবে না)।

## পুরোনো page গুলোর কী হবে (consolidation map)

| এখনকার page | নতুন জায়গা |
|---|---|
| `/erp/finance/reports` | Reports → Finance tab (redirect) |
| `/erp/finance/brand-profitability` | Reports → Products tab |
| `/erp/finance/product-profitability` | Products tab-এর drill-down |
| `/erp/inventory-reports` | Reports → Inventory tab (redirect) |
| `/erp/imports/reports` | Reports → Supply chain tab |
| `/erp/marketing/daily` | Reports → Marketing tab |
| `/erp/orders/incomplete-reports` | Reports → Orders tab |

কোনো পুরোনো URL মুছব না — সব redirect হবে, যাতে bookmark ভাঙে না।

## Rollout (যাতে একবারে ভেঙে না যায়)

- Phase 1 — timezone fix + canonical SQL layer + Data Health + Overview + Sales tab
- Phase 2 — Orders + Products tab
- Phase 3 — Customers + Inventory tab
- Phase 4 — Marketing + Returns/Courier + Supply chain tab
- Phase 5 — Finance tab migrate to `rpt_pnl_v2`, snapshot table + permissions, পুরোনো page redirect/cleanup

## Verification

প্রতিটা phase-এ live data দিয়ে cross-check, এবং প্রতিটা মিল দেখিয়ে report করব:

- Reports-এর delivered revenue = reconciliation-এর received + pending outstanding
- Reports-এর net profit = brand-profitability page-এর net profit (±৳0)
- Product report-এর units sold = stock movement-এর out quantity
- Sales tab-এর দিনের total = Received breakdown-এর সেই দিনের income
- P&L-এর ad spend = `get_meta_spend_bdt`-এর একই range-এর মোট

না মিললে ship করব না — কোথায় গরমিল সেটা আগে ধরে fix করব।
