# Campaign Profit Truth — Cash-Based Campaign Profitability

লক্ষ্য: campaign থেকে **আসলে কত টাকা হাতে এসেছে** আর তার বিপরীতে কত খরচ হয়েছে — order value নয়, cash। Projection আলাদা, realized আলাদা।

## ১. Realized vs Projected — কখনোই মেশানো হবে না

**Realized (actual, cash-based)** — delivered + returned order থেকে:

```
Realized Net Profit =
  Actual Collected Revenue
− Canonical COGS            (get_campaign_profit)
− Canonical Operating Cost  (get_campaign_profit)
− Actual Return/RTO Charges
− Campaign Ad Spend
```

**Projected (pipeline, আলাদা panel-এ "Expected" লেবেলে)** — confirmed/in-transit order থেকে: Confirmed Value, Expected COGS, Expected Courier/Packaging, Expected Pipeline Profit।

নতুন কোনো manual COGS/operating-cost calculation লেখা হবে না — canonical `get_campaign_profit` / `mkt_delivered_line_costs`-ই একমাত্র উৎস।

## ২. Collected Amount = আসল টাকা

আলাদা তিনটা number:
- **Order Value** — original invoice value
- **Expected Collectible** — delivered অংশের প্রাপ্য (COD due + advance)
- **Collected Amount** — courier settlement/reconciliation থেকে actual received + advance/online payment
- **Collection Variance** = Expected Collectible − Collected (partial delivery-তে গুরুত্বপূর্ণ)

Settlement এখনো আসেনি → **"Pending Reconciliation"** দেখাবে, ৳0 নয়।

## ৩. Return / RTO

- Return charge: `erp_courier_settlement_lines`-এর actual charge; না থাকলে `erp_courier_settings` default rate (fallback হিসেবে ট্যাগ করা)।
- COGS নিয়ম:
  - Return + resellable (stock ফেরত এসেছে) → COGS reverse হবে
  - Return + damaged/lost → COGS reverse হবে না
  - Partial return → শুধু ফেরত আসা resellable item-এর COGS reverse, delivered item-এর COGS থাকবে
- Return/RTO courier charge সবসময়ই real campaign loss।
- COGS reversal আর return charge কখনো double-count হবে না (একটাই pass-এ হিসাব)।

## ৪. Attribution priority — এক order, এক campaign

প্রথমে প্রতিটা order-এর সব সম্ভাব্য attribution **candidate** বের হবে, প্রতিটার সাথে explicit `priority` rank:

| priority | source |
|---|---|
| 1 | Manual campaign override |
| 2 | Explicit linked campaign (`mkt_order_attributions`) |
| 3 | `fb_campaign_id` |
| 4 | UTM campaign id |
| 5 | UTM campaign name |
| 6 | Click / pixel attribution |
| 7 | Product-based inference |
| 8 | Unattributed |

তারপর order-প্রতি ঠিক একটা primary campaign বাছা হবে **deterministic ordering** দিয়ে:

```
ORDER BY priority ASC, confidence DESC, attributed_at DESC, campaign_id ASC
```

- বিনা explicit ORDER BY-তে `DISTINCT ON (order_id)` ব্যবহার হবে না — ranked CTE (`ROW_NUMBER()`) দিয়ে stable, reproducible primary বাছা হবে।
- Manual override কখনোই auto attribution দিয়ে overwrite হবে না (auto-matcher manual row skip করবে)।
- বিদ্যমান `linked_cid → utm_cid` fallback অক্ষত থাকবে, শুধু এই ladder-এর ভিতরে priority 2 ও 4/5 হিসেবে বসবে।
- এক order-এর revenue/COGS/profit একাধিক campaign-এ যোগ হতে পারবে না — aggregation শুধু primary attribution-এর উপর।
- প্রতিটা row-এ attribution source + confidence দেখাবে।


## ৫. Auto Product Attribution

