# Content Studio v2 — সব ৬টা স্ক্রিন advance + UI/UX upgrade

## লক্ষ্য
Content Studio-র ছয়টা স্ক্রিনকে একটা consistent, premium design system-এ আনা এবং প্রতিটাতে বাস্তব কাজের ফিচার যোগ করা — যাতে stock আসা থেকে creator brief, publish, ROAS পর্যন্ত পুরো ফ্লো একই জায়গায় ট্র্যাক হয়।

## Shared design system (সব স্ক্রিনে এক রকম)
- নতুন shared component set: page hero (gradient + breadcrumb), interactive KPI strip (ক্লিক করলে filter হয়), glass sticky toolbar, empty/loading states, saved-view chips।
- এক রকম card/row design, density toggle (comfortable / compact), mobile-first — সব টেবিল mobile-এ card list হবে।
- সব স্ক্রিনে: search (debounced), multi-filter, sort, URL-এ filter state সেভ (link শেয়ার করা যাবে), CSV export।

## ১. Stock → Content Intake
- Idle timer-কে risk score-এ আপগ্রেড (stock value + idle days + content count)।
- Grouping: "কোনো content নেই" / "target-এর নিচে" / "covered" — tab আকারে।
- Bulk select → একসাথে অনেক product-কে plan-এ push, brief template সহ।
- In-transit ETA + PO link, product image gallery, quick view drawer।

## ২. Media Buying Hub
- Plan card-এ live economics: spend vs budget bar, break-even ROAS, projected vs actual profit।
- Actuals sync (ad spend + attributed orders) → variance badge।
- Timeline/Gantt ভিউ (start–end date), status pipeline, budget rollup by product/brand।

## ৩. Content Pipeline
- Kanban উন্নত: drag-and-drop stage move, WIP count, overdue highlight, swimlane by creator/product।
- Board / List / Calendar / Table — ৪টা ভিউ।
- Script Studio: version history, word/read-time, hook variants, checklist (hook, CTA, hashtag, caption)।
- Bulk actions (stage move, assign creator, due date), keyboard shortcuts।

## ৪. Creator CRM
- Creator profile drawer: contact log timeline, shipments, delivered content ও তার performance rollup (views/orders/cost per order)।
- Negotiation pipeline (prospect → contacted → negotiating → active → paused)।
- Rate card + follow-up reminders (due today / overdue badge), tags filter, rating।
- Leaderboard: best creators by cost-per-attributed-order।

## ৫. Agency Partners
- Agency profile drawer: linked creators, active briefs, spend to date, retainer vs commission cost।
- Service tag filter, rating, status, performance summary card।
- Agency ↔ content items rollup (delivered / pending / late)।

## ৬. Product ↔ Creator (Matching)
- Matrix ভিউ: product row × creator column, cell-এ shipment + content status।
- Suggested match: niche/platform/rate অনুযায়ী creator suggestion।
- Shipment tracker: sent → delivered → content received, overdue alert।
- Product-wise creator coverage KPI।

## Technical
- নতুন ফাইল: `src/components/erp/content/content-ui.tsx` (shared hero/KPI/toolbar/empty/table-to-card primitives)।
- `src/lib/erp/content/content-data.ts`-এ derived metric helper যোগ (risk score, ROAS, cost-per-order, coverage)।
- সব query React Query-তে, existing tables ব্যবহার করা হবে; নতুন কলাম লাগলে আলাদা migration দেওয়া হবে (যেমন pipeline drag order, script version)।
- প্রতিটা রুটে unique head() meta আপডেট থাকবে।

## ডেলিভারি ক্রম
1. Shared UI primitives + design pass
2. Intake, Pipeline (সবচেয়ে বেশি ব্যবহৃত)
3. Creator CRM, Matching
4. Media Buying Hub, Agencies
