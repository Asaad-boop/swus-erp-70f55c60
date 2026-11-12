# Project Memory

## Core
একটা number = একটা source = একটা formula — সব report canonical layer থেকে; কোনো tab/page-এ inline calculation নয়।
Date/time/range picker সবসময় advanced variant — basic single-date shadcn default কখনই না। Presets sidebar + typeable From/To + "last N days" custom + month/year dropdown nav + 2-month range calendar. Ref: src/components/erp/marketing/date-range-picker.tsx

## Memories
- [Marketing ROAS ladder](mem://features/marketing-roas-ladder) — Meta → Booked → Confirmed → Delivered ROAS from one helper (`roas-ladder.ts`); Delivered is the decision number; 5-tab marketing layout.
- [Marketing profit canonical source](mem://features/marketing-canonical-profit) — 3 Postgres RPCs (`mkt_delivered_line_costs`, `get_campaign_profit`, `get_sku_profit`) + `src/lib/erp/marketing/canonical.server.ts` helpers. All marketing surfaces MUST use these for delivered_revenue/COGS/opex.
- [Reporting canonical rules](mem://features/reporting-canonical-rules) — Reports Hub registry, reconciliation chain, period close, monthly archive PDF
