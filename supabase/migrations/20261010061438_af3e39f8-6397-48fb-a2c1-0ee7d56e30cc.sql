ALTER VIEW public.crm_customers_v SET (security_invoker = true);
REVOKE ALL ON public.crm_customers_v FROM anon;
REVOKE ALL ON public.crm_customers_mv FROM anon;