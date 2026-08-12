# Marketing Module — Full Build-out

Ekhon ja ache: Marketing Overview (aajker snapshot), Daily performance page, Meta sync (account/campaign/adset/ad/insights), FIFO dollar wallet, attribution candidates, canonical profit RPCs (`get_campaign_profit`, `get_sku_profit`, `mkt_delivered_line_costs`), Reports Hub-e ad-level panel.

Ja nei: creative layer, funnel, UTM explorer, acquisition/LTV, budgets, calendar, experiments, alert engine, marketing settings hub, multi-channel (Google/TikTok).

Sob kaj canonical RPC-r upor hobe — notun kore cost/revenue calc TS-e likha hobe na.

## Phase 1 — Marketing Home (dashboard je sob metric chaiche)

`/erp/marketing` ke ekta full dashboard banano hobe, date-range picker soho (advanced variant):
- KPI row: Ad Spend, Revenue, Delivered Revenue, Orders, ROAS, Delivered ROAS, MER, CAC/CPA, AOV, Conversion Rate, Gross Profit, Contribution Profit, Marketing Cost %, Return Rate, Cancel Rate
- Trend chart (spend vs delivered revenue vs ROAS), Day/Week/Month grain
- Channel split card + top campaigns / top products / top ads mini-tables
- Prottek KPI-r pashe definition tooltip (metric dictionary theke)

Notun RPC: `mkt_dashboard_kpis(brand_ids, from, to)` + `mkt_dashboard_trend(...)`.

## Phase 2 — Campaign / Ad Set / Ad workspace

Notun page `/erp/marketing/campaigns` — 3-level drilldown table (campaign → adset → ad):
- Objective, budget, spend, orders, delivered revenue, ROAS, contribution ROAS, CPA, status
- Target ROAS / Target CPA per campaign (notun column, editable) + target vs actual badge
- Product/SKU mapping (`mkt_campaign_products` already ache), audience, landing page, UTM display
- Bulk brand assign for unassigned campaigns

## Phase 3 — Creative Library

Notun table `mkt_creatives` (creative_id, thumbnail, type, hook, angle, creator, product, status) + ad theke auto-pull.
Page `/erp/marketing/creatives`: grid + table view, CTR/CPC/CPA/ROAS/revenue/frequency per creative, "Winning" / "Fatigued" badge (rule: frequency > 3 ba CTR 7d ↓30% vs 30d).

## Phase 4 — UTM, Attribution & Funnel

- `/erp/marketing/attribution`: source/medium/campaign/content/term breakdown, landing page performance, first-touch vs last-touch toggle, order + revenue attribution, pending candidate queue clear korar UI
- Funnel panel: Impressions → Reach → Clicks → LPV → ATC → Checkout → Order → Confirmed → Shipped → Delivered, prottek step-e conversion % o drop-off %

## Phase 5 — Product Marketing & Customer Acquisition

- `/erp/marketing/products`: per-SKU spend, orders, revenue, COGS, packaging, courier, return cost, discount, marketing cost, contribution profit, profit/order, ROAS, contribution ROAS (canonical `get_sku_profit` + courier/return cost join)
- `/erp/marketing/acquisition`: new vs returning, CAC, first order value, repeat rate, LTV, LTV:CAC, acquisition source, segment

## Phase 6 — Budgets, Calendar, Experiments

- `mkt_budgets`: daily/monthly planned spend, actual, remaining, utilization %, target revenue/ROAS, scaling status (Scale / Hold / Kill)
- `mkt_calendar_events`: campaign launch, product launch, offer, shoot, creative deadline, retargeting, seasonal — month calendar view
- `mkt_experiments`: test type (creative/hook/offer/price/audience/LP/product), hypothesis, variants, result, winner, decision

## Phase 7 — Marketing Intelligence (alerts)

`mkt_alerts` + nightly evaluator (existing cron route-e chalabo):
ROAS drop, CPA increase, creative fatigue, high frequency, overspending vs budget, low conversion, low stock + active ad, high return + active ad; plus scale/kill/budget recommendation. Dashboard-e alert strip + dedicated page.

## Phase 8 — Reports & Settings

- `/erp/marketing/reports`: daily/weekly/monthly marketing report, campaign, product, creative, channel, acquisition, funnel, profitability — sob Excel/CSV export soho (Reports Hub export kit reuse)
- `/erp/marketing/settings`: ad accounts, pixel, Conversion API, UTM rules, attribution rules (window + priority), marketing cost rules, channel mapping, product mapping, campaign naming convention, permissions

## Phase 9 — Google Ads + TikTok Ads (optional, last)

Channel abstraction (`mkt_ad_accounts.platform`) already partially ache — Google/TikTok connector + sync add kora hobe. Eta shesh-e, karon oi API-r credential lagbe.

## Technical notes
- Sob heavy aggregation Postgres RPC-te (`mkt_*` prefix), TS-e sudhu render
- Delivered/COGS shob shomoy canonical helper theke (mem rule)
- Date range picker sob page-e advanced variant
- Server functions `*.functions.ts` thin wrapper, logic `.server.ts`-e
- Notun table-e GRANT + RLS (brand-scoped, `get_user_brand_ids`)

## Suggestion
Ek reply-te sob hobe na. Ami Phase 1 diye shuru korbo, tarpor ek ek kore agabo — prottek phase-er por tumi dekhe feedback dio.
