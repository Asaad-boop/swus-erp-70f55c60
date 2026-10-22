CREATE OR REPLACE FUNCTION public.get_courier_creds(_provider text, _brand_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(brand_id uuid, base_url text, client_id text, client_secret text, username text, password text, store_id text, api_key text, secret_key text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'operations'::app_role)
    OR has_role(auth.uid(), 'customer_service'::app_role)
    OR has_role(auth.uid(), 'warehouse_staff'::app_role)
    OR has_role(auth.uid(), 'packer'::app_role)
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT s.brand_id, s.base_url, s.client_id, s.client_secret, s.username, s.password,
         s.store_id::text, s.client_id AS api_key, s.client_secret AS secret_key, s.is_active
  FROM public.erp_courier_settings s
  WHERE s.provider = _provider AND s.is_active = true;
END;
$function$;