# Dispatch Center Rebuild — Advanced Daily Operations

## Goal
Rebuild Dispatch Center into a high-volume operations workspace that is fast on desktop and excellent on mobile, while preserving current courier, packing, printing, SMS, and status business rules.

## Planned scope
- Replace the current KPI + four-column board-first layout with an operations command bar, compact workflow queue, exception queue, and actionable order workspace.
- Make Packer Mode the primary scan workflow: persistent scanner input, large feedback states, fast quantity/progress confirmation, keyboard/Bluetooth scanner support, and safe undo.
- Add authoritative COD visibility everywhere: gross total, confirmed advance, net courier COD, and a live courier-COD audit that compares the courier response to ERP due.
- Add operational filters and saved working views for brand, courier, stage, age/SLA, payment/advance, and exception type.
- Add batch operations with preflight validation, clear partial-success results, courier booking readiness, print readiness, and handover finalization.
- Add a dedicated exceptions area for failed bookings, address/location gaps, COD mismatches, stale parcels, holds, and return/exchange handoff.
- Upgrade reports into shift/day-end controls with courier/brand totals, manifests, picking lists, COD totals, mismatch exports, and reconciliation-ready summaries.
- Add a focused order drawer so operators can inspect items, customer/address, courier state, timeline, notes, and perform the next safe action without leaving Dispatch.

## Data and business rules
- Use existing orders, order_items, courier_shipments, status history, notes, and courier APIs; avoid duplicating source-of-truth data.
- Keep COD calculation centralized as max(0, total - confirmed advance), revalidated server-side before every booking.
- Courier live response is authoritative for courier state and booked COD; ERP status transitions must retain existing downgrade guards.
- Destructive/bulk actions require preflight and explicit confirmation. Partial failures remain visible and retryable.
- Reuse existing return/exchange flows instead of creating a second returns system.

## Technical implementation
- Refactor large Dispatch UI into focused components under src/components/erp/dispatch/.
- Extend src/hooks/erp/use-dispatch.ts only for query/state orchestration; move privileged/bulk courier actions into authenticated TanStack server functions.
- Add database RPC/index/migration only if investigation proves existing queries cannot provide accurate SLA/audit data efficiently; all new access remains RLS-scoped.
- Keep board and table as secondary view modes, with a denser queue as the default operational view.
- Add targeted automated tests for stage mapping, COD calculation/audit, bulk preflight, and scan transitions.

## Verification
- Validate desktop at 1280px and mobile scanner flow at common phone width.
- Test scan → pack → ready → courier booking → handover, failed booking retry, hold/release, and return/exchange handoff.
- Verify KPI counts against Order List status logic and COD totals against courier shipment payload/live response.
- Confirm no overlapping controls, no accidental scan actions, and stable performance with large queues.
