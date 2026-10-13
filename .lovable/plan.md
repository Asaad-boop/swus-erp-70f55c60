# BOM, Assembly & Costing System — Implementation Plan

Existing ERP extend করা হবে, নতুন আলাদা stock system না। Components = `products` table-এর row (নতুন `product_kind`), তাই একই `stock_movements` ledger, WAC, local PO, import PO, stocktake সব আগের মতো কাজ করবে।

## Phase 1 — Product types + Components
- `products.product_kind`: `simple` (default, সব পুরনো product) / `bundle` / `assembled` / `component`
- Component fields: purchase unit, unit conversion, lead time days, default supplier, stock location — nullable, পুরনো data অক্ষত
- Inventory page-এ নতুন **Components** tab: SKU, name, variant, supplier, on-hand/reserved/available/incoming, unit cost, value, reorder point, status
- Component-রা storefront/catalog API-তে যাবে না

## Phase 2 — BOM Manager
- নতুন `bom_headers` (product + variant, version, status Draft/Active/Archived, effective date, wastage %) ও `bom_lines` (component, qty, UoM, est. unit cost snapshot)
- প্রতি variant-এ একটাই Active BOM; নতুন version activate করলে আগেরটা Archived (history থাকে)
- Features: add/remove line, clone from another variant, version compare, est. material cost, missing components, max buildable qty, est. margin
- বিদ্যমান combo (`product_combo_items`) = Bundle হিসেবে থাকবে, অর্ডারে আগের মতো explode হবে

## Phase 3 — Assembly Batches
- `assembly_batches` (batch no, product/variant, qty, BOM version, warehouse, planned date, assignee, notes, status Draft → In progress → Completed / Cancelled)
- Pre-check: required vs available, shortage, est. cost, buildable qty
- Complete করলে একটি atomic DB function: components `stock_movements` (source `assembly`) দিয়ে কাটবে, finished goods যোগ হবে actual cost-এ (WAC update), batch-এ total cost / unit cost / variance save
- Order fulfillment-এ assembled product শুধু finished stock কাটবে — component আবার কাটবে না

## Phase 4 — Procurement Upgrade (২য় brief)
বিদ্যমান Local PO, Import PO, cargo ledger, carton release, supplier, finance-ই extend হবে — নতুন আলাদা system না।
- **Local Manufacturing PO**: line-এ আলাদা qty — Ordered (original, কখনো overwrite না), Revised/Confirmed, Dispatched, Received, QC Accepted, Damaged, Missing, Rejected, Pending। Revised qty × same unit price = auto revised invoice; revision audit history; একই PO-তে multiple delivery
- **Advance & installments**: PO payment summary — estimated bill, advance %, paid, actual invoice, due; advance actual invoice-এর বিরুদ্ধে apply; supplier ledger-এ যায়
- **China import**: বিদ্যমান Import PO + cargo agent; এক agent multiple supplier; partial release-এ double release block, release-wise freight (আগের logic) রাখা
- **QC step** (local receipt + carton release দুটোতেই): Accept → stock, Damaged/Rejected/Missing → stock-এ না, supplier claim/return note
- **True landed cost**: product price + freight + duty + local courier + other; allocation method (qty / value / weight / CBM); শুধু QC accepted unit-এ cost বসে → WAC update; PO close হলে final cost recalc
- **Statuses**: PO, Manufacturing, Cargo, QC, Payment, Landed cost — আলাদা badge
- **Supplier & cargo agent ledger**: purchase, advance, payment, return/claim, outstanding
- Component-ও এই PO-তে কেনা যাবে (একই products table)
- Supplier scorecard: latest price, lead time, rejection rate, outstanding

## Phase 5 — Pricing & Profit
- Product-এ standard cost (active BOM) vs actual historical cost (WAC) পাশাপাশি
- **Pricing Simulator**: price, cost, ad cost, fulfillment, return provision, target profit → profit/order, margin, break-even price, max CAC, target price
- Profit reports canonical RPC-ই ব্যবহার করবে (memory rule)

## Phase 6 — Availability & Replenishment
- Finished on-hand, reserved, available, buildable, component shortage, incoming
- Reorder suggestion: avg daily consumption × lead time + safety stock − (available + open PO)

## Order / Return rules (বিদ্যমান logic মেনে)
- Reserve packing-stage-এ (বর্তমান rule), cancel-এ release, shipped/delivered-এ on-hand কমে
- Returned kit: inspection step — "Sellable" / "Damaged" / "Incomplete"; শুধু Sellable stock-এ ফেরে

## Technical notes
- সব নতুন table: brand_id, RLS via `can_access_brand` + staff roles, explicit GRANTs, updated_at trigger
- কোনো demo data DB-তে না; sample costs (Gift Box) শুধু UI placeholder
- Movement source `assembly` যোগ; `MOVEMENT_SOURCES` update
- Server logic: Postgres RPC + `createServerFn`, কোনো Edge Function না

## Order of delivery
Phase 1+2 প্রথম ধাপে, তারপর 3, তারপর 4–6। প্রতি ধাপ শেষে তুমি check করবে।
