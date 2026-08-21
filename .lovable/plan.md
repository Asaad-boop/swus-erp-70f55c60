# Dispatch Center — Full Rebuild

Daily packing floor-এর জন্য একটা fast, mobile-first, bug-free dispatch workspace। Pending → Packed → Ready to Ship → Shipped — এই চারটা ধাপ যেন packer/dispatcher ভুল ছাড়াই, দ্রুত, sound feedback সহ চালাতে পারে।

## 1. Two surfaces, one engine

**A. Packer Mode (mobile-first, fullscreen)**
- বড় scan box + সবসময় sticky camera scan button (phone দিয়ে barcode/QR)।
- Stage selector: বড় তিনটা টাইল — PACK / READY / SHIP। কোন stage-এ আছে সবসময় স্ক্রিনে বড় করে দেখা যাবে।
- Scan করার সাথে সাথে: sound (success / error / ship আলাদা টোন), vibration (mobile), full-width color flash (সবুজ = হলো, লাল = হয়নি), আর বড় করে order card — invoice, customer, item list, COD amount।
- ভুল scan হলে পরিষ্কার বাংলা/ইংলিশ বার্তা: "এই order আগেই packed", "আগে pack করতে হবে", "order পাওয়া যায়নি"।
- শেষ 10টা scan-এর log + one-tap Undo (প্রতিটা লাইনে আলাদা undo, শুধু শেষেরটা নয়)।
- Live counter: আজ আমি কয়টা packed/shipped করেছি।

**B. Console Mode (desktop)**
- 4-column pipeline থাকবে, কিন্তু প্রতিটা কলামে: search, courier/brand/COD filter, sort (oldest first default), select-all, virtualized scroll যাতে ৫০০+ order-এও smooth থাকে।
- প্রতিটা order row-তে hover action: Advance, Print label, Open order, Hold, Cancel booking।
- Board ⇄ Table toggle — table view-এ sortable columns আর bulk select।

## 2. Ship step — hassle-free courier

- Ship করার সময় courier picker: **Pathao / Steadfast / Manual (নিজের courier + tracking no.)**। Default courier settings থেকে আসবে, per-order override করা যাবে।
- Booking-এর আগে pre-flight check: phone valid কিনা, address আছে কিনা, COD amount, আগে থেকে consignment আছে কিনা (duplicate booking hard-block, যেটা এখন আছে সেটা রাখা হবে)।
- Booking fail হলে order stage বদলাবে না — inline error + Retry button, আর একটা "Failed bookings" tray যেখান থেকে সব fail একসাথে retry করা যাবে।
- Booking সফল হলে consignment/tracking সাথে সাথে row-তে দেখাবে + courier status badge live sync।

## 3. Fix / edit — কোনো কিছু আটকে থাকবে না

প্রতিটা order-এ একটা **Fix menu**:
- Move to any stage (forward বা backward, note সহ) — audit log-এ যাবে।
- Cancel courier booking / re-book.
- Put on hold + hold reason, আর hold list আলাদা দেখা যাবে।
- Edit shipping phone/address inline (courier booking fail হলে সবচেয়ে বেশি দরকার হয়)।
- Order detail page-এ jump।

## 4. Speed & reliability

- এক query-তে চার stage আনা হবে (count আলাদা), payload ছোট, item list শুধু দরকার হলে lazy load।
- Optimistic update: scan করার সাথে সাথে card এক column থেকে আরেক column-এ চলে যাবে; server fail করলে rollback + error sound।
- Scan de-dupe: একই invoice ২ সেকেন্ডের মধ্যে দুইবার scan হলে ignore (double-beep bug বন্ধ)।
- Realtime subscription থাকবে কিন্তু throttled invalidate, যাতে scan-এর সময় list jump না করে।
- Offline/slow network guard: request timeout + retry, আর scan queue যাতে দ্রুত পরপর scan হারিয়ে না যায়।

## 5. Sound & notification

- আলাদা টোন: pack success, ready success, ship success (বেশি জোরালো), error, duplicate warning।
- Volume/mute toggle header-এ, choice localStorage-এ সেভ থাকবে।
- Mobile-এ haptic vibration। Ship হলে toast + consignment number।

## 6. Print & handover

- Print flow যেমন আছে রাখব, কিন্তু: printed badge order card-এ দেখাবে, re-print আলাদা mark হবে, আর courier-wise handover manifest এক ক্লিকে (rider signature line সহ)।
- Day-end summary sheet: কয়টা packed, shipped, courier-wise breakdown, COD total — CSV + print।

## Technical notes

- `src/routes/_authenticated/erp.dispatch.tsx` কে thin route বানিয়ে UI ভেঙে দেব: `dispatch-shell.tsx`, `packer-mode.tsx`, `pipeline-board.tsx`, `dispatch-table.tsx`, `order-card.tsx`, `ship-dialog.tsx`, `fix-menu.tsx`।
- Data + mutation logic একটা hook-এ: `src/hooks/erp/use-dispatch.ts` (query, optimistic transitions, scan queue, undo stack)।
- Courier booking: বিদ্যমান `pathaoBookOrderAutoFn` + `steadfastBookOrderFn` ব্যবহার করব, একটা `bookCourier()` wrapper দিয়ে।
- Sound: `src/lib/erp/audio-feedback.ts` এ নতুন tone + mute setting যোগ হবে।
- Stage transition আগের মতোই `transition_order_status` RPC দিয়ে — কোনো নতুন DB migration লাগবে না।
- Realtime, keyboard shortcut, print job history আগের মতোই থাকবে।
