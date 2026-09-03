# Campaign Profit Truth — Order Lifecycle Profit View

প্রতিটা campaign-এর জন্য: কোন order গুলা এই campaign থেকে এসেছে (UTM / fb_campaign_id / pixel attribution), সেগুলা এখন কোন stage-এ (cancel / confirm / delivered / return), আর প্রতিটা stage-এ টাকার হিসাব কী — এক জায়গায়।

## ১. Lifecycle-wise profit ladder

প্রতিটা campaign row এখন ৪টা স্তরে ভাঙা হবে:

| Stage | কী দেখাবে |
|---|---|
| Booked (সব order) | original order value, order count |
| Cancelled / Fake | কত taka হারালো (lost value), শুধু ad spend খরচ |
| Confirmed (in-pipeline) | confirmed value, expected COGS, expected profit (projection) |
| Delivered | collected amount = আসলে হাতে আসা টাকা (COD collected + advance), − COGS − courier − packaging |
| Returned | return/RTO charge minus হবে (courier return fee + যাওয়া-আসার খরচ) |

শেষে: **Net profit = Delivered collected − COGS − operating − return charges − ad spend**, আর একটা status badge (Profitable / Break-even / Losing / Too early).

## ২. Collected amount (নতুন — এখন নেই)

এখন delivered_revenue = order total ধরা হয়। এটা বদলে দুটো আলাদা number দেখাবে:
- **Order value** (original invoice value)
- **Collected** — courier settlement/reconciliation থেকে আসা আসল received amount (partial delivery হলে কম), advance/bKash paid অংশ সহ।

Partial delivered order-এ collected < order value হবে — সেই gap আলাদা করে দেখাবে।

## ৩. Return charge

Returned / paid_return / partial_return order-এ courier return fee এবং delivery attempt cost campaign-এর খরচে যোগ হবে (reconciliation-এর actual charge, না পেলে courier setting-এর default rate)। Return হওয়া order-এর COGS stock-এ ফেরত গেলে সেটা cost থেকে বাদ যাবে — শুধু charge টা loss।

## ৪. Product attribution (auto + manual)

- **Manual**: campaign-এ product assign/link করার UI (already `mkt_campaign_products` আছে) — drawer-এ product picker, search, weight, unlink।
- **Auto**: product assign করা না থাকলে system নিজে বের করবে — ওই campaign থেকে আসা order গুলার order_items থেকে top product গুলো (revenue share অনুযায়ী) auto-suggest/auto-link হবে, "auto" tag সহ।
- Auto-linked গুলা আলাদা badge-এ দেখাবে যাতে বোঝা যায় কোনটা আমি দিয়েছি আর কোনটা system ধরেছে; এক ক্লিকে confirm বা replace করা যাবে।

## ৫. View / UI

`/erp/marketing/truth` পেজ redesign:
- **Table**: Campaign · Spend · Orders (booked→confirmed→delivered→returned funnel চিপ) · Collected · Net profit · Status. Flat, shadowless, Midnight Indigo tokens — ছোট color accent দিয়ে verdict।
- **Row expand / drawer**: profit ladder (stage-by-stage bridge), lifecycle funnel bar, linked products (auto/manual), order list drill-through, trend chart, notes/tags (existing)।
- Filters: brand, date range (advanced picker), verdict, match status, "only campaigns with unassigned products"।
- ডেটা না থাকলে card/section hide হবে, ভুয়া 0 দেখাবে না।

## Technical notes

- `mkt_campaign_truth` RPC extend করা হবে: `collected_amount`, `cancelled_value`, `confirmed_value`, `return_charge`, `partial_gap`, per-stage counts — order-level, attribution dedup সহ (linked_cid → utm_cid fallback অপরিবর্তিত)।
- COGS/operating আগের মতোই canonical `get_campaign_profit` থেকেই আসবে (memory rule অনুযায়ী), হাতে কোনো cost calc হবে না।
- Return charge courier settlement rows (`erp_courier_settlement_lines`) থেকে, না পেলে `erp_courier_settings` default।
- নতুন server fn: `getCampaignOrders` (drill-through), `autoLinkCampaignProducts` (order_items থেকে inference), দুটোই `requireSupabaseAuth`।
- Migration-এ RPC replace + GRANT EXECUTE TO authenticated।
