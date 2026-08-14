# Content Module — ৬ Screen Full Build

স্পেকটা reference হিসেবে নিচ্ছি — hubhub-এর existing Growth Hub style (glass toolbar, KPI tile, stage chip, mobile bottom-sheet filter) দিয়েই বানাবো, hubhub copy না।

আলাদা একটা **Content** module বানাবো (`/erp/content/*`) নিজস্ব subnav সহ — ৬টা screen। বর্তমান Creative Desk (`/erp/hub/content`) এর data (plans, creators, assignments) নতুন module-এ migrate + extend হবে, পুরনো route নতুনটায় redirect করবে।

## Screens

**1. Stock → Content Intake** (`/erp/content/intake`)
- Sourcing/import PO থেকে `in_transit` + `in_stock` product auto-feed (ordered PO = in transit, received/stock>0 = in stock)
- প্রতিটা product-এ live idle timer: "3d 14h in stock · 0 content" — green <24h, amber <72h, red পরে
- "Push to plan" → Content Plan তৈরি (কয়টা content, target date, content budget, strategy note)
- Plan-এর প্রতিটা content item: type (UGC/reel/static/unboxing/review), angle, hook, script, CTA, source (in-house/creator/agency), creator, due date, cost, status
- Status flow: briefed → shooting → editing → submitted → in_review → approved → published; reject-এ revision note বাধ্যতামূলক

**2. Media Buying Hub** (`/erp/content/media-plans`)
- Plan header: target qty, selling price, ad budget, content budget, creator budget, channels, audience, start/end date
- Live metrics: target vs achieved revenue, spend, budget left, ROAS, CPA, unit ও spend progress bar (marketing canonical RPC থেকে actuals)
- Brief section: creator/agency deliverable — hook, script, CTA, reference link, type, due date, cost, approval status (pending/briefed/in_review/revision/approved/rejected)

**3. Content Pipeline** (`/erp/content/pipeline`)
- ৫-stage kanban: Ideation → Create/Shoot → Editing → Published → Performance
- Card: content code (CNT-0001), product thumb, creator, hook, deliverable type, due date
- Published/Performance stage-এ views, likes, comments, shares; dropdown দিয়ে stage change (drag ও থাকবে desktop-এ)

**4. Creator CRM** (`/erp/content/creators`)
- name, handle, platform, niche, followers, email/phone, charges, negotiation status, contact history (timeline log), shipping address, parent agency
- Roster grid + detail sheet; existing `hub_creators` extend করে

**5. Agency Partners** (`/erp/content/agencies`)
- contact person, services, retainer fee, commission %, rating, status, notes; creator-এর সাথে link

**6. Product ↔ Creator Matching** (`/erp/content/matching`)
- Matrix view: কোন creator কোন product নিয়ে কাজ করছে
- Shipment tracking: product কাকে পাঠানো হয়েছে (courier, tracking no, sent date, status: pending/shipped/delivered/returned)
- ওই shipment থেকে কী content বের হলো — linked content items + performance

## Flow / Auto-sync
```text
Sourcing (in transit / in stock)
  → Intake auto row + idle timer
  → Content Plan (qty, budget, angle)
  → Creator/Agency assign + brief
  → Pipeline stage move
  → Published → performance metrics
  → Media Plan ROAS/CPA rollup → Creatives leaderboard
```
- Intake → Pipeline auto-sync: content item তৈরি হলেই pipeline card auto তৈরি (একই row, stage derived) — আলাদা duplicate table না
- Product Scraping (`hub_product_ideas` swipe/reference links) → Intake ও Brief-এ "Inspiration" panel হিসেবে দেখাবে

## Technical
- Migration: `content_plans`, `content_items`, `content_briefs`, `content_agencies`, `content_creator_shipments`, `creator_contact_log`; `hub_creators`-এ agency_id/charges/negotiation_status/address/email columns; media plan fields। প্রতিটা নতুন public table-এ GRANT + RLS (authenticated brand-scoped, service_role all)।
- Idle timer + intake feed একটা RPC `content_intake_feed(_brand_ids)` — imports PO + products stock থেকে derive, first_content_at সহ
- Media plan actuals canonical marketing RPC (`get_campaign_profit`/`mkt_delivered_line_costs`) থেকেই আসবে — hand-rolled cost calc না
- Data layer `src/lib/erp/content/*`, shared UI `src/components/erp/content/*`, subnav `ContentSubnav`
- Existing Creative Desk data migrate: `hub_content_plans` → `content_plans`, `hub_content_assignments` → `content_briefs`; `/erp/hub/content` → `/erp/content/pipeline` redirect, Hub subnav-এ Creative entry নতুন module-এ point করবে
- সব route-এ নিজস্ব `head()` SEO meta; mobile-first (scrollable chips, bottom-sheet filters)

## Build order
1. Migration + data layer + subnav shell
2. Intake + Plan builder
3. Pipeline kanban
4. Creator CRM + Agencies
5. Media Buying Hub
6. Matching + shipments + inspiration panel
