# Reports coverage — ৯০টা report-এর full audit + gap fill

তোমার list-টা আমাদের existing Reports Hub (`/erp/reports`, 10 tab) + Finance/Inventory/Imports pages-এর সাথে মিলিয়ে দেখলাম। বেশিরভাগ already আছে; কিছু আছে কিন্তু আলাদা page-এ, আর কিছু data-ই নেই বলে বানানো যাবে না।

## ✅ যেগুলো এখনই আছে (৬০+)
- **Sales & Order** — daily/weekly/monthly sales, product-wise, channel-wise, courier-wise, order status funnel, cancelled/returned/delivered, COD collection (Finance tab + reconciliation)।
- **Inventory** — current stock, valuation, low stock, out-of-stock, dead stock, slow-moving, best-selling, SKU performance, product profitability, stock movement, stocktake।
- **Purchase** — import PO, supplier-wise, purchase cost, payable, cargo/shipment (Supply tab + `/erp/imports/reports`)।
- **Finance** — P&L (canonical), balance sheet, cash flow, trial balance, GL, revenue, COGS, gross/net profit, expense, AR/AP, wallet (bKash/Nagad/MFS), budget vs actual।
- **Marketing** — Meta ads, campaign/adset/ad, ROAS, CAC, spend, UTM/source, attribution revenue।
- **Customer** — database, new vs repeat, retention/cohort, LTV, order history, RFM।
- **Delivery** — courier performance, delivery success rate, RTO/return, failed delivery।

## ⚠️ আছে কিন্তু scattered / দুর্বল — এই plan-এ ঠিক করব
1. **Category-wise sales** — নেই (product-wise আছে)। `rpt_sales_breakdown`-এ `category` dimension যোগ করব।
2. **Weekly / Monthly roll-up** — এখন শুধু daily timeseries। Sales tab-এ Day/Week/Month toggle।
3. **Stock adjustment report** — `stock_movements`-এ data আছে, report নেই। Inventory tab-এ adjustment-only view।
4. **Purchase return + supplier performance** — supplier-wise on-time %, defect/return qty। Supply tab-এ যোগ।
5. **Daily cash report / bank report** — wallet-wise দিন-ভিত্তিক in/out। Finance tab-এ "Daily cash" panel।
6. **Delivery time report** — ship → delivered avg days, courier ও city wise। Returns/Courier tab-এ।
7. **Packaging & fulfillment report** — packed/day, packer-wise count, pack→ship lag। Orders tab-এ।
8. **CPA report** — CAC আছে, per-purchase CPA আলাদা করে দেখাব Marketing tab-এ।
9. **Creative performance** — ad-level আছে, creative thumbnail/name grouping যোগ করব।
10. **Target vs Actual + Forecast + Yearly + Monthly Business Review** — নতুন **Executive tab** (CEO view): KPI scorecard, MoM/YoY growth, target vs actual (target set করা যাবে), simple forecast (trailing average + run-rate), yearly summary।

## ❌ যেগুলো এখন বানানো সম্ভব না (data source নেই)
- **Google Ads / TikTok Ads report** — শুধু Meta integrated। চাইলে manual spend entry দিয়ে ওদের spend + ROAS দেখানো যাবে (`mkt_manual_expenses` already আছে) — সেটাই করব, API integration আলাদা কাজ।
- **Team & Management (attendance, salary, task, productivity, department)** — HR module-ই নেই (কোনো employee/attendance/payroll table নেই)। এটা আলাদা HR module, এই plan-এর বাইরে।
- **Customer complaint report** — complaint/ticket table নেই। CRM activity থেকে "complaint" tag-ভিত্তিক একটা basic view দেওয়া যাবে।

## কীভাবে করব (technical)
- নতুন/আপডেটেড RPC: `rpt_sales_breakdown` (category dimension), `rpt_sales_timeseries` (grain: day/week/month), `rpt_stock_adjustments`, `rpt_supplier_performance`, `rpt_daily_cash`, `rpt_delivery_time`, `rpt_fulfillment`, `rpt_exec_scorecard` — সবগুলো brand-scoped, `Asia/Dhaka` date, security definer, existing `rpt_lines` canonical source থেকেই।
- Target vs Actual-এর জন্য ছোট টেবিল `rpt_targets` (brand × month × metric × target_value) + RLS + grants, Executive tab থেকে edit করা যাবে।
- নতুন tab: **Executive** (CEO), আর existing tab-গুলোতে উপরের panel-গুলো যোগ — সব `report-kit` (Panel/KpiStrip/ExportMenu) reuse করে, প্রতিটাতে CSV/Excel/PDF export।
- একটা **Report Index** drawer: ৯০টা report নাম দিয়ে search → সরাসরি সেই tab/panel-এ jump, যাতে "কোথায় কোন report" খুঁজতে না হয়।

## Rollout
- Phase 1 — Sales grain toggle + category dimension + Report Index drawer
- Phase 2 — Inventory adjustments, Supply (purchase return + supplier performance)
- Phase 3 — Finance daily cash/bank, Marketing CPA + creative + manual-channel (Google/TikTok) spend
- Phase 4 — Delivery time, packaging/fulfillment
- Phase 5 — Executive tab (KPI scorecard, target vs actual, forecast, yearly, MBR export)

প্রতি phase-এ live data দিয়ে cross-check করব (Sales total = Finance revenue = reconciliation received), না মিললে ship করব না।
