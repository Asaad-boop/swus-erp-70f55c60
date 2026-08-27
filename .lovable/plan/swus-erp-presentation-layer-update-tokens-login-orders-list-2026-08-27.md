# SWUS ERP — Presentation Layer Update (Tokens · Login · Orders List · Web Orders)

## What already exists (no rebuild needed)

- Design tokens + light/dark theme provider + `/uipreview` — already shipped; only the new palette values need updating.
- Login split-screen with Sync Pulse — already shipped; needs the remaining spec details.
- Backend fields are all present on `orders`: `call_status`, `call_attempt_count`, `last_call_at`, `last_called_by`, `assigned_to`, `risk_flag`, `duplicate_flag`, `hold_reason`, `reconciliation_status`, `net_collected`, plus `order_notes`, `order_locks`, `order_status_history` and utm/fb attribution columns. So call logging, assignment and bulk actions wire to existing columns — no new tables.

## Part 1 — Token refresh

Update `src/styles.css` to the new warm-neutral values (bg `#FCFCFB`, surface-alt `#F7F6F4`, border `#EAE8E4`/`#F1F0ED`, text `#171614`/`#75726C`/`#A6A39C`, success `#3E9C74` on `#EAF6F0`, warning `#C08A35` on `#FBF2E4`, danger `#D6534F` on `#FCEBEB`, info `#4A6FA5`), keep dark mode hues and lift semantic opacity. Add a `.num` / mono utility for IDs, phones, money, %, timestamps. Radii: card 13–14, input 8–9, button/chip 7–8, badge 5–6. Extend `/uipreview` with a Checkbox + Table + Tabs section in both themes.

## Part 2 — Login page completion

Left panel: top bar (brand mark + wordmark, pulsing "All systems synced" chip), Sync Pulse caption "Two brands · one data layer", mono eyebrow, gradient last-three-words headline, numbered 01/02/03 terminal feature rows with right-aligned status chips, footer with © line + mono `v2.0.4`. Staggered fade-up 0.05s→0.9s. Right panel: remember-me + forgot-password row, error clears on typing, arrow nudge on hover, divider "New here?" + "Create an account" secondary button. Reduced-motion respected. Auth logic untouched.

## Part 3 — Orders List (`erp.orders.list.tsx`)

- Header: "ALL BRANDS" eyebrow with live dot, title + count, mono snapshot metrics (awaiting action, pending COD value, delivery rate), Sync / Export / Create Order actions.
- Alert strip: renders only when `risk_flag` / `duplicate_flag` / `hold_reason` counts > 0, with "Review now" applying the matching filter.
- New **pipeline flow bar** component: proportional segmented bar for active statuses, clickable segments filter the table, legend row with counts (active underlined); settled statuses in a separate muted row below.
- Toolbar stays (search + filter chips + Columns + Sort), restyled to tokens.
- `orders-table.tsx` → dense hairline rows: checkbox, flag squares, Order (id + relative time), Customer (avatar, name, confidence, phone, truncated address), Call status chip, COD badge, Status (dot + relative time + lock badge from `order_locks`), Reconciliation chip, mono bold Total, attribution icon when utm/fb present, hover kebab.
- Row click → 420px right slide-in drawer with 4 tabs: Timeline (stepper from `order_status_history`), Attribution, Notes (`order_notes`, internal = amber), Payment key-value grid. Reuses the existing `order-drawer.tsx` shell.

## Part 4 — Web Orders (`erp.orders.web.tsx`)

Same layout, upgraded:
- Header/subtext/search restyle; status tabs with mono count badges, solid dark active tab, red-tinted counts for "No Response" and "On Hold".
- Tag filter row unchanged in position, restyled chips.
- Pin/alert banner: orders with no call attempt in 3+ hours or a phone-duplicate get a red banner and are pinned to the top with a red-tinted row.
- Columns: Created (stale >3h in red/bold), Customer (+ amber "Dup of HS-XXXX" badge, copy/call icons), new **Call** column (chip + "Call now" → increments `call_attempt_count`, sets `last_call_at`/`last_called_by`, optimistic then reconciled), Order Items (thumb stack + Pre-order badge), Success Rate ring recolored to tokens, new **Assigned** column (avatar + name, click to pick agent → `assigned_to`), Site & Source, Actions.
- Floating bulk bar on selection: "N orders selected" + Mark confirmed / Move to On Hold / Assign to… / clear, batched update over selected IDs.

## Technical notes

Presentation-layer only: no route paths, RLS or query shapes change. Call logging, assignment and bulk actions use batched Supabase updates on existing columns via new mutation hooks with optimistic cache updates and toast feedback. All new controls are keyboard reachable and honour `prefers-reduced-motion`.

## Delivery order

1. Tokens + `/uipreview` 2. Login 3. Orders List (flow bar, table, drawer) 4. Web Orders (banner, Call, Assigned, bulk bar)
