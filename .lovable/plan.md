# Dispatch Center — Full Advanced Rebuild

## Product direction
- Roll out in controlled phases inside one rebuild so live dispatch work stays usable throughout.
- Default screen: **Operations Queue** for fast daily processing; Board and Table remain alternate views.
- First-class courier support: **Pathao, Steadfast, and Manual**.
- Notifications: **BulkSMSBD SMS + per-customer WhatsApp click-to-chat**. No automated WhatsApp provider dependency in this phase.

## Phase 0 — Safety and correctness baseline
- Fix the reported navigation/update loop before rebuilding the screen.
- Unify Dispatch stage counts with Order List rules and use `shipped_at` rather than mutable `updated_at` for “shipped today”.
- Add per-order mutation/booking locks so double-clicks, duplicate scans, or two operators cannot book the same parcel twice.
- Add a database backstop preventing more than one active courier shipment per order, after safely identifying/resolving existing duplicates.
- Make ship undo safe: an order cannot be moved backward while leaving an active courier consignment hidden behind it.
- Keep the authoritative courier COD rule server-side: `max(0, order total − confirmed advance)`.

## Phase 1 — Operations command center
- Replace the current KPI/board-first layout with a compact command bar and actionable queue.
- Add live stage KPIs for Pending, Packed, Ready, Courier booked, Picked up/In transit, Delivered today, Holds, Returns, and Exceptions.
- Add one global search across invoice, phone, customer, tracking/consignment, SKU, product, and area.
- Add operational filters for brand, courier, stage, age/SLA, payment/advance, print state, booking readiness, and exception type.
- Add desktop density controls plus a mobile card queue; remove fixed-height nested-scroll traps.
- Keep Kanban and data table as secondary views, optimized for large queues without silent 600-row truncation.
- Add a focused order drawer showing items/images/variants, customer/address, gross total, advance, net COD, courier state, notes, and status timeline.

## Phase 2 — Beast-mode packing and scanning
- Make Packer Station a reliable full-screen mobile workflow with large touch targets, safe-area support, persistent scan input, camera/Bluetooth scanner modes, audio/haptic/color feedback, and connectivity state.
- Support three explicit scan modes: Pack, Ready, and Book/Ship, with clear required-stage guards.
- Add optional item-level verification for multi-item orders: required quantities must be scanned/confirmed before the order can become Packed.
- Add per-order progress, queue depth, retry, timeout handling, session counters persisted by date/brand/operator, and safe undo.
- Prevent rapid duplicate scans without blocking legitimate multi-quantity item verification.

## Phase 3 — Courier booking, COD audit, and exceptions
- Add batch booking preflight with valid/blocked groups, reasons, progress, cancelability, and partial-success results.
- Keep address/phone/location correction inline; support provider change for failed rows instead of blind “retry all”.
- Build a **live Courier COD Audit** for every active shipment:
  - Compare Pathao/Steadfast live booked COD (or immutable booking payload where the provider cannot return it) with ERP net COD.
  - Show invoice, customer, masked phone, courier status, waybill, gross total, advance, ERP due, courier COD, and exact excess/short amount.
  - Include the confirmed TY-0000369 pattern and scan all active orders, not only rows already known to have an advance.
  - Separate auto-confirmed mismatch, provider-data unavailable, and manual-review rows; never guess from `advance_amount` alone.
- Add CSV/XLSX export formatted for courier support and a print-ready correction sheet.
- Add customer remediation actions: preview the exact message, send brand-configured BulkSMSBD SMS in brand-safe batches, and open a prefilled WhatsApp chat. Sending requires explicit confirmation and is logged per order; no automatic blast on audit.
- Add exception queues for failed booking, invalid address/location, COD mismatch, stale/SLA breach, hold, duplicate booking, courier status conflict, and return/exchange handoff.

## Phase 4 — Batch operations and handover
- Add contextual bulk actions with preflight: Pack, Ready, Book courier, Print invoice/picking/waybill, Hold with reason, Release, and Finalize handover.
- Replace direct bulk status updates with guarded transitions and preserve an audit trail for every order.
- Add courier/brand grouped pickup manifests with parcel count, item count, net COD, waybills, rider/warehouse signatures, and handover state.
- Add shift/day-end controls: packed/booked/handover throughput, failed/retried counts, courier-wise COD, advance deducted, and unresolved exceptions.

## Phase 5 — Returns, exchanges, and after-dispatch operations
- Surface live courier status using the existing guarded courier-to-ERP mapping; resolved statuses cannot be downgraded by late events.
- Add delivery-failure and return/exchange handoff actions that reuse the existing Returns module and its server functions—no duplicate returns system.
- Show linked return/exchange case status inside the order drawer and route operators into the existing QC/restock/refund/replacement workflow.
- Add SLA buckets for pickup delay, in-transit delay, delivery hold, return-in-transit, and unresolved delivered/payment exceptions.

## Architecture and security
- Split the oversized `use-dispatch` implementation into data, transition, courier, and scanner hooks while preserving one public `useDispatch()` API.
- Keep client components presentation-focused; authenticated courier audits, batch operations, and SMS orchestration use thin TanStack server functions with authorization/RLS.
- Reuse `transition_order_status`, courier status guards, order locks, order history, Returns/Exchange server functions, and existing print components.
- Keep secrets and courier credentials server-only. Return plain audit DTOs; never expose provider credentials or raw sensitive payloads.
- Add database migration only for required integrity/index changes, with existing data cleanup and grants/RLS preserved.

## Verification
- Automated tests for stage mapping, COD computation, live-COD parsing, duplicate booking prevention, bulk preflight/partial failure, scan transitions, and undo safety.
- End-to-end test: scan → item verify → pack → ready → courier booking → COD confirmation → print → handover.
- Test failed booking retry/provider switch, hold/release reason, stale parcel, return/exchange handoff, SMS preview/send logging, and correction export.
- Verify KPI counts against Order List and courier state; verify every displayed COD equals the live/recorded courier amount and ERP due independently.
- Responsive QA at 1280px and mobile viewport, with no overlapping controls, nested-scroll traps, accidental scan actions, or blank states.
