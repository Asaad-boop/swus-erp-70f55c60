CREATE TABLE IF NOT EXISTS public.content_intake_excluded (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid,
  product_id uuid not null,
  reason text,
  excluded_by uuid,
  created_at timestamptz not null default now(),
  unique (product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_intake_excluded TO authenticated;
GRANT ALL ON public.content_intake_excluded TO service_role;
ALTER TABLE public.content_intake_excluded ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content intake excluded brand scoped" ON public.content_intake_excluded;
CREATE POLICY "content intake excluded brand scoped" ON public.content_intake_excluded
FOR ALL TO authenticated
USING ((brand_id IS NULL) OR (brand_id = ANY (get_user_brand_ids())))
WITH CHECK ((brand_id IS NULL) OR (brand_id = ANY (get_user_brand_ids())));