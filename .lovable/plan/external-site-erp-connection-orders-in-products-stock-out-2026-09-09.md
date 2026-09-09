# External Site ↔ ERP Connection (Orders in, Products/Stock out)

তোমার অন্য সাইট থেকে অর্ডার এলে সেটা সরাসরি এই ERP-র Order List-এ ঢুকবে, আর ERP-র product + stock + purchase আপডেট অটোমেটিক ওই সাইটে চলে যাবে। সাথে একটা Endpoint ম্যানেজার স্ক্রিন (তোমার দেওয়া রেফারেন্স ডিজাইনের মতো)।

## ১. Order আসা (inbound)

নতুন public endpoint: `POST /api/public/orders/create`

- হেডারে API key লাগবে (key ছাড়া রিকোয়েস্ট reject)
- বডিতে: customer নাম/ফোন/ঠিকানা, items (SKU বা product id + qty), শিপিং চার্জ, ডিসকাউন্ট, পেমেন্ট মেথড, external order id
- SKU/product id দিয়ে ERP-র প্রোডাক্ট ম্যাচ করবে; না মিললে পরিষ্কার error ফেরত যাবে
- Order + order items তৈরি হবে সঠিক brand-এ, status "New", source = ওই সাইটের নাম
- একই external order id দুইবার এলে ডুপ্লিকেট অর্ডার হবে না
- অর্ডার ঢোকা মাত্রই Order List-এ লাইভ দেখাবে (এখনকার realtime + chime কাজ করবে)

## ২. Product / Inventory / Purchase যাওয়া (outbound)

দুইভাবে:

- **Pull**: এখনকার catalog API-র পাশে `GET /api/public/inventory` — SKU, price, stock, available, active/inactive। ওই সাইট যেকোনো সময় টেনে নিতে পারবে।
- **Push (webhook)**: ERP-তে কিছু বদলালে ওই সাইটে POST যাবে। ইভেন্টগুলো:
  - Orders: created, status changed, payment status changed, delivery status changed, cancelled, refunded
  - Products & Inventory: product created, product updated, price changed, stock changed
  - Purchase: purchase received (মাল রিসিভ হয়ে স্টক বাড়লে)

প্রতিটা webhook বডি signature দিয়ে সাইন করা থাকবে, যাতে ওই সাইট যাচাই করতে পারে যে মেসেজটা সত্যিই আমাদের।

ডেলিভারি নিশ্চিত করতে: প্রতিটা ইভেন্ট একটা queue-তে জমা হবে, প্রতি মিনিটে পাঠানোর চেষ্টা হবে, ফেল করলে কয়েকবার রিট্রাই, প্রতিটার লগ থাকবে (status code, response, সময়) — এবং ম্যানুয়ালি Retry বাটন।

## ৩. নতুন স্ক্রিন: Settings → API & Webhooks

- **Endpoints** লিস্ট: নাম, URL, enabled toggle, শেষ ডেলিভারির অবস্থা
- **Add endpoint** ডায়ালগ — হুবহু তোমার রেফারেন্স মতো: Name, URL, Enabled চেকবক্স, গ্রুপ করা ইভেন্ট চেকবক্স (Orders / Products & Inventory / Purchase) সাথে "Select all", নিচে Cancel + Create endpoint। signing secret শুধু একবার তৈরির পর দেখানো হবে
- **API keys**: ওই সাইটের জন্য key তৈরি/বাতিল, কোন brand-এ অর্ডার ঢুকবে সেটা সেট করা
- **Deliveries** লগ: শেষ ডেলিভারিগুলো, payload, response, Retry

অ্যাক্সেস: শুধু owner/admin।

## Technical notes

- নতুন টেবিল: `api_clients` (hashed key, brand_id, scopes), `webhook_endpoints` (url, events[], secret hash, enabled), `webhook_deliveries` (event, payload, attempts, status, response) — সবগুলোতে RLS + owner/admin only policy, GRANT সহ
- Inbound/outbound সব `src/routes/api/public/*` server route-এ; key যাচাই handler-এর ভেতরে, তারপরই `supabaseAdmin`
- ইভেন্ট capture হবে Postgres trigger দিয়ে (orders, products, product_variants, stock_movements) → `webhook_deliveries` queue-তে row
- Dispatcher: `POST /api/public/cron/dispatch-webhooks`, pg_cron প্রতি মিনিটে কল করবে; HMAC-SHA256 signature হেডার `x-swus-signature`
- Order create-এ existing order creation logic reuse হবে যাতে stock reserve/deduct নিয়ম অক্ষুণ্ণ থাকে
- Endpoint URL শুধু https, payload-এ কোনো internal cost/profit ফিল্ড যাবে না
