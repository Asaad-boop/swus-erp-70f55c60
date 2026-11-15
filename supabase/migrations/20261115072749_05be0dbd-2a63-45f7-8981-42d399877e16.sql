ALTER FUNCTION public.staff_has_explicit_page(uuid,text[],uuid) SET SCHEMA private;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE OR REPLACE FUNCTION private.staff_has_explicit_page(_uid uuid, _pages text[], _brand uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _uid IS NOT NULL AND _uid = (SELECT auth.uid())
 AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid AND r.role <> 'customer'::public.app_role)
 AND EXISTS (
 SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=_uid
 AND sp.permissions->>'pageMode'='custom'
 AND COALESCE(sp.permissions->'allowedPages','[]'::jsonb) ?| _pages
 AND (sp.permissions->>'brandMode'='all' OR (_brand IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.user_brand_access ba WHERE ba.user_id=_uid AND ba.brand_id=_brand)))
 );
$$;
REVOKE ALL ON FUNCTION private.staff_has_explicit_page(uuid,text[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.staff_has_explicit_page(uuid,text[],uuid) TO authenticated,service_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e4aaecdb-e5de-45c0-855c-a89b5cbfd289',true);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'Assigned staff cannot read orders'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.order_items) THEN RAISE EXCEPTION 'Assigned staff cannot read products'; END IF;
 IF private.staff_has_explicit_page(auth.uid(),ARRAY['/erp/finance'],NULL) THEN RAISE EXCEPTION 'Finance access leaked'; END IF;
 IF private.staff_has_explicit_page(NULL,ARRAY['/erp/orders/list'],NULL) THEN RAISE EXCEPTION 'Anonymous access leaked'; END IF;
 IF private.staff_has_explicit_page('00000000-0000-0000-0000-000000000000',ARRAY['/erp/orders/list'],NULL) THEN RAISE EXCEPTION 'Another user can be probed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);