---
name: Marketing ROAS ladder
description: The four ROAS stages (Meta → Booked → Confirmed → Delivered) and the 5-tab marketing layout. Use roas-ladder.ts for any ROAS shown in marketing; do not add another ROAS variant.
type: feature
---
## Four stages, one formula (`src/lib/erp/marketing/roas-ladder.ts`)
Every stage = value ÷ ad spend (BDT), via `calcRoas`.
1. Meta ROAS — `meta_purchase_value` (pixel claim, platform view)
2. Booked ROAS — `booked_value`: all ERP orders matched to the campaign (UTM / fb campaign id)
3. Confirmed ROAS — `confirmed_value`: booked orders confirmed or moved forward (cancel/fake excluded)
4. Delivered ROAS — `delivered_order_value`: actually delivered. Decision number; only this one is coloured.

ERP stages are an order-date cohort with current status (from `mkt_campaign_truth` / `mkt_campaign_cash`), so recent windows show Delivered < Confirmed while parcels are in transit. `expectedDeliveredRoas` estimates the final number using the delivery success rate of a matured window (days −37…−8); always labelled as an estimate, never used for verdicts or profit.

## Decisions
`campaignDecision`: the cash verdict from `getCampaignTruth` wins when mature (scale/keep/watch/pause). Only while too early does it compare expected delivered ROAS with the campaign's breakeven ROAS (early_good / early_weak).

## Layout (5 tabs, old URLs unchanged)
Today (`/erp/marketing`) · Campaigns (`/truth`) · Insights (`/attribution`, `/audit`, `/products`, `/reports`) · Plan & Alerts (`/calendar`, `/alerts`) · Setup (`/settings`, `/channels`).
Grouping lives in `MARKETING_NAV` (marketing-shell.tsx) and `NavItem.activeFor` (nav.ts). Grouped pages stay grantable through `HIDDEN_PAGES` in page-catalog.ts.
