# Order List Compact Control Center

## Goal
Order list-এর উপরের অংশ কম crowded, দ্রুত scan করা যায়, এবং status বদল/কাজের ownership এক নজরে বোঝা যায়—এভাবে polish করা।

## What will change

### 1. Compact status flow
- Pending → Packing → Packed → Ready to Ship → Shipped-এর primary flow ছোট, connected segmented bar হিসেবে দেখাব।
- প্রতিটি status-এর count label-এর চেয়ে বেশি prominent থাকবে।
- Active status-এ clear color, underline/indicator এবং soft transition থাকবে; click করলে existing filtering-ই চলবে।
- Delivered, Return, Cancelled, Incomplete, All ইত্যাদি secondary status একই strip-এর compact continuation থাকবে; horizontal scroll ও arrow navigation থাকবে, কিন্তু oversized card থাকবে না।
- Status count update হলে number smooth pulse/fade করবে এবং layout shift হবে না।

### 2. Daily KPI strip
Order list-এর উপরে compact KPI summary থাকবে:
- Today’s orders
- Total pieces
- Unique customers
- Repeat customers
- Top moving product(s), piece countসহ

Current brand/all-brand scope মেনে আজকের Dhaka-date data দেখাবে। Data না থাকলে misleading zero-heavy product section দেখানো হবে না। KPI realtime order refresh-এর সাথে update হবে।

### 3. Staff attribution in rows
- প্রতিটি order row-তে available data অনুযায়ী `Confirmed by <name>` দেখাবে।
- Confirmed user না থাকলে manual order-এর ক্ষেত্রে `Created by <name>` fallback থাকবে।
- Website/system order-এ staff name না থাকলে ভুল user name দেখাবে না।
- Existing staff profile lookup reuse করে আলাদা per-row request এড়ানো হবে।

### 4. Row and interaction polish
- Order identity block-এর মধ্যে attribution ছোট, readable secondary line হিসেবে থাকবে—নতুন wide column যোগ করে table crowded করা হবে না।
- Status switch-এর loading/active feedback smooth থাকবে এবং existing realtime/count refresh behavior অক্ষত থাকবে।
- Desktop এবং narrow viewport-এ status strip, KPI, toolbar, table overlap বা awkward wrapping ছাড়াই verify করা হবে।

## Technical details
- Existing order list query-তে `confirmed_by` include করে `OrderRow` type update করা হবে।
- Staff names existing `list_staff_profiles` data থেকে একবার map করে table-এ pass করা হবে।
- Daily KPI-এর জন্য brand-scoped authenticated aggregate যোগ করা হবে; Dhaka day boundary, normalized customer phone, repeat-history, এবং grouped order items ব্যবহার করবে।
- New KPI query shared `orders` refresh lifecycle-এর সাথে যুক্ত থাকবে, যাতে create/status update-এর পর stale না থাকে।
- Existing `OrdersStatusTabs` presentation compact করা হবে; order status business logic বা stock reservation rules বদলানো হবে না।

## Verification
- Type validation pass করানো হবে।
- Order list desktop ও mobile-width screenshots দেখে spacing, scrolling, count prominence, KPI visibility, and row attribution check করা হবে।
- Pending/Packing/Packed tab clicks filtering বজায় রাখে এবং transitions-এ layout jump হয় না—এটা verify করা হবে।
