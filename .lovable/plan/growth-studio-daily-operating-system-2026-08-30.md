# Growth Studio — Daily Operating System

Growth Studio ekhon beshi "plan + content" heavy. Ei plan e ota ke **daily growth operating system** banano hobe: aajker target, aajker actual, Meta ads performance, content schedule, ar repeat / cross-sell / up-sell er kaaj — sob ek jaygay, daily rhythm e.

## 1. Daily Cockpit (Command Center rebuild — `/erp/growth`)

Top e ekta **Today strip** (Asia/Dhaka):

- Orders today vs required/day, Delivered revenue today, Ad spend today, Contribution today, ROAS today
- Prottek tile e month-goal er against **pace bar**: "aaj dorkar X, hoyeche Y, ghatti Z"
- Required/day = (month goal − month-to-date actual) ÷ baki din

Er niche 4 ta column-block:

- **Aajker Task** — Task Board theke due/overdue task, ek click e done
- **Aajker Content** — aaj shoot/edit/publish due content item
- **Ads pulse** — top 3 spending campaign, kar ROAS niche threshold
- **Alerts** — pacing miss, ROAS drop, missing cost, overdue task

Data na thakle section hide.

## 2. Meta Ads Performance panel (Growth-e read-only view)

Marketing module er canonical RPC (`mkt_dashboard_kpis`, `get_campaign_profit`) reuse kore Growth e ekta compact panel:

- Spend today / 7d / 30d + trend sparkline
- Blended ROAS, Delivered ROAS, break-even ROAS line
- Campaign leaderboard: spend, delivered revenue, ROAS, contribution — winner/loser color
- Sync status + last sync time; token error thakle inline warning

Notun calculation na — sob marketing canonical source theke.

## 3. Retention Desk (notun tab `/erp/growth/retention`)

Orders + customers theke Asia/Dhaka window e:

- **Repeat rate**, new vs returning customer, average orders/customer, repeat gap (din)
- **Winback list** — 45/60/90 din order nei emon delivered customer, phone + last product, CSV export
- **Repeat champions** — 2+ order kora customer, LTV soho
- Prottek row theke ek click e call/SMS action (existing bulk SMS use kore)

## 4. Cross-sell / Up-sell Desk (same tab, second section)

- **Frequently bought together** — order_items theke product-pair co-purchase count (top 20 pair)
- Prottek product er jonno "eta kinle eta o kine" suggestion list
- **Basket lift** — AOV with vs without attach
- Ei suggestion gulo Create Order er Upsell picks er sathe consistent thakbe (already co-purchase based)

## 5. Content Schedule (calendar view)

Content Pipeline e ekta **Calendar** toggle:

- Month grid, prottek din e scheduled/publish-due content chip (creator + platform)
- Drag na — click kore date change korar dialog
- "Aaj publish korar kotha" count Daily Cockpit e feed kore

## 6. Task rhythm

- Task Board e **Today / This week / Overdue** quick filter + recurring routine auto-generate (routines already ache, oke task e feed korano hobe)
- Person-wise load: kar kotota open task, ke better perform korche (7/30 din completion rate) — Weekly Scorecard e "People" block

## Technical notes

- Notun server fn: `src/lib/erp/growth/daily.functions.ts` (today+pace KPIs), `retention.functions.ts` (repeat/winback/co-purchase) — thin wrappers, logic alada `.server.ts` e.
- Marketing numbers strictly canonical RPC theke (memory rule), hand-rolled cost calc na.
- Sob date Asia/Dhaka boundary te.
- Notun route: `erp.growth.retention.tsx` + GROWTH_NAV e "Retention & Upsell" (group: People & Market).
- Existing tab gulo intact thakbe; Command Center rebuild hobe.

## Order of work

1. Daily Cockpit + pace math
2. Meta Ads panel
3. Retention + Cross-sell desk
4. Content calendar + task rhythm/people block
