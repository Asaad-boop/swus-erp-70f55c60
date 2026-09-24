# Scan to Dispatch v2 — fast, mobile-first, daily workhorse

## Goal
Order List-এর "Scan to Dispatch" কে phone-এ এক হাতে দ্রুত চালানো যায় এমন futuristic scan station বানানো, better search আর daily-useful feature সহ।

## 1. Mobile-first layout
- Phone-এ full-screen sheet (desktop-এ বড় dialog)। বড় mode buttons (Pack / Packed / RTS / Ship), thumb-reach bottom action bar।
- Dark "scan station" look: glowing scan frame, animated scan line, big result flash (green/red full-card pulse), prefers-reduced-motion respect।

## 2. Continuous camera mode
- Camera inline খোলা থাকবে (প্রতি scan-এ বন্ধ হবে না) — scan → process → 1.2s cooldown → next scan।
- Torch, zoom/tap-to-focus (supported হলে), vibration feedback on success/error।
- Same code দ্রুত দুইবার detect হলে skip।

## 3. Better search
- Invoice, tracking/consignment number, phone (01/+880/880 normalize), last-4 phone, customer name, UUID।
- Invoice prefix ছাড়া শুধু number দিলেও match (যেমন "3123" → HS-0003123)।
- Ambiguous হলে error না দিয়ে ছোট candidate list দেখাবে — tap করে select।
- Live suggestion dropdown typing-এর সময় (debounced), Enter/tap-এ action।

## 4. Order preview before/after action
- Result card: customer, phone, address, total, COD/paid, courier, items (name × qty) — packer যাতে মিলিয়ে নিতে পারে।
- "Confirm mode" toggle: scan করলে আগে preview, তারপর বড় Confirm button (packing verify করার জন্য)। Auto mode আগের মতো instant।

## 5. Useful daily features
- Session stats bar: আজকের session-এ packed / RTS / shipped count, scans/min, error count।
- Undo last action (status আগের জায়গায় ফেরত, ship/booking হলে undo নয়)।
- Session log (last 50) with filter ok/error, CSV export।
- Mode "Packed" যোগ (এখন শুধু Pack/RTS/Ship; Packed ধাপ missing)।
- Wrong-status smart hint: "এটা already Packed — RTS mode-এ switch করবে?" এক tap-এ switch+apply।
- Cancelled/returned/hold order scan করলে বড় red warning + error sound।
- Print waybill button result card থেকে।

## Technical notes
- Files: `scan-to-dispatch-dialog.tsx` rewrite (subcomponents: ScanStation, ResultCard, CandidateList, SessionStats), `camera-scanner.tsx`-এ `continuous` + `inline` mode prop যোগ (existing popup behaviour intact)।
- Search: client Supabase query with normalized OR filters on invoice_no, tracking_number, shipping/guest phone, name; order_items join for preview। DB change লাগবে না।
- Undo uses existing `onStatusChange`; session state local (sessionStorage), no schema change।
- Existing booking logic (Pathao/Steadfast/duplicate check) unchanged।
