# Sourcing Desk v2 — smoother flow, tighter tracking

লক্ষ্য: quote তোলা → supplier বাছাই → order → shipment পর্যন্ত পুরো কাজটা কম ক্লিকে, আর প্রতিটা ধাপের হিসাব (কে, কখন, কেন) স্থায়ীভাবে জমা থাকা।

## এখন যেসব জায়গায় আটকায়

- Timeline-এর অর্ধেক তারিখ `null` — sourcing শুরু/শেষ কবে হলো, কে করলো কোথাও লেখা থাকে না।
- Quote গুলো আলাদা কার্ডে, পাশাপাশি তুলনা করা কঠিন; কোনটা target-এ ঢুকছে সেটা চোখে পড়ে না।
- Follow-up-এর কোনো ব্যবস্থা নেই — supplier-কে মেসেজ দিয়ে ভুলে গেলে item চুপচাপ pipeline-এ পচে।
- Sample আনা/না-আনা শুধু একটা dropdown, কোনো tracking বা খরচ নেই।
- Quote add form বড়, একই supplier দুবার ঢুকে যায়, FX প্রতিবার হাতে লিখতে হয়।

## যা করা হবে

### ১. Event log (সব কিছুর ট্র্যাক)
নতুন টেবিল `hub_sourcing_events` — idea_id, event_type, from/to stage, quote_id, note, actor, created_at.
Auto লেখা হবে: stage change, quote add/edit/delete, supplier select, target price change, sample update, PO create, payment.
Detail panel-এ **Activity** ট্যাব — কে কখন কী করলো, ছোট feed। Timeline-এর তারিখগুলো এখান থেকে আসবে, আর `null` থাকবে না।

### ২. Quote comparison table
কার্ডের বদলে একটা compare table: supplier, unit CNY, FX, shipping, **landed cost**, MOQ, lead time, sample, rating, target-এর সাথে পার্থক্য (+/- ৳)।
- সবচেয়ে কম landed cost row-এ "Best" tag, target-এর ভিতরে হলে সবুজ, বাইরে হলে লাল।
- এক ক্লিকে Select, inline edit, duplicate quote.
- Column header-এ sort।

### ৩. Follow-up ও ownership
`hub_product_ideas`-এ নতুন ফিল্ড: `sourcing_owner`, `next_action_at`, `next_action_note`, `priority`।
- Detail panel-এ "Next follow-up" — তারিখ + নোট, এক ক্লিকে +1d/+3d/+7d snooze।
- Queue card-এ due/overdue badge, KPI strip-এ **Needs attention** (overdue follow-up বা N দিন ধরে stuck) chip; সেটায় ক্লিক করলে filter হবে।

### ৪. Sample tracking
Quote-এ sample sub-block: status stepper (none → requested → paid → shipped → received → approved/rejected), courier tracking no, sample cost, received date.
Stage "Sourcing done" করার সময় sample approved না থাকলে soft warning (blocking না)।

### ৫. Quote add flow smoother
- Sheet/dialog-এ **Save & add another**, শেষ ব্যবহৃত FX rate auto-fill, live landed-cost preview (এখনকার মতোই কিন্তু target diff সহ)।
- একই supplier name/URL আগে থাকলে duplicate warning + existing quote-এ jump।
- 1688/Alibaba/Taobao লিংক পেস্ট করলে platform auto-detect।

### ৬. Flow ও keyboard
- Queue-তে `j/k` দিয়ে move, `Enter` select, `a` = add quote, `/` = search focus।
- Detail panel sticky, লম্বা লিস্টে scroll-এ হারাবে না।
- প্রতিটা stage-এ একটা primary CTA বাটন ("Add quote" → "Select supplier" → "Place order" → "Mark in transit") — hint bar-এর জায়গায় action bar।
- Queue-তে stage-wise group heading (Sort: Stage হলে)।

### ৭. Data quality guard
- Order qty < MOQ হলে warning।
- FX rate PO আর quote-এ আলাদা হলে detail-এ flag।
- Landed cost recompute helper একটাই জায়গায় (`quoteLandedCost`) — PO prefill-ও সেটাই ব্যবহার করবে।
- Quote-এ required field validation (supplier name, unit price, FX)।

## Technical notes

- Migration: `hub_sourcing_events` টেবিল (GRANT + RLS brand-scoped via idea), `hub_product_ideas`-এ owner/next_action/priority কলাম, `hub_sourcing_quotes`-এ sample tracking কলাম।
- Event লেখার জন্য `src/lib/erp/hub/sourcing-events.ts` helper; সব mutation-এর `onSuccess`-এ call।
- UI ভাগ হবে: `sourcing-quote-table.tsx`, `sourcing-activity.tsx`, `sourcing-followup.tsx` — route ফাইলটা এখন ১৫৮৮ লাইন, ওটা ছোট হবে।
- বিদ্যমান stage derive/badge logic (`sourcing-track.tsx`) অপরিবর্তিত থাকবে, শুধু তারিখগুলো event log থেকে আসবে।
