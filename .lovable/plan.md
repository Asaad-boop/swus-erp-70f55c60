# Picking List — Complete Redesign (Page + Workflow)

## Goal
Picking List এখন শুধু Batch Print dialog-এর ভেতরে একটা static print sheet। এটাকে একটা **full workflow** বানানো: Pick list তৈরি → picker assign → interactive picking (mobile-friendly) → redesigned print sheet → history। Order advance হবে **manual** (আজকের মতোই) — pick complete হলে auto-advance না।

## 1. Database (নতুন টেবিল)

**`pick_lists`** — একটা pick batch:
- `list_no` (auto: `PICK-260905-01`), `brand_id`, `status` (`draft → assigned → picking → completed / cancelled`)
- `assigned_to` (user id), `assigned_by`, `assigned_at`
- `started_at`, `completed_at`, `notes`
- GRANT authenticated + service_role, RLS: staff সব দেখতে পারবে; create/update admin/operations/warehouse_staff/packer; brand access scoped (`user_brand_access`)

**`pick_list_items`** — list-এর ভেতরের consolidated item:
- `pick_list_id`, `order_id`, `product_name`, `variant_label`, `sku`, `qty_needed`, `qty_picked`, `picked_at`
- RLS parent list অনুযায়ী

**`pick_list_orders`** (join) — কোন order-গুলো কোন list-এ আছে (এক order এক active list-এই থাকবে — unique partial index)

Migration tool দিয়ে; GRANT → RLS → policy order ঠিক রাখবো।

## 2. Picking page (নতুন screen)

নতুন route: `src/routes/_authenticated/erp.dispatch.picking.tsx` — Dispatch Center-এ header action "Picking" + sidebar-এ entry।

**List view (default):**
- সব pick list: status chip, picker, orders count, total units, progress bar, created/assigned time
- Filter: status (Active / Completed / All), brand, date
- "+ New pick list" → order picker dialog (pending/packed orders থেকে select — brand, courier, item count দেখে filter), নাম/assignee দিয়ে create

**Pick detail view (একটা list খুললে):**
- Header: list no, status stepper (Draft → Assigned → Picking → Completed), picker assign/change, progress ring (picked/total units)
- **Consolidated items table** — product-wise group + variant row (আজকের print sheet-এর মতো grouping), প্রতিটা row-তে: image, name, variant, SKU, qty needed, **tap-to-pick stepper বা scan input** (SKU scan করলে qty বাড়ে), `qty_picked` লাল/সবুজ badge
- **Mobile-first**: বড় touch target (48px+), sticky progress bar নিচে, এক হাতে চলে — grid + min-w-0 pattern
- Partial pick allowed — `qty_picked < qty_needed` হলে row warning tint
- "Complete list" বাটন — শুধু list status completed হয়; order-গুলো **Dispatch board-এ অপরিবর্তিত** থাকে (manual advance)
- Print বাটন — নতুন redesigned sheet

**Live updates:** `pick_list_items`-এ Supabase Realtime subscribe (useEffect + cleanup) — দুইজন picker একই list-এ কাজ করলে progress live দেখা যায়।

## 3. Print sheet redesign (`picking-list-print.tsx` পুনর্লিখন)

- Brand-wise section (একাধিক brand হলে আলাদা block + brand header)
- Row-তে **SKU barcode** (Code128, lightweight pure-JS renderer) — scanner দিয়ে invoice/SKU match করা যাবে
- Bin column থাকবে, কিন্তু warehouse/bin data থাকলে pre-fill, না থাকলে blank line
- বড় ফন্ট qty (A4-এ দূর থেকে পড়া যায়), product total row, grand total
- Picker/Checker/Dispatcher signature + list no + assignee name printed
- BatchPrintDialog-এর "Picking List" mode-টাও এই নতুন sheet ব্যবহার করবে

## 4. Picker assignment + history

- Assign dropdown: `user_roles`-এ `packer / warehouse_staff / operations / admin` যাদের আছে তাদের list
- প্রতিটা list-এ duration track (started → completed) — picker performance: আজকের completed lists, avg time
- "History" tab: completed/cancelled lists, search by list no / picker, পুরনো sheet আবার print করা যায়

## 5. Integration + safety

- Dispatch shell-এ print override / reports dialog-এর existing picking print flow নতুন sheet-এ point করবে — বাকি dispatch pipeline, packer mode, ship dialog কিছু ভাঙবে না
- এক order দুইটা active list-এ যাবে না (DB unique index + UI-তে already-in-list disable)
- Order cancel/hold হলে list item auto flagged, picker-কে warning দেখাবে
- Server functions: `src/lib/erp/picking/picking.functions.ts` (requireSupabaseAuth + brand access check), data hooks `src/hooks/erp/use-picking.ts`

## Files
- `src/routes/_authenticated/erp.dispatch.picking.tsx` (নতুন)
- `src/components/erp/picking/` — picking-shell, pick-list-table, pick-detail, new-pick-list-dialog, picker-assign, pick-history (নতুন)
- `src/components/erp/dispatch/picking-list-print.tsx` (rewrite)
- `src/lib/erp/picking/picking.functions.ts`, `src/hooks/erp/use-picking.ts` (নতুন)
- `src/components/erp/dispatch/dispatch-shell.tsx` — header-এ Picking link (ছোট edit)
- Migration: `pick_lists`, `pick_list_items`, `pick_list_orders`

## Verify
- `bunx tsgo --noEmit` পাস
- নতুন list create → assign → কিছু item pick → print → complete — পুরো flow browser-এ চালিয়ে দেখবো
- Dispatch board, batch print, packer mode আগের মতো কাজ করছে কিনা check
