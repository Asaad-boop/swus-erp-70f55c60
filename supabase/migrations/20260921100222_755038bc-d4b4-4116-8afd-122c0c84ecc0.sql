CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private._imp_has_any_role(_user uuid, VARIADIC _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user
      AND ur.role::text = ANY(_roles)
  )
$$;
REVOKE ALL ON FUNCTION private._imp_has_any_role(uuid, VARIADIC text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._imp_has_any_role(uuid, VARIADIC text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "staff manage variants" ON public.product_variants;
CREATE POLICY "staff manage variants" ON public.product_variants
FOR ALL TO authenticated
USING (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']))
WITH CHECK (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "staff manage products" ON public.products;
CREATE POLICY "staff manage products" ON public.products
FOR ALL TO authenticated
USING (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']))
WITH CHECK (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "staff read all products" ON public.products;
CREATE POLICY "staff read all products" ON public.products
FOR SELECT TO authenticated
USING (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "product-images staff delete" ON storage.objects;
CREATE POLICY "product-images staff delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "product-images staff insert" ON storage.objects;
CREATE POLICY "product-images staff insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "product-images staff list" ON storage.objects;
CREATE POLICY "product-images staff list" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "product-images staff update" ON storage.objects;
CREATE POLICY "product-images staff update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']))
WITH CHECK (bucket_id = 'product-images' AND private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

REVOKE EXECUTE ON FUNCTION public._imp_has_any_role(uuid, VARIADIC text[]) FROM authenticated;