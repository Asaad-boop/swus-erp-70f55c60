## কেন current টা কাজ করছে না

DB trigger `auto_flag_preorder` stock কম থাকলেই order-কে auto pre-order বানিয়ে দেয়। System এখন backorder-friendly, তাই অসংখ্য normal order ভুল করে pre-order হয়ে যাচ্ছে। সাথে advance/due/promise কিছুই track হয় না। পুরোটা কেটে নতুন করে বানানো হবে।

## নতুন Pre-order flow

```text
Entry (৩ ভাবে)                Pre-order pipeline                 Exit
──────────────────────        ─────────────────────────────      ──────────────────
Create Order → Pre-order  ┐   Open ─ Advance Paid ─ Stock         Confirm করলে →
Web Order → Convert       ├─► Arrived (Ready) ─ Called &          status = confirmed
Order List (new/pending)  ┘   Confirmed                           → Pending/Packaging
   → Convert                        │                                 queue-তে চলে যাবে
                                    └─► Cancelled / Refunded
```

### ১. Create Order page-এ Pre-order button
`/erp/orders/new` top-এ একটা **"Pre-order Mode"** toggle button। ON করলে page pre-order mode-এ যাবে:
- Promise date / "কত দিন" input (দিন লিখলে date auto, date দিলে দিন auto)
- Advance section: **Without advance** / **With advance** — with advance দিলে amount + method (bKash/Nagad/Rocket/Bank/Cash) + source (Website/Facebook/Phone/Manual/Shopify) + txn ID
- Due collect method: বাকি টাকা আসার পরে কীভাবে নেবে (COD / bKash / Nagad / Bank / Cash on pickup) + note
- Save করলে order status `pre_order` হবে, তাই এটা Pending/Packaging queue-তে যাবে না

### ২. Web Orders → Pre-order convert
`/erp/orders/web` drawer + bulk action bar-এ **"Convert to Pre-order"** — একই promise/advance/due dialog আসবে, confirm করলে order pre-order pipeline-এ চলে যাবে।

### ৩. Order List (new/pending) → Pre-order convert
Order list row action + bulk action-এ **"Move to Pre-order"** (শুধু new/confirmed/pending status-এর জন্য)। একই dialog।

### ৪. Stock এলে → call → confirm
Pre-orders page-এ প্রতিটা row-তে:
- **Mark Stock Arrived** (Ready) — product stock এলে
- **Called & Confirmed** — customer-কে call দিয়ে confirm হলে; চাইলে বাকি টাকার due method এখানে update করা যাবে
- **Confirm Order** — order status `confirmed` হয়ে যাবে, pre-order pipeline থেকে বেরিয়ে normal Order List-এর pending/packaging queue-তে ঢুকবে (stock ledger তখনই deduct হবে)
- **Cancel / Refund** — advance থাকলে refund note সহ

## Pre-orders page (`/erp/orders/pre-orders`) নতুন করে

- **KPI**: Open · Advance Paid · Ready · Overdue · Advance collected (৳) · Due outstanding (৳)
- **Tabs**: All · Open · Advance Paid · Ready (stock arrived) · Confirmed · Cancelled
- **Filter**: brand, advanced date-range picker, search (name/phone/invoice), advance method, source, overdue-only, with/without advance
- **Row**: product thumb + color/variant, customer + phone, promise date + "৪ দিন বাকি"/"৩ দিন overdue" chip, advance chip (method + amount), due chip (amount + collect method)
- **Detail sheet**: full timeline (Placed → Advance → Ready → Called → Confirmed), notes, edit promise/advance/due
- **Export**: CSV + PDF summary (existing reconciliation export style)

## Technical

**Cleanup**: পুরনো `erp.orders.pre-orders.tsx` delete; DB trigger `trg_auto_flag_preorder` + function drop; order detail-এর পুরনো `is_preorder` switch নতুন panel দিয়ে replace; ভুলভাবে auto-flag হওয়া order গুলোর `is_preorder` clear করা হবে (যেগুলো সত্যিই pre-order না)।

**Schema (migration)**:
- `order_status` enum-এ নতুন value `pre_order` (তাই Order List-এর pending/packaging filter থেকে auto বাদ থাকবে)
- নতুন টেবিল `preorders` — order_id, brand_id, promise_date, promise_days, stage, advance_amount/method/source/txn_id/received_at, due_amount, due_collect_method, due_note, ready_at, called_at, confirmed_at, cancelled_at, refund fields, notes, timestamps
- নতুন টেবিল `preorder_events` — timeline
- দুটোতেই brand-scoped RLS + GRANT; পুরনো `preorder_*` column থেকে data migrate

**Code**: `src/lib/erp/preorders.functions.ts` (createServerFn) + query hooks, `applyBrandScope`, shared `<PreorderDialog>` component যেটা তিন entry point-ই ব্যবহার করবে। Advance record হলে order-এর `advance_amount`/`payment_status` তোমার existing advance rule অনুযায়ী sync হবে — কোনো নতুন cash-account posting নিজে থেকে হবে না।
