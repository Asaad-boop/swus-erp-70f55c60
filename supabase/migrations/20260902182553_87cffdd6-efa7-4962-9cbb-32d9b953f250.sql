CREATE TABLE IF NOT EXISTS public.hub_experiments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid,
  title text not null,
  hypothesis text,
  product_id uuid,
  variable text,
  variant_a text,
  variant_b text,
  budget numeric not null default 0,
  start_date date,
  end_date date,
  status text not null default 'planned',
  result text,
  winner text,
  learning text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_experiments TO authenticated;
GRANT ALL ON public.hub_experiments TO service_role;
ALTER TABLE public.hub_experiments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub experiments brand scoped" ON public.hub_experiments;
CREATE POLICY "hub experiments brand scoped" ON public.hub_experiments FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE TABLE IF NOT EXISTS public.hub_learnings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid,
  experiment_id uuid references public.hub_experiments(id) on delete set null,
  insight text not null,
  category text,
  tags text[] not null default '{}',
  confidence text not null default 'medium',
  created_by uuid,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_learnings TO authenticated;
GRANT ALL ON public.hub_learnings TO service_role;
ALTER TABLE public.hub_learnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub learnings brand scoped" ON public.hub_learnings;
CREATE POLICY "hub learnings brand scoped" ON public.hub_learnings FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE INDEX IF NOT EXISTS hub_experiments_brand_idx ON public.hub_experiments(brand_id, created_at desc);
CREATE INDEX IF NOT EXISTS hub_learnings_brand_idx ON public.hub_learnings(brand_id, created_at desc);