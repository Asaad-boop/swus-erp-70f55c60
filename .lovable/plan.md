# Growth Studio → Growth Operating System

Growth Studio-কে ১৩টা পেজ থেকে **৮টা** পেজে নামিয়ে এনে "intelligence layer" বানাবো — DATA → INSIGHT → DECISION → ACTION। নতুন product/order/campaign data model বানাবো না; ERP-র existing table আর canonical RPC-ই ব্যবহার করবো।

## নতুন নেভিগেশন (৮টা)

| # | পেজ | কোথা থেকে আসছে |
|---|---|---|
| 1 | Command Center | index (rebuild) |
| 2 | Goals & Plan | goals + planning merge |
| 3 | Product Lab | products + sourcing link |
| 4 | Content Engine | intake + pipeline + creators + agencies merge |
| 5 | Media Center | media-plans + campaign/creative perf |
| 6 | Growth Lab | নতুন (experiments + learning DB), retention এখানে ঢুকবে |
| 7 | Market Intelligence | rivals + product opportunity |
| 8 | Analytics | report (rebuild) + funnel |

পুরনো path গুলো (`/erp/growth/intake`, `/pipeline`, `/creators`, `/agencies`, `/retention`, `/matching`, `/routines`, `/report`, `/planning`) redirect করে নতুন পেজ+ট্যাবে পাঠাবো — কোনো dead link থাকবে না। Sidebar (`src/lib/erp/nav.ts`) আর `growth-shell.tsx` দুটোতেই ৮টা আইটেম।

## প্রতিটা পেজে কী থাকবে

**1. Command Center** — গ্লোবাল brand + date filter (Today/Yesterday/7d/30d/This month/Custom, advanced range picker)। KPI স্ট্রিপ: Revenue, Orders, Profit, Ad Spend, CPA, ROAS, AOV, CVR + previous-period % change। তারপর: Goal Progress (target/achieved/remaining/required-per-day/forecast), Top Winners (product, creative, campaign, content, highest-profit), Problems (Critical/Warning/Info), Opportunities, Today's Action (assign/priority/deadline/complete — `hub_tasks`-এ লেখে), Growth Score /100 with strength/weakness/opportunity।

**2. Goals & Plan** — Yearly/Quarterly/Monthly/Weekly goal (revenue, orders, profit, new customers, content, ad spend) target vs actual vs required pace। Forecast: Best / Expected / Worst, run-rate + historical pace থেকে। Monthly Projection planner এখানেই ট্যাব হিসেবে থাকবে (existing manual-planner reuse)।

**3. Product Lab** — pipeline IDEA→RESEARCH→SOURCING→SAMPLE→TEST→LAUNCH→VALIDATE→SCALE→WINNER (existing `hub_product_ideas` stage গুলো এই সেটে map করবো)। প্রতি প্রোডাক্টে live performance (sales/orders/revenue/profit/CPA/ROAS/return/stock/daily sales) canonical RPC থেকে। Product Health Score /100 + কারণ। Product 360 drawer: Content → Ads → Orders → Revenue → Profit চেইন, best creative/campaign/hook/offer, unit economics (break-even CPA, safe CPA, SAFE/WATCH/LOSS)।

**4. Content Engine** — Kanban IDEA→SCRIPT→SHOOT→EDIT→REVIEW→READY→PUBLISHED। Content request form (product, objective, hook, brief, type, creator, deadline, priority)। Content Library (views/CTR/orders/revenue/CPA/ROAS)। Creative Intelligence: best creative/hook/creator/format/combo + **Make more like this** → নতুন content task। Creator profile: rate, spend, orders, revenue, avg CPA, performance score।

**5. Media Center** — Campaign টেবিল spend/orders/revenue/CPA/ROAS/profit + SCALE/WATCH/STOP verdict (ROAS নয়, break-even CPA-র ভিত্তিতে)। Creative performance compare। Budget pacing: monthly budget, spent, remaining, daily spend, recommended daily, Under/On/Over pace।

**6. Growth Lab** — Experiment CRUD: hypothesis, product, variable, A, B, budget, dates, result, winner, learning + APPLY WINNER। Learning Database (reusable insight list, tag/search)। Retention & upsell existing view এখানে ট্যাব।

**7. Market Intelligence** — Competitor watch (competitor, product, price, offer, content, ads, new launches) — existing `hub_competitors`/`hub_competitor_assets` reuse। Product Opportunity Score /100 (demand, competition, margin) + recommendation।

**8. Analytics** — Business / Marketing / Product / Content ট্যাব + Funnel (Impression→Click→LP→Checkout→Order→Confirmed→Delivered) প্রতি ধাপে CVR আর সবচেয়ে বড় drop হাইলাইট।

## Alert Engine

একটাই server-side rule engine (`growth-intel.server.ts`) সব alert তৈরি করবে: CPA spike, ROAS drop, sales drop, profit drop, low stock, return rate up, creative fatigue, campaign overspend, target behind, winning product, winning creative। প্রতি alert-এ **Problem / Why / Recommended action** + এক ক্লিকে task বানানো। Command Center-এর Problems + Opportunities এই engine থেকেই আসে — কোনো বানানো "AI insight" না, প্রতিটা number underlying query থেকে traceable। ডাটা কম হলে "Insufficient data" দেখাবে, card লুকাবে না-থাকা মান দিয়ে ভরবে না।

## ডেটা লেয়ার

- Money/profit সব canonical source থেকেই: `mkt_delivered_line_costs`, `get_campaign_profit`, `get_sku_profit`, `growth_day_pulse`, `get_meta_spend_bdt`। নতুন করে cost math লিখবো না।
- নতুন DB object দরকার হবে সামান্য: `hub_experiments` + `hub_learnings` টেবিল (Growth Lab), আর কয়েকটা read-only RPC (command center rollup, product health, funnel)। প্রতিটায় GRANT + RLS staff-scoped।
- Brand + date filter সব server function-এ প্যারামিটার হিসেবে যাবে।

## ডিজাইন

Existing ERP design token-ই (Midnight Indigo / Quiet Precision), flat + border, shadow নেই, gradient নেই, বড় chart নেই। Status color: সবুজ = scale, হলুদ = watch, লাল = stop, নীল = info। Desktop-first, কিন্তু mobile-এ সব পেজ responsive।

## ফেজ ভাগ

1. Navigation + shell + redirect + Command Center (KPI, goal, winners, problems, opportunities, actions, growth score)
2. Goals & Plan, Analytics (+funnel)
3. Product Lab (health score, 360 drawer, unit economics)
4. Content Engine (kanban, library, creative intelligence, creators)
5. Media Center + Growth Lab + Market Intelligence
6. Alert engine tuning, mobile pass, পুরনো ফাইল ক্লিনআপ

প্রতিটা ফেজের শেষে typecheck + preview verify করবো।
