# Roadmap

## Campaign Profit Truth (cash-based campaign profitability)
- [ ] Extend `mkt_campaign_truth` RPC: booked/cancelled/confirmed/delivered/returned counts + values, collected_amount, collection_variance, return_charge, attribution source, coverage metrics
- [ ] Realized (cash) vs Projected (pipeline) profit — strictly separated
- [ ] Collected amount from courier settlement/reconciliation + advance; "Pending Reconciliation" instead of ৳0
- [ ] Return/RTO charge from `erp_courier_settlement_lines` → fallback `erp_courier_settings`; COGS reversal only for resellable returns
- [ ] Single primary attribution per order (manual override → linked → fb_campaign_id → utm ids → pixel → product inference), no double counting
- [ ] Auto product suggestion (🤖 Auto Suggested + confidence) with Confirm / Replace / Unlink; ✋ Manual badge
- [ ] Verdict rules: Profitable / Break-even / Losing / Too Early (data-completeness aware)
- [ ] Truth Coverage % (attribution, settlement, COGS, courier)
- [ ] Cancelled = Unrealized Booked Value (not cash loss)
- [ ] Campaign ad spend deducted once; order-level allocated ad cost informational only
- [ ] UI: flat Midnight Indigo table + drawer (funnel, profit ladder, reconciliation, returns, products, attribution, drill-through, trend, coverage, notes)
- [ ] New server fns `getCampaignOrders`, `autoLinkCampaignProducts` (requireSupabaseAuth)
- [ ] Verify 12 realistic scenarios (cancel, partial delivery, RTO, damaged return, missing settlement, manual override, multi-campaign match…)
- [ ] Deterministic attribution rank CTE (priority ASC, confidence DESC, attributed_at DESC, campaign_id ASC) — never bare DISTINCT ON(order_id)
- [ ] Missing financial data stays NULL/Pending (never coalesced to 0)
- [ ] Item-level partial delivery / partial return support where order data allows
- [ ] Surface (not silently work around) any schema/business-rule conflict with this spec
