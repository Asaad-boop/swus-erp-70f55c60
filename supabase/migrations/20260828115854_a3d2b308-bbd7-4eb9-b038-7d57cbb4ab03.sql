REVOKE ALL ON FUNCTION public.erp_sync_return_cases_for_order(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_orders_autocreate_return_case() FROM anon, authenticated;