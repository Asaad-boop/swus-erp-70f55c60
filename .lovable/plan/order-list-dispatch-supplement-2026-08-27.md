# Order List Dispatch Supplement

## Goal
Add dispatch capabilities directly into the existing Order List page so operators can select, pack, print waybills, assign couriers, and mark shipped without leaving the list. The standalone Dispatch Center remains untouched.

## Scope decisions (from user)
- Actions: Print waybill, Mark packed / RTS / shipped, Assign courier, Scan barcode, Create manifest
- Both per-row quick actions and bulk dispatch panel
- Supplement Dispatch Center, not replace it
- After dispatch, order row stays in list with updated status

## Part 1 — Per-row dispatch quick actions
- Add a compact `DispatchActionsCell` to `orders-table.tsx` (only for rows in dispatchable statuses: confirmed, packaging, packed, ready_to_ship, ready_to_pack).
- Buttons: Print waybill (icon), Mark packed → RTS → Shipped (progressive single-click), Assign courier (dropdown).
- Use existing server functions / mutations where possible; create thin wrappers if missing.

## Part 2 — Bulk dispatch panel
- Extend `orders-bulk-actions.tsx` with a "Dispatch" category.
- Bulk actions: Print waybills (zip/merged PDF), Mark selected as packed / RTS / shipped, Assign courier to all, Create manifest, Open scanner.
- Reuse selection model already in place.

## Part 3 — Scanner integration
- Add a "Scan to Dispatch" button in the Order List toolbar.
- Opens a modal with camera/keyboard barcode input.
- Scanned order ID instantly updates status to next dispatch step and shows a toast.

## Part 4 — Courier assignment
- Reuse courier settings/credentials from existing Dispatch Center.
- Dropdown shows enabled couriers (Pathao, Sync, local) with account selection.
- Assignment writes to `orders.courier_id` / `courier_shipments`.

## Part 5 — Print waybill
- Per-row print opens the existing waybill print flow in a new tab.
- Bulk print generates a merged PDF or queued download.

## Technical notes
- No route changes; no RLS changes.
- All mutations go through `createServerFn` + optimistic TanStack Query updates.
- Keep the current dense table layout; add only one extra narrow column.
- Keyboard accessible: `Ctrl/Cmd + Shift + D` opens bulk dispatch panel.
- Respect `prefers-reduced-motion`.

## Delivery order
1. Per-row dispatch cell
2. Bulk dispatch category
3. Courier assignment dropdown
4. Scanner modal
5. Print waybill wiring
