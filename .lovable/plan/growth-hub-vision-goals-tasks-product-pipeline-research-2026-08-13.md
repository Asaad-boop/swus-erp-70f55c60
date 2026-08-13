# Growth Hub — Vision, Goals, Tasks, Product Pipeline & Research

## এই project-এই করা উচিত, আলাদা project-এ না

কারণ:
- Product, brand, stock, order, marketing spend, profit — সব data এখানেই আছে। Forecast ("এই product-এ কত sale/profit হতে পারে"), best-seller ranking, content-after-stock-arrival trigger — এগুলো ওই data ছাড়া শুধু খালি form হয়ে যাবে।
- Auth, roles, brand access, page-permission, sidebar, design system সব ready — আলাদা project মানে সব আবার বানানো + দুই জায়গায় login।
- Team voting, task assign — user list এখানেই।

আলাদা project তখনই দরকার হতো যদি বাইরের লোক (agency/influencer) কে access দিতে হতো। সেটা পরে public share-link দিয়েই সমাধান করা যায়।

তাই: sidebar-এর **Growth** group-এ নতুন module `/erp/hub` (Growth Hub), Marketing-এর পাশে।

## Structure (sub-nav সহ, marketing-shell-এর মতো)

```text
/erp/hub                → Command Center (vision, goal progress, today's tasks, alerts)
/erp/hub/goals          → Vision + OKR/Goals (quarterly/monthly, KPI auto-linked)
/erp/hub/tasks          → Task board (kanban + my-day list + calendar view)
/erp/hub/products       → Product Pipeline (idea → vote → forecast → order → launch)
/erp/hub/content        → Content Journey (per product content plan + influencer/review)
/erp/hub/research       → Swipe file + Competitor tracker
/erp/hub/planning       → Monthly revenue/profit projection (best-seller based)
```

## Phase 1 — Foundation + Goals + Tasks

Tables (brand-scoped, RLS + GRANT):
- `hub_goals` — vision/objective/key-result, parent_id (nesting), period, target/current value, metric_key (revenue, delivered_revenue, roas, orders, profit…), owner, status. Metric-linked goal-এর current value auto আসবে existing reporting RPC থেকে।
- `hub_tasks` — title, details, brand, assignee, due_date, priority, status (backlog/todo/doing/blocked/done), goal_id, link_type+link_id (product/campaign/PO/order), recurrence (daily/weekly), checklist jsonb, tags.
- `hub_comments` — যেকোনো hub entity-তে comment (entity_type + entity_id)।

UI: Command Center (goal progress rings, today's + overdue task, quick add), Goals page (tree + progress bar + auto/manual KR), Task board (drag kanban, my-day, calendar, recurring auto-spawn nightly cron-এ)।

## Phase 2 — Product Pipeline + Voting

- `hub_product_ideas` — title, image_url(s), source_url, supplier link, est. cost, est. sell price, category, brand, notes, added_by, status (idea → voting → approved → sourcing → ordered → launched → rejected)।
- `hub_idea_votes` — user_id + idea_id + vote (up/down) + comment। এক user এক vote।
- `hub_idea_forecast` — expected monthly units, price, unit cost, ad cost/order, courier + return %, packaging → auto contribution profit, breakeven ROAS, payback। Existing product-এর actual cost structure default হিসেবে টানবে।
- Approved idea থেকে এক ক্লিকে Import PO / Local PO draft তৈরি (existing `imp_purchase_orders` / `local_purchase_orders` ফ্লো)।
- Quick-add: paste URL → title/image auto-fill (Firecrawl scrape server function)। Browser extension এই phase-এ না — বদলে একটা bookmarklet + `/api/public/hub/idea` token-protected endpoint দেব, extension পরে ওই endpoint reuse করবে।

## Phase 3 — Content Journey (stock-triggered)

- `hub_content_plans` — product_id, brand, launch_date, angle/hook, platform (FB/IG/TikTok/YT), asset type (photoshoot/UGC/reel/review), owner, budget, status, deadline।
- `hub_creators` — reviewer/influencer: name, handle, follower, niche, rate, past performance note, contact।
- `hub_content_assignments` — plan × creator: agreed budget, deliverable, deadline, status (briefed/shooting/delivered/posted), actual cost, result link।
- Auto-trigger: PO carton/quantity release হয়ে stock এলে ওই product-এর জন্য "Content plan দরকার" task auto-create।
- Budget total → marketing manual expense-এ পাঠানোর অপশন (existing `mkt_manual_expenses`)।

## Phase 4 — Research: Swipe file + Competitors

- `hub_swipes` — saved content: url, platform, thumbnail, type (ad/organic/landing/creative), tags, why-it-works note, linked product/brand, "recreate" → এক ক্লিকে content plan/task।
- `hub_competitors` — page name, platform, url, brand relevance, note, follower/price-range snapshot, last checked।
- `hub_competitor_snapshots` — manual/scraped snapshot (Firecrawl): title, price, offer, screenshot; over-time compare।

## Phase 5 — Monthly Projection

`/erp/hub/planning`: existing sales + profit RPC থেকে গত ৩ মাসের actual টেনে product-wise run-rate → এই মাসের projected revenue/profit; editable override; goal-এর সাথে gap দেখাবে; best-seller ranking + "stock ফুরাবে কবে" warning; scenario slider (ad spend ↑ হলে projection)।

এর সাথে **Monthly sourcing target** — এই মাসে কয়টা নতুন product আনতে হবে, মোট কত quantity order দিতে হবে, কত টাকার order। Target vs actual (real PO data থেকে) progress bar। প্রতিটি planned product-এর জন্য quantity × price × cost → projected sell-through, revenue, profit; সব মিলিয়ে মাসের মোট projected profit।

## Technical notes
- সব নতুন table `hub_` prefix, brand-scoped RLS `get_user_brand_ids()` + GRANT, `hub_` RPC-তে ভারী aggregation।
- Server fn `*.functions.ts` thin wrapper, logic `.server.ts`-এ।
- Date range picker সব জায়গায় advanced variant; profit/revenue সবসময় canonical marketing/reporting helper থেকে — নতুন করে cost হিসাব লিখব না।
- Sidebar Growth group-এ "Growth Hub" section + page-permission catalog-এ সব route।

## Suggestion
এক reply-তে সব হবে না। Phase 1 (Goals + Tasks + Command Center) দিয়ে শুরু করব, তারপর তোমার feedback নিয়ে এক এক করে Phase 2 → 5।
