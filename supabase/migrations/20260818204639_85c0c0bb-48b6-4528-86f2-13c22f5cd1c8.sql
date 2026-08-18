DROP POLICY IF EXISTS "admins manage products" ON public.products;
DROP POLICY IF EXISTS "staff manage products" ON public.products;
DROP POLICY IF EXISTS "staff read all products" ON public.products;

CREATE POLICY "staff read all products" ON public.products
FOR SELECT TO authenticated
USING (public._imp_has_any_role(auth.uid(), 'owner','admin','operations','warehouse_staff','moderator','marketing_manager'));

CREATE POLICY "staff manage products" ON public.products
FOR ALL TO authenticated
USING (public._imp_has_any_role(auth.uid(), 'owner','admin','operations','warehouse_staff','moderator','marketing_manager'))
WITH CHECK (public._imp_has_any_role(auth.uid(), 'owner','admin','operations','warehouse_staff','moderator','marketing_manager'));