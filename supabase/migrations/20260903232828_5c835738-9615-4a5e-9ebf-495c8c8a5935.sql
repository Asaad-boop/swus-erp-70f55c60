REVOKE ALL ON FUNCTION public.mkt_meta_spend_summary(uuid[], date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mkt_meta_spend_summary(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.mkt_meta_spend_summary(uuid[], date, date) TO authenticated, service_role;