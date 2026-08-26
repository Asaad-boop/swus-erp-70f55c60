# ERP UI/UX v2 — "Quiet Precision" Massive Upgrade

লক্ষ্য: পুরো ERP এক visual language-এ আনা — আরও minimal, আরও smooth, আরও premium। Business logic, route, permission, query — কিছুই বদলাবে না। শুধু presentation layer + shared primitives।

## Design direction (v2)

- **Surface**: এক ধরনের card/panel — soft border, খুব হালকা shadow, কম gradient। বর্তমান `--workspace-bg` এর ভারী radial glow কমিয়ে একটা শান্ত neutral canvas।
- **Density**: 3 ধাপের spacing scale (compact / default / relaxed), সব table ও list একই row rhythm মানবে।
- **Type**: Sora (display) + Manrope (body) থাকবে, কিন্তু size/weight scale ঠিক করে দেওয়া হবে — 5টা heading step, tabular numerals সব amount-এ।
- **Color**: primary indigo থাকবে; status colors (success / warning / danger / info / neutral) একটাই semantic scale-এ আসবে, প্রতিটার solid + soft + border variant।
- **Motion**: 120–180ms ease-out, শুধু hover/press/enter — কোনো bouncy animation নয়। `prefers-reduced-motion` respect।
- **Radius/elevation**: 3 level elevation (flat, raised, overlay) — এর বাইরে কিছু নয়।

## Phase 1 — Foundation (tokens + primitives)

- `src/styles.css`: status scale, elevation scale, density variables, focus-ring token, calmer workspace background, dark mode parity audit।
- Shared primitives `src/components/erp/ui/`-তে: `PageHeader` (refresh), `DataPanel` (refresh), `StatCard`, `StatusBadge`, `DataTable` shell (sticky head, zebra-free, hover row actions), `EmptyState`, `SkeletonBlock`, `Toolbar` (filter chips + search + density toggle)।
- shadcn base overrides: Button, Input, Select, Tabs, Dialog, Sheet, Dropdown, Tooltip — একই radius/height/focus।
- Deliverable: `/uipreview` route-এ পুরো kit একসাথে দেখা যাবে।

## Phase 2 — Shell

Sidebar (v2 polish), topbar, mobile drawer, breadcrumb, global search, brand switcher, page transitions, toast placement। Responsive audit: 360px থেকে ultrawide।

## Phase 3 — Orders + Dispatch + Returns

Order list, order detail, create order, pre-order, dispatch board, packer mode, returns/exchange — সব নতুন table shell + status badge + toolbar-এ port। Print/waybill sheet একই branded shell মানবে।

## Phase 4 — Inventory, Products, Supply Chain

Catalog, variants, stock views, purchase orders, releases/QC, sourcing desk। বড় form গুলোতে এক form layout pattern (label উপরে, helper text, inline error)।

## Phase 5 — Finance, Reconciliation, Marketing, Growth

Wallets, journal, AR/AP, reconciliation, campaign workspace, budget pacing, growth studio। Chart theme unify (এক color set, এক tooltip, এক axis style)।

## Phase 6 — Reports, HR, Settings + polish pass

Reports hub-কে (বর্তমান Midnight Indigo editorial) v2 language-এ align, HR module, settings pages। শেষে: dark mode audit, keyboard/a11y pass, contrast check, bundle/render performance pass (memoization, virtualized long tables)।

## Guardrails

- কোনো query, RPC, mutation, RLS, route path বদলাবে না।
- হার্ডকোডেড color class নয় — সব semantic token।
- প্রতি phase শেষে screenshot দিয়ে verify, তারপর পরেরটা।
- ডাটা না থাকলে card/section hide (empty placeholder নয়)।

## এখন শুরু

Approve করলে Phase 1 (tokens + primitives + `/uipreview` kit) দিয়ে শুরু করব — এটাই পরের সব phase-কে দ্রুত করবে।
