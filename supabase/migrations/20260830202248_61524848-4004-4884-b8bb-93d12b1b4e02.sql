REVOKE EXECUTE ON FUNCTION public.inv_wac_calc(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_recompute_wac(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_cost_drift() FROM anon;
REVOKE ALL ON public.inv_missing_cost FROM anon;