# ERP UI/UX Massive Upgrade — 5 Phases

সব phase একই design language ("Aurora Ops") মেনে চলবে: এক surface system (panel/glass token), এক header pattern, এক table/row rhythm, এক badge ও status color scale, motion register (subtle 120–180ms), keyboard-first flow।

## Phase 1 — Orders Core (এখনই শুরু)
Scope: Order List, Create Order, Pre-order, Waybill/Label print।

- **Order List** — নতুন command-center header (brand + tab + live counts), sticky toolbar, filter chips, sticky table header, compact/comfortable density, row hover actions, courier + payment status pill system, skeleton loading, empty states, mobile card view, floating selection bar polish.
- **Create Order (/erp/orders/new)** — 3-step guided layout (Customer → Items → Delivery & Payment) with sticky live summary rail, inline validation, variant/SKU picker polish, duplicate-phone warning, keyboard submit.
- **Pre-order** — pipeline board polish: stage columns with counts, advance progress bar per card, due/ETA chip, quick-convert action.
- **Waybill / Label print** — নতুন print sheet design (A4 + 4-up label), clean barcode/consignment block, brand logo, COD amount emphasis, print preview dialog redesign, print-safe CSS (no color loss)।

Deliverable শেষে: 4টা স্ক্রিন একসাথে দেখতে এক family, bug-free, fast।

## Phase 2 — Order Detail + Courier & Reconciliation
Order detail Aurora refresh, timeline, courier sync panel, invoice reconciliation UI, exception handling views.

## Phase 3 — Inventory, Products, Supply Chain
Product catalog, inventory KPIs, PO create/edit/receive, releases — same table & panel system.

## Phase 4 — Finance, Marketing, Growth Studio
Wallets, P&L, reconciliation reports, marketing dashboards, monthly projection ও manual planner visual unification.

## Phase 5 — Shell, Dashboards, HRM + polish pass
Sidebar/topbar, role dashboards, HR module, dark mode audit, accessibility, responsive, motion pass, performance।

## Technical notes
- Design tokens `src/styles.css`-এ extend করা হবে (panel/status/elevation scale); component-এ hardcoded color নয়।
- নতুন shared primitives: `PageHeader`, `StatPill`, `DataPanel`, `StatusDot` — `src/components/erp/ui/`-তে, যাতে পরের phase-গুলো দ্রুত হয়।
- Order list-এর business logic (filters, queries, bulk actions) অপরিবর্তিত থাকবে — শুধু presentation layer।
- "Waybill" ধরে নিচ্ছি courier label/consignment print (বর্তমান bulk print + invoice)। আলাদা কিছু হলে বলো।
