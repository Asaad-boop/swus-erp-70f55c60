DROP POLICY IF EXISTS "product-images admin insert" ON storage.objects;
DROP POLICY IF EXISTS "product-images admin update" ON storage.objects;
DROP POLICY IF EXISTS "product-images admin delete" ON storage.objects;
DROP POLICY IF EXISTS "staff list product-images" ON storage.objects;

CREATE POLICY "product-images staff insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND _imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

CREATE POLICY "product-images staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND _imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']))
WITH CHECK (bucket_id = 'product-images' AND _imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

CREATE POLICY "product-images staff delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND _imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

CREATE POLICY "product-images staff list" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND _imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));

DROP POLICY IF EXISTS "admins manage variants" ON public.product_variants;
CREATE POLICY "staff manage variants" ON public.product_variants FOR ALL TO authenticated
USING (_imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']))
WITH CHECK (_imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']));