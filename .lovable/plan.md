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
| Customer return | `orders` status returned (customer refused/returned after delivery) | count + value | return date |
| Partial return | `orders` partial_return / partial_delivered | returned line qty × price | return date |
| RTO | shipped but never delivered, back to origin | count + value | RTO date |
| Failed delivery | delivery attempt failed, still in courier custody | count | attempt date |
| Cancelled | cancelled before ship | count + value | cancel date |
| Unpaid / payment failed | delivered/paid_return but cash not collected | count + value | delivered |
| Revenue (gross sales) | `rpt_lines` | Σ line_total (delivered) | delivered |
| Net revenue | `rpt_lines` | gross − allocated discount | delivered |
| COGS | `rpt_lines` | unit_cost_snapshot → variant avg → product avg → cost_price | delivered |
| Gross profit | derived | net revenue + shipping income − COGS | delivered |
| Net profit | `rpt_pnl_v2` | gross profit − courier − packaging − return loss − ad spend − opex + other income | delivered |
| Cash received | `erp_transactions` (unique applied payouts) | advance + courier payout − charges | reconciled |
| Inventory valuation | `products`/`product_variants` × avg cost | Σ qty × unit cost | as-of date |
| Ad spend | `get_meta_spend_bdt` + `mkt_manual_expenses` | FX-converted BDT | spend date |
| ROAS | `get_campaign_profit` | delivered revenue ÷ ad spend | delivered |

**Return ≠ RTO ≠ Unpaid ≠ Cancelled** — প্রতিটা আলাদা metric, আলাদা rate (return rate, RTO rate, cancel rate, failure rate); কোথাও একসাথে গুলিয়ে ফেলা যাবে না।

**COGS immutability:** delivered line-এর COGS কখনো current cost দিয়ে retroactively বদলাবে না। `unit_cost_snapshot` থাকলে সেটাই authoritative; fallback chain শুধু snapshot না থাকলে, আর fallback ব্যবহার হলে সেই unit "estimated cost" হিসেবে Data Health-এ count হবে। Delivery-র সময় snapshot না থাকলে trigger দিয়ে সেই মুহূর্তের cost freeze করব, যাতে ভবিষ্যতে January-র order August-এর cost না নেয়।

**rpt_lines is the only transactional reporting source** — কোনো frontend component সরাসরি `orders` / `products` / `stock_movements` থেকে revenue বা profit calculate করবে না (lint rule + code review-তে enforce)।

Implementation: একটাই SQL layer `rpt_lines` + `rpt_pnl_v2` + `get_campaign_profit`; TS-এ `src/lib/erp/reports/canonical.ts` — সব formula ওখানে, কোনো tab-এ inline math নয়। Timezone সর্বত্র `Asia/Dhaka`; প্রতিটা report header-এ date basis লেখা থাকবে ও switch করা যাবে।

### 0.2 Master Report Registry
`src/lib/erp/reports/registry.ts` — ৯০টা report-এর single source of truth, প্রতিটার জন্য:
`id · name · category · tab · anchor · data source · formula ref · date basis · filters · export types · status (Live / Scattered / Planned / Data missing)`
এই registry থেকেই তৈরি হবে **Report Index drawer** (search → সরাসরি tab/panel-এ jump) আর একটা **Coverage page** যেখানে দেখা যাবে কোনটা live, কোনটা data missing। নতুন report registry entry ছাড়া add করা যাবে না।

### 0.2b Financial truth chain — inclusion / exclusion rules (locked)

```text
Orders → Delivered → Gross revenue → − Discount → Net revenue → + Shipping income
→ − COGS → Gross profit → − Courier/Packaging/Return loss → − Ad spend → − Opex → Net profit
```

| Item | Rule |
|---|---|
| Discount | order-level discount line-এ proportionally allocated; coupon ও manual discount দুটোই; কখনো COGS-এ নয় |
| Shipping income | customer-এর দেওয়া delivery charge — revenue-তে আলাদা line, gross sales-এর ভিতরে নয় |
| COD charge | courier-এর COD %; courier cost-এর অংশ, revenue থেকে বাদ নয় |
| Courier charge | reconciled actual charge (estimate নয়); reconcile না হলে estimate + Data Health flag |
| Return charge | return/RTO-র courier fee → return loss-এ, courier cost-এ নয় (double count এড়াতে) |
| Packaging | per-delivered-order rate (settings থেকে); cancelled/RTO-তে ধরা হবে packed হলে |
| Ad spend | Meta actual + manual marketing expense; wallet থেকে টাকা কাটবে না (informational), শুধু P&L-এ |
| Refund | customer-কে ফেরত টাকা → return loss; advance refund হলে wallet থেকে আসল expense |
| Advance payment | revenue নয় — cash; delivery হলেই revenue recognize |
| Partial delivery | delivered line গুলোই revenue + COGS; বাকি line return/RTO bucket-এ |
| Partial return | returned qty-র revenue reversed + COGS reversed (stock ফিরলে), courier both-way loss |

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
প্রতিটা check-এর status: 🟢 MATCHED · 🟡 PENDING (timing gap, যেমন courier payout বাকি) · 🟠 WARNING (tolerance-এর ভিতরে ছোট gap) · 🔴 MISMATCH। প্রতিটা row-তে **Difference → Reason → Affected orders → Drill down**। Reports Hub header-এ একটা overall status chip।

### 0.4 Period Close
নতুন টেবিল `rpt_period_close` (brand × month): `closed_at, closed_by, revenue, cogs, gross_profit, expenses, net_profit, cash, inventory_value, notes`।
- মাস close করলে ওই মাসের snapshot freeze — historical report আর silently বদলাবে না (report closed মাসে snapshot থেকে পড়বে, live থেকে নয়)।
- Closed period-এ backdated posting আটকাবে (DB trigger), correction হবে `erp_recon_adjustments`-এর মতো visible adjustment entry দিয়ে, overwrite নয়।
- Enforcement তিন স্তরে: DB trigger (hard block) + application-level validation (server function) + `admin_audit_log`-এ প্রতিটা closed-period mutation attempt রেকর্ড।
- Closed period-এ পরিবর্তন মানে শুধু: **original entry + adjustment entry + reason + user + timestamp** — কখনো in-place edit নয়।
- UI: Finance tab-এ "Period close" panel — preview → close → reopen (admin only, audit log সহ)।

### 0.5 Report definition versioning
Registry-র প্রতিটা metric-এ `formula_version`, `definition_version`, `effective_from`, `effective_to`। উদাহরণ: `NET_PROFIT_V1` (Jan–Jun 2026), `NET_PROFIT_V2` (Jul 2026 →)। পুরনো period re-run করলে সেই সময়ের version দিয়েই হিসাব হবে, তাই historical number কখনো নিজে থেকে বদলাবে না; report footer-এ কোন version ব্যবহার হয়েছে সেটা লেখা থাকবে।

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
```text
MONTHLY BUSINESS REPORT — August 2026
01 Executive summary (revenue, orders, AOV, gross profit, net profit, ROAS, cash, inventory)
02 Sales            03 Orders          04 Product performance
05 Inventory        06 Purchase & supplier   07 Marketing
08 Courier & delivery    09 P&L        10 Cash flow
11 Balance sheet    12 AR/AP           13 Reconciliation
14 Adjustments      15 Management notes
Period: August 2026 · Status: CLOSED · Closed by: ____ · Closed at: ____
```
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
