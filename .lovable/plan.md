# Reports Hub → Business Intelligence + Accounting Control System

**Core principle (locked):** একটা number = একটা source = একটা formula.
কোনো page, tab বা export নিজের মতো করে calculation করতে পারবে না — সব canonical layer থেকে আসবে।

## Phase 0 — Reporting Foundation (আগে এটা, নাহলে বাকি সব unreliable)

### 0.1 Canonical definition dictionary
প্রতিটা core metric-এর একটাই definition, একটাই source:

| Metric | Canonical source | Formula | Date basis |
|---|---|---|---|
| Orders | `orders` | count | created (Dhaka) |
| Delivered orders | `orders` status ∈ delivered/partial | count | delivered |
| Returns | `orders` returned/unpaid/partial return | count + value | delivered/return date |
| Revenue (gross sales) | `rpt_lines` | Σ line_total (delivered) | delivered |
| Net revenue | `rpt_lines` | gross − allocated discount | delivered |
| COGS | `rpt_lines` | unit_cost_snapshot → variant avg → product avg → cost_price | delivered |
| Gross profit | derived | net revenue + shipping income − COGS | delivered |
| Net profit | `rpt_pnl_v2` | gross profit − courier − packaging − return loss − ad spend − opex + other income | delivered |
| Cash received | `erp_transactions` (unique applied payouts) | advance + courier payout − charges | reconciled |
| Inventory valuation | `products`/`product_variants` × avg cost | Σ qty × unit cost | as-of date |
| Ad spend | `get_meta_spend_bdt` + `mkt_manual_expenses` | FX-converted BDT | spend date |
| ROAS | `get_campaign_profit` | delivered revenue ÷ ad spend | delivered |

Implementation: একটাই SQL layer `rpt_lines` + `rpt_pnl_v2` + `get_campaign_profit`; TS-এ `src/lib/erp/reports/canonical.ts` — সব formula ওখানে, কোনো tab-এ inline math নয়। Timezone সর্বত্র `Asia/Dhaka`; প্রতিটা report header-এ date basis লেখা থাকবে ও switch করা যাবে।

### 0.2 Master Report Registry
`src/lib/erp/reports/registry.ts` — ৯০টা report-এর single source of truth, প্রতিটার জন্য:
`id · name · category · tab · anchor · data source · formula ref · date basis · filters · export types · status (Live / Scattered / Planned / Data missing)`
এই registry থেকেই তৈরি হবে **Report Index drawer** (search → সরাসরি tab/panel-এ jump) আর একটা **Coverage page** যেখানে দেখা যাবে কোনটা live, কোনটা data missing। নতুন report registry entry ছাড়া add করা যাবে না।

### 0.3 Reconciliation rules engine
Sales → Orders → Delivery → Returns → Revenue → COGS → Gross profit → Expenses → Net profit → Cash — এই chain-এর প্রতিটা ধাপের gap system নিজে explain করবে।
নতুন RPC `rpt_reconcile_chain` একটা waterfall দেবে:
```text
Placed value        10,00,000
 − Cancelled          -60,000
 − Undelivered/RTO    -80,000  → Delivered value 8,60,000
 − Discount           -20,000
 + Delivery income    +40,000  → Net revenue 8,80,000
 vs Finance revenue    8,80,000   ✓ matched
 vs Cash received      8,10,000   (৳70,000 pending payout)
```
কোথাও mismatch থাকলে লাল badge + drill-down order list। Reports Hub-এর উপরে একটা **Reconciliation status** chip — সব মিললে সবুজ।

### 0.4 Period Close
নতুন টেবিল `rpt_period_close` (brand × month): `closed_at, closed_by, revenue, cogs, gross_profit, expenses, net_profit, cash, inventory_value, notes`।
- মাস close করলে ওই মাসের snapshot freeze — historical report আর silently বদলাবে না (report closed মাসে snapshot থেকে পড়বে, live থেকে নয়)।
- Closed period-এ backdated posting আটকাবে (DB trigger), correction হবে `erp_recon_adjustments`-এর মতো visible adjustment entry দিয়ে, overwrite নয়।
- UI: Finance tab-এ "Period close" panel — preview → close → reopen (admin only, audit log সহ)।

## Phase 1 — Sales
Day/Week/Month grain toggle, category-wise dimension (`rpt_sales_breakdown`-এ category যোগ), channel/courier/city/payment breakdown, Report Index drawer live।

## Phase 2 — Inventory + Supply
Stock adjustment report (`stock_movements` থেকে), aging, dead/slow moving, stocktake variance; purchase return, supplier performance (on-time %, defect qty), landed cost, cargo ledger।

## Phase 3 — Finance + Reconciliation
Daily cash report (wallet-wise in/out), bank/MFS report, AR/AP, expense/revenue/COGS/gross/net panels — সব `rpt_pnl_v2` থেকে; `rpt_reconcile_chain` UI; period close চালু।

## Phase 4 — Marketing + Delivery + Fulfillment
CPA আলাদা, creative-level performance, manual channel spend (Google/TikTok — API নেই, manual entry থেকে ROAS), delivery time (ship→delivered avg, courier/city wise), failed delivery, packaging ও fulfillment (packed/day, packer-wise, pack→ship lag)।

## Phase 5 — Executive / CEO
KPI scorecard, MoM/YoY growth, **Target vs Actual** (নতুন টেবিল `rpt_targets`: brand × month × metric × target), run-rate forecast, yearly business report — সবই closed-period numbers-এর উপরে, তাই CEO view আর accounting একই সংখ্যা দেখাবে।

## Phase 6 — Monthly Business Report (print/archive)
এক ক্লিকে **"Monthly Business Report — August 2026"** PDF, section গুলো:
Executive summary · Sales · Orders · Product performance · Inventory · Purchase · Marketing · Courier · P&L · Cash flow · Balance sheet · AR/AP · Reconciliation · Major adjustments · Management notes।
Closed-period snapshot থেকে generate হবে (তাই যতবার print করো একই number), cover page + brand + period + "closed by/at" stamp সহ, Bengali font ready — physical file-এ রাখার মতো official record। Archive list-এ পুরনো মাসের PDF আবার download করা যাবে।

## যেগুলো এখন সম্ভব না
- **Google/TikTok Ads API** — integration নেই; manual spend দিয়ে report হবে, auto-sync পরে।
- **Team & HR (attendance, salary, task, productivity)** — কোনো HR table নেই; আলাদা HR module লাগবে, এই plan-এর বাইরে।
- **Customer complaint report** — complaint/ticket table নেই; আপাতত CRM activity tag-ভিত্তিক basic view।

## Verification (প্রতি phase-এ, না মিললে ship নয়)
- Sales delivered value = Finance total revenue (±৳0)
- Finance net profit = brand-profitability net profit
- Cash received = reconciliation received + outstanding
- Product units sold = stock movement out qty
- P&L ad spend = `get_meta_spend_bdt` same-range total
- Closed month re-run = আগের snapshot-এর সাথে byte-identical
