# Inventory Module — Upgrade + Bug Fix

## এখন যেসব বাগ/অসম্পূর্ণ জিনিস আছে

Products tab-এ কয়েকটা কন্ট্রোল বসানো আছে কিন্তু আসলে কিছুই করে না:

- **Category filter** — শুধু "All categories" দেখায়, কোনো ক্যাটাগরি লোড হয় না
- **Sort dropdown** — Updated / Title / Stock বেছে নিলেও লিস্ট বদলায় না
- **Columns toggle** — মেনু খোলে, কলাম hide/show হয় না
- **Reserved pill** — ক্লিক করলে কিছু হয় না
- **Settings বাটন** — কোনো কাজ নেই
- **Bulk Stock In/Out** — ১০টা সিলেক্ট করলেও শুধু প্রথম প্রোডাক্টের ডায়ালগ খোলে
- **Set reorder point** — "coming soon" toast
- **KPI ভুল** — Total Units / Stock Value / Low-Out শুধু বর্তমান পেজের ৫০টা প্রোডাক্ট থেকে হিসাব হয়, পুরো ব্র্যান্ডের না
- **Low Stock filter ভুল** — শুধু বর্তমান পেজে ফিল্টার হয়, তাই "Low Stock" ক্লিক করলে অনেক প্রোডাক্ট মিস যায় আর pagination count ভুল দেখায়
- **Search-এ debounce নেই** — প্রতি কি-স্ট্রোকে DB query যায়, তাই টাইপ করতে গেলে ল্যাগ করে

## যা করা হবে

### ১. ফিল্টার/সর্ট সঠিকভাবে কাজ করানো (server-side)
- Category dropdown আসল `categories` টেবিল থেকে লোড হবে, ব্র্যান্ড অনুযায়ী ফিল্টার করবে
- Sort: Updated / Title / Stock (asc+desc toggle সহ) — DB query-তে প্রয়োগ হবে
- Low Stock ফিল্টার DB-লেভেলে করা হবে (`stock <= low_stock_threshold`), যাতে সব পেজ জুড়ে ঠিক থাকে
- Reserved pill আসল ফিল্টার হবে (reserved_stock > 0)
- Search-এ ৩০০ms debounce

### ২. KPI পুরো ব্র্যান্ড থেকে
আলাদা summary query — মোট প্রোডাক্ট, মোট ইউনিট, stock value (WAC×stock), low/out count, reserved — সব ফিল্টার-সচেতন, শুধু পেজ নয়।

### ৩. Bulk actions ঠিক করা
- **Bulk Stock In/Out** — একটা নতুন ডায়ালগ যেখানে সব সিলেক্টেড প্রোডাক্টে একসাথে qty + reason দিয়ে adjust হবে (existing `adjust_stock_v2` RPC ব্যবহার করে, প্রতি প্রোডাক্টে একটা করে movement)
- **Set reorder point** — বাস্তব ডায়ালগ, bulk update + undo
- **Activate/Deactivate** bulk action যোগ
- Bulk delete-এ কতগুলো ভ্যারিয়েন্ট/স্টক আছে সেটা warning-এ দেখাবে

### ৪. Columns toggle বাস্তব করা
WAC / Reserved / Incoming / Reorder / Price কলাম চেকবক্স দিয়ে show-hide, পছন্দ localStorage-এ সেভ থাকবে।

### ৫. ছোট UX আপগ্রেড
- Settings বাটন → low-stock default threshold + page size সেটিংস popover (localStorage)
- Row-এ WAC/Reserved/Available-এর জন্য পরিষ্কার tooltip
- Empty state-এ "Add Product" CTA
- Keyboard: `/` চাপলে search-এ ফোকাস

## টেকনিক্যাল নোট
- `src/hooks/erp/use-inventory-query.ts` — filter টাইপে `categoryId`, `sortBy`, `sortDir` যোগ; low/reserved ফিল্টার server-side; নতুন `useInventorySummary` hook (aggregate query)
- `src/routes/_authenticated/erp.inventory.tsx` — UI wiring, columns state, bulk dialogs
- নতুন: `src/components/erp/inventory/bulk-stock-dialog.tsx`, `bulk-reorder-dialog.tsx`
- কোনো DB migration লাগবে না — বিদ্যমান টেবিল ও `adjust_stock_v2` RPC যথেষ্ট
