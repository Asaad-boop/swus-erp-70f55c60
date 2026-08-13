GRANT EXECUTE ON FUNCTION public.mkt_product_perf(uuid[], date, date) TO postgres, anon;
GRANT EXECUTE ON FUNCTION public.mkt_acquisition(uuid[], date, date) TO postgres, anon;
REVOKE EXECUTE ON FUNCTION public.mkt_product_perf(uuid[], date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mkt_acquisition(uuid[], date, date) FROM anon;