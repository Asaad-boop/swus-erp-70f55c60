GRANT SELECT ON public.brands TO anon;
DROP POLICY IF EXISTS "Public can view active brands" ON public.brands;
CREATE POLICY "Public can view active brands" ON public.brands FOR SELECT TO anon USING (is_active = true);