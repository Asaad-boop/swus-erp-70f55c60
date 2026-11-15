CREATE OR REPLACE FUNCTION public.staff_has_explicit_page(_uid uuid, _pages text[], _brand uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _uid IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid AND r.role <> 'customer'::public.app_role)
 AND EXISTS (
 SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=_uid
 AND sp.permissions->>'pageMode'='custom'
 AND COALESCE(sp.permissions->'allowedPages','[]'::jsonb) ?| _pages
 AND (sp.permissions->>'brandMode'='all' OR (_brand IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.user_brand_access ba WHERE ba.user_id=_uid AND ba.brand_id=_brand)))
 );
$$;
REVOKE ALL ON FUNCTION public.staff_has_explicit_page(uuid,text[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_has_explicit_page(uuid,text[],uuid) TO authenticated,service_role;
CREATE POLICY "Custom order pages read orders" ON public.orders FOR SELECT TO authenticated
USING (public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new'],brand_id));
CREATE POLICY "Custom order pages read order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_items.order_id AND public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new'],o.brand_id)));
CREATE POLICY "Custom order pages read notes" ON public.order_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_notes.order_id AND public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new'],o.brand_id)));
CREATE POLICY "Custom order pages read status history" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_status_history.order_id AND public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new'],o.brand_id)));
CREATE POLICY "Custom web orders read carts" ON public.abandoned_carts FOR SELECT TO authenticated
USING (public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/orders/web'],brand_id));
CREATE POLICY "Custom inventory page read stock history" ON public.stock_movements FOR SELECT TO authenticated
USING (public.staff_has_explicit_page((SELECT auth.uid()),ARRAY['/erp/inventory'],brand_id));
-- Read-only acceptance checks run as the affected employee, without granting any role.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e4aaecdb-e5de-45c0-855c-a89b5cbfd289',true);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'Assigned staff still cannot read orders'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.order_items) THEN RAISE EXCEPTION 'Assigned staff still cannot read order products'; END IF;
 IF public.staff_has_explicit_page(auth.uid(),ARRAY['/erp/finance'],NULL) THEN RAISE EXCEPTION 'Unassigned finance page granted'; END IF;
 IF public.staff_has_explicit_page(NULL,ARRAY['/erp/orders/list'],NULL) THEN RAISE EXCEPTION 'Anonymous access granted'; END IF;
 IF public.staff_has_explicit_page('00000000-0000-0000-0000-000000000000',ARRAY['/erp/orders/list'],NULL) THEN RAISE EXCEPTION 'Unknown user access granted'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);