- বিদ্যমান `mkt_campaign_products` manual linking UI থাকবে, badge **✋ Manual**।
- Campaign-এ product assign না থাকলে: attributed order গুলার `order_items` বিশ্লেষণ করে top product suggest হবে — **🤖 Auto Suggested** badge সহ, columns: Product · Orders · Revenue Share · Confidence।
- Suggestion নিজে থেকে permanent হবে না; action: **Confirm** / **Replace** / **Unlink**।
- Product weight শুধু planning/allocation view-এর জন্য — actual revenue/COGS/profit কখনোই weight দিয়ে হিসাব হবে না, সেটা order_items + canonical থেকেই আসবে।

## ৬. Profit Status (explicit rules)

- 🟢 **Profitable** — Realized Net Profit > 0 এবং coverage যথেষ্ট
- 🟡 **Break-even** — |Realized Net| ≤ configurable margin (default max(৳200, spend×5%))
- 🔴 **Losing** — Realized Net Profit < 0 এবং coverage যথেষ্ট
- 🔵 **Too Early** — delivered/settlement data অপর্যাপ্ত

Confirmed order-এর positive projection দিয়ে কখনো Profitable বলা হবে না।

## ৭. Truth Coverage (data completeness)

Header-এ **Truth Coverage: 94%**, breakdown সহ:
- Attribution Coverage — কত % order-এর primary campaign জানা
- Settlement Coverage — কত % delivered order settlement-এ এসেছে
- COGS Coverage — `cost_missing_units` থেকে
- Courier Cost Coverage — actual vs fallback rate

Coverage কম হলে verdict → Too Early, আর missing value গুলা **Pending / Incomplete** দেখাবে, ০ নয়।

## ৮. Cancelled / Fake

"Lost money" বলা হবে না। দেখাবে: Cancelled Orders · **Unrealized Booked Value** · Acquisition/Ad Cost Consumed।
উদাহরণ: Booked ৳25,000 · Collected ৳0 · Unrealized ৳25,000 (cash loss নয়)।

## ৯. Ad Spend

Campaign level-এ actual spend একবারই বাদ যাবে। Order drill-down-এ চাইলে **Allocated Ad Cost** দেখাবে — informational only, campaign total-এ যোগ হবে না।

## ১০. UI (flat, shadowless, Midnight Indigo)

Main table: `Campaign | Spend | Orders Funnel | Collected | Realized Profit | Status`

Row drawer:
Lifecycle Funnel · Profit Ladder (realized) · Realized vs Projected · Collection Reconciliation · Return/RTO impact · Linked Products (Manual/Auto) · Attribution source + confidence · Order drill-through · Trend · Truth Coverage · existing Notes & Tags।

যেখানে সত্যিই data নেই সেই section hide হবে; fake zero দেখানো হবে না।

## ১১. Technical

**RPC `mkt_campaign_truth` extend** (replace + `GRANT EXECUTE ... TO authenticated`):
`booked_order_count, cancelled_count, confirmed_count, delivered_count, returned_count, booked_value, cancelled_value, confirmed_value, expected_collectible, collected_amount, collection_variance, return_charge, return_charge_is_estimate, attribution_source, match_status, attribution_coverage, settlement_coverage, courier_cost_coverage`

- COGS/operating cost canonical `get_campaign_profit`-এই থাকবে; RPC duplicate করবে না।
- Collected: courier settlement lines + reconciliation + order advance/online payment।
- নতুন server fn (দুটোই `requireSupabaseAuth`): `getCampaignOrders` (drill-through, per-order stage/collected/return charge/allocated ad cost), `autoLinkCampaignProducts` (suggest + confirm/replace)।
- Implementation-এর আগে existing schema/functions/triggers inspect করে reuse করা হবে, duplicate financial logic লেখা হবে না।

**Verification scenarios:** cancelled · confirmed · full delivery · partial delivery · full RTO · partial return · returned+resellable · returned+damaged · missing settlement · manual attribution overriding UTM · auto product suggestion · একই order একাধিক campaign-এ match হওয়ার সম্ভাবনা।
