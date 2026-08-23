REVOKE EXECUTE ON FUNCTION public.mkt_attribution_audit(uuid[], date, date, uuid, text, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_budget_pacing(uuid[], date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_product_match_suggestions(uuid, date, date, int) FROM PUBLIC, anon;