---
name: Marketing profit canonical source
description: All marketing surfaces (dashboard, campaigns, rollup, sku-pnl, meta-reports, performance) MUST derive delivered_revenue/COGS/opex from canonical Postgres RPCs. Do not hand-roll another cost calc in TS.
type: feature
---
## Canonical Postgres functions (created 2026-07-17)
- `mkt_delivered_line_costs(brand, from, to)` — atomic per-line rows, deterministic COGS fallback chain
- `get_campaign_profit(brand, from, to)` — aggregated per campaign
- `get_sku_profit(brand, from, to)` — aggregated per product (brand-scoped, dedup'd)

## Cost fallback chain (order-sensitive)
1. `NULLIF(order_items.unit_cost_snapshot, 0)` — 0 snapshot treated as missing
2. `product_variants.weighted_avg_cost`
3. `products.weighted_avg_cost`
4. `products.cost_price`
5. NULL → `cost_missing = true`, exposed as `cost_missing_units` count

## Late-added cost rule (2026-09-21)
Cost price পরে add হলে profit নিজে থেকে ঠিক হয়: snapshot 0/NULL হলে live WAC/cost_price fallback-এ যায়, আর `snapshot_order_item_profit_fields` ও `get_brand_profitability_rollup` দুটোই same fallback chain ব্যবহার করে। একবারের backfill-ও করা হয়েছে (0-snapshot items এ cost বসানো)।

## Revenue definition
`delivered_revenue = SUM(order_items.line_total)` for delivered orders in window. Excludes shipping/discount (which sit on `orders.total`). Per-item safe, no attribution double-count.

## Client helper
`src/lib/erp/marketing/canonical.server.ts` exports:
- `getCampaignProfitMap(supabase, brandId, from, to)`
- `getSkuProfitMap(supabase, brandId, from, to)`
- `getBrandProfitTotals(supabase, brandId, from, to)`

## Rules
- Every marketing surface uses these helpers for delivered_revenue/COGS/opex.
- Confirmed metrics (pre-delivery) stay attribution-based (leading indicator) — canonical only handles delivered.
- Ad spend still comes from `get_meta_spend_bdt` RPC (unchanged).
- Never reference `order_items.cost_price` (column doesn't exist — silent no-op).
- Surface `cost_missing_units` in UI as a "cost data incomplete" badge when > 0.
