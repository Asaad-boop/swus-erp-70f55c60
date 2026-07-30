# Order Dashboard (Advanced)

একটা নতুন full-power Order Dashboard বানাবো `/erp/orders/dashboard`-এ। বর্তমান `/erp/orders/list` থাকবে (দ্রুত daily operation-এর জন্য), আর এই নতুনটা হবে "সব ডেটা এক জায়গায়" analytical + drill-down dashboard।

## 1. কী কী দেখা যাবে

**উপরে KPI স্ট্রিপ** (selected filter অনুযায়ী live):
- Total orders, Total value, Delivered value, Advance collected, COD outstanding
- Confirmed / Packed / Shipped / In transit / Delivered / Returned (paid+unpaid) / Cancelled / Fake / Pre-order
- Delivery rate %, Return rate %, Avg order value, Avg confirm→delivery time

**চার্ট সারি:**
- Daily orders + revenue (stacked bar/line)
- Status funnel (New → Confirmed → Shipped → Delivered)
- Source breakdown (website / facebook / manual / phone / shopify)
- Top brands, top products, top districts/zones

**মূল টেবিল** — প্রতিটা order-এ column toggle করে দেখা যাবে:
Invoice no, Order ID, Date, Customer + phone, Brand, Items (variant/color/SKU সহ), Qty, Subtotal, Discount, Delivery charge, Advance, COD due, Payment status, Order status, Courier + consignment + live courier status, Tags, Source/UTM/campaign, **Confirmed by (কে confirm করলো) + কখন**, Packed by, Last updated by, Note count, Settlement/reconciliation status, Profit (delivered হলে)।

**Row expand** করলে: full status timeline (কে, কখন, কোন status), order notes, SMS log, payments/advance details, courier tracking history, stock movement — সব একসাথে।

## 2. Filter ও Tag

- Date range (advanced picker — presets + typeable + 2-month range, প্রজেক্ট standard অনুযায়ী)
- Brand (multi), Status (multi-select, group সহ), Payment status, Source, Courier, City/Zone
- Confirmed-by user, Assigned staff
- Tag chips (existing `order-tags` system) — multi include/exclude
- Amount range, Advance আছে/নাই, COD outstanding আছে/নাই
- Search: invoice / phone / name / consignment / product name / SKU
- Saved views (filter combo save করে নাম দিয়ে রাখা), URL search-params এ সব filter → link share করা যাবে
- Sort: যেকোনো column, asc/desc
- Export: বর্তমান filter অনুযায়ী CSV + PDF summary

## 3. Backend / API

নতুন ফাইল `src/lib/erp/orders-dashboard.functions.ts` — server functions (RLS + brand scope মেনে):
- `getOrderDashboardSummary` — KPI + chart series, একটা Postgres RPC `erp_order_dashboard_summary(filters)` দিয়ে single round-trip
- `listOrderDashboardRows` — paginated (server-side sort/filter, 50/100/200 per page) rich row, items + variant + courier + confirmed_by join সহ
- `getOrderDashboardDetail` — এক order-এর timeline + notes + SMS + payments + tracking
- `exportOrderDashboard` — filter অনুযায়ী পুরো dataset CSV

DB সাইডে: filter-heavy কলামে index (`orders(brand_id, status, created_at)`, `orders(confirmed_by)`, phone/invoice trigram) যোগ করা হবে যাতে বড় ডেটাতেও দ্রুত থাকে। "কে confirm করলো" এর জন্য `order_status_history` + `orders.confirmed_by` থেকে resolve করে profile name দেখাবো।

## 4. UI structure

```text
/erp/orders/dashboard
 ├─ Filter bar (sticky, chip আকারে active filters + Reset)
 ├─ KPI strip (clickable → filter apply)
 ├─ Charts (collapsible)
 └─ Data table (virtualized, column chooser, row expand, bulk actions)
```

Bulk actions টেবিল থেকেই: status change, print invoice/label, courier book, SMS পাঠানো, tag add/remove, export selected।

## 5. কাজের ধাপ

1. DB: dashboard summary RPC + index migration
2. `orders-dashboard.functions.ts` (4টা server fn) + Zod filter schema (URL search-params-এর সাথে shared)
3. Route `erp.orders.dashboard.tsx` + search-param validation
4. Components: `dashboard-filter-bar`, `dashboard-kpis`, `dashboard-charts`, `dashboard-table` (column chooser + expand), `order-timeline-panel`
5. Saved views (localStorage প্রথমে; চাইলে পরে DB-তে)
6. CSV/PDF export
7. ERP sidebar-এ "Order Dashboard" মেনু যোগ

## টেকনিক্যাল নোট

- সব read server function দিয়ে, `useQuery` + keepPreviousData; brand scope `applyBrandScope` মেনে
- Filter state URL-এ (`validateSearch` + `fallback`), তাই refresh/share-এ view অক্ষত
- বড় টেবিল virtualize করা হবে, ডেটা না থাকলে card/section hide
- বিদ্যমান `orders.ts` status/badge/tag constants reuse হবে, নতুন করে duplicate হবে না
