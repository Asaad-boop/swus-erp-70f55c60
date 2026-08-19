# Order List — Massive Upgrade

লক্ষ্য: order list পেজে কাজের গতি বাড়ানো (কম ক্লিক, কম অপেক্ষা), UI/UX আধুনিক করা, আর যেসব control এখন "দেখা যায় কিন্তু কাজ করে না" সেগুলো আসল করে দেওয়া।

## এখন যেসব সমস্যা আছে (verified)

- **Filters বাটন dead** — disabled অবস্থায় বসে আছে, কিছুই করে না।
- **Sort fake** — "Date Created (Newest)" শুধু লেখা, sort করা যায় না।
- **Search-এ debounce নেই** — প্রতিটা key press-এ পুরো query রি-রান হয় (slow)। আর placeholder-এ "invoice" লেখা থাকলেও invoice number দিয়ে খোঁজে না।
- **Courier status filter শুধু current page-এ** — ৫০টা row-এর মধ্যে filter করে, তাই count ও pagination ভুল দেখায়।
- **Filter reload-এ হারায়** — URL-এ state নেই, order খুলে ফিরে এলে সব filter reset।
- **Clear বাটন courier filter clear করে না।**
- **Selection page বদলালেই হারায়**, আর "সব matching order select" করার উপায় নেই (শুধু current page)।
- **Pagination**-এ page jump নেই, "showing X–Y of Z" নেই।
- **Keyboard shortcut নেই**, row density/column choice নেই।

## যা বানাবো

### ১. Toolbar (নতুন করে)
- **Debounced search** (৩০০ms) + invoice_no সহ; Esc দিয়ে clear।
- **Sort control (আসল)**: Date created / Order value / Status age / Invoice no — asc/desc সহ। Server-side order।
- **Filters panel (আসল)** — একটা popover-এ: courier, city/district, payment method, payment status, assignee, amount min–max, tag, advance আছে কি না।
- **Advanced date range picker** — presets (Today / Yesterday / Last 7 / 30 / This month / Custom), project-এর existing advanced variant reuse করে।
- **Active filter chips** — কোন কোন filter চালু আছে চিপ আকারে, প্রতিটায় আলাদা ✕।
- **Saved views** — বর্তমান filter সেট নাম দিয়ে save, এক ক্লিকে ফিরে আসা (localStorage, per brand)।

### ২. URL-synced state
Tab, search, sort, page, pageSize, সব filter URL search-param-এ যাবে। ফলে reload/back/share সব কাজ করবে, আর order drawer বন্ধ করলে জায়গা হারাবে না।

### ৩. Courier status filter — server-side
Client-side page filter বাদ। `courier_shipments` থেকে matching order id বের করে query-তে প্রয়োগ হবে, তাই count আর pagination ঠিক থাকবে।

### ৪. Table UX
- **Sticky header + sticky action column**, horizontal scroll-এ column হারাবে না।
- **Density toggle**: Comfortable / Compact (compact-এ ~৪০% বেশি row এক স্ক্রিনে)।
- **Column visibility menu** — যে column দরকার নেই লুকিয়ে রাখা যাবে (choice মনে থাকবে)।
- **Shift+click range select**, আর "সব N টা matching order select করুন" ব্যানার।
- **Row hover quick actions**: call, copy phone, print invoice, sync courier — row না খুলেই।
- **Skeleton loading** (blank flash-এর বদলে), আর নতুন/আপডেট হওয়া row-এ subtle flash (আগেরটাই রাখা হবে)।

### ৫. Keyboard shortcuts
`/` search focus · `j/k` row navigate · `Enter` drawer খোলা · `x` select toggle · `Esc` close/clear · `?` shortcut cheat-sheet।

### ৬. Bulk bar
Floating bottom bar (Web Orders-এর মতো) — selected count, change status, print, book courier, sync, tag, export selected, clear। বর্তমান toolbar-এ চাপাচাপি কমবে।

### ৭. Pagination
"Showing 51–100 of 2,340" + first/prev/page-number/next/last + page jump input।

### ৮. Performance
- Debounced search + `keepPreviousData` (page বদলালে blank হবে না)।
- `status_since` history query শুধু দরকার হলে চলবে।
- Courier shipment fetch page-scoped ও memoized থাকবে।

## Technical notes

- `src/routes/_authenticated/erp.orders.list.tsx` — URL search-param schema (`validateSearch`) যোগ, state সেখান থেকে derive।
- `src/hooks/erp/use-orders-query.ts` — `OrdersFilter`-এ sort, courierBucket, amountMin/Max, city, paymentMethod, paymentStatus, assignee, tag যোগ; invoice search; server-side courier filter; `keepPreviousData`।
- নতুন: `orders-filter-panel.tsx`, `orders-saved-views.tsx`, `orders-pagination.tsx`, `orders-bulk-bar.tsx`, `use-orders-url-state.ts`।
- `orders-toolbar.tsx`, `orders-table.tsx` rewrite; `orders-status-tabs.tsx`-এ scroll affordance।
- Table preference (density/columns) localStorage-এ।
- কোনো DB migration লাগবে না — শুধু existing column/index ব্যবহার করবো (দরকার হলে শেষে index সুপারিশ দেবো)।
