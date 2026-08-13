-- ============ ROUTINES ============
CREATE TABLE public.hub_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  title text NOT NULL,
  details text,
  cadence text NOT NULL DEFAULT 'daily', -- daily | weekly | monthly
  weekday int,        -- 0=Sun .. 6=Sat (weekly)
  day_of_month int,   -- 1..28 (monthly)
  time_of_day text,   -- 'HH:MM' display only
  owner_id uuid,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_spawned_on date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_routines_brand_idx ON public.hub_routines (brand_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_routines TO authenticated;
GRANT ALL ON public.hub_routines TO service_role;
ALTER TABLE public.hub_routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub routines brand scoped" ON public.hub_routines FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));
CREATE TRIGGER hub_routines_touch BEFORE UPDATE ON public.hub_routines
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ============ COMPETITORS ============
CREATE TABLE public.hub_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  name text NOT NULL,
  website_url text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  favicon_url text,
  logo_url text,
  country text,
  price_range text,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  threat_level text NOT NULL DEFAULT 'medium', -- low | medium | high
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_competitors_brand_idx ON public.hub_competitors (brand_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_competitors TO authenticated;
GRANT ALL ON public.hub_competitors TO service_role;
ALTER TABLE public.hub_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub competitors brand scoped" ON public.hub_competitors FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));
CREATE TRIGGER hub_competitors_touch BEFORE UPDATE ON public.hub_competitors
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ============ COMPETITOR PAGES / ADS (swipe file) ============
CREATE TABLE public.hub_competitor_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  competitor_id uuid REFERENCES public.hub_competitors(id) ON DELETE SET NULL,
  asset_type text NOT NULL DEFAULT 'ad', -- ad | landing | product | organic | creative
  platform text,                          -- facebook | instagram | tiktok | website | youtube
  title text,
  url text,
  image_url text,
  thumbnail_url text,
  price numeric,
  offer text,
  hook text,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  rating int,
  is_favorite boolean NOT NULL DEFAULT false,
  captured_by uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_comp_assets_brand_idx ON public.hub_competitor_assets (brand_id, captured_at DESC);
CREATE INDEX hub_comp_assets_competitor_idx ON public.hub_competitor_assets (competitor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_competitor_assets TO authenticated;
GRANT ALL ON public.hub_competitor_assets TO service_role;
ALTER TABLE public.hub_competitor_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub competitor assets brand scoped" ON public.hub_competitor_assets FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));
CREATE TRIGGER hub_competitor_assets_touch BEFORE UPDATE ON public.hub_competitor_assets
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ============ CAPTURE TOKENS (bookmarklet / extension) ============
CREATE TABLE public.hub_capture_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'My browser',
  token_hash text NOT NULL UNIQUE,
  token_hint text NOT NULL DEFAULT '',
  default_brand_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  use_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_capture_tokens_user_idx ON public.hub_capture_tokens (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_capture_tokens TO authenticated;
GRANT ALL ON public.hub_capture_tokens TO service_role;
ALTER TABLE public.hub_capture_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub capture tokens own" ON public.hub_capture_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ ROUTINE -> TASK SPAWNER ============
CREATE OR REPLACE FUNCTION public.hub_spawn_due_routines(_brand_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  made int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.hub_routines
    WHERE active
      AND (last_spawned_on IS NULL OR last_spawned_on < today)
      AND (_brand_ids IS NULL OR brand_id IS NULL OR brand_id = ANY(_brand_ids))
  LOOP
    IF (r.cadence = 'daily')
       OR (r.cadence = 'weekly' AND r.weekday IS NOT NULL AND EXTRACT(DOW FROM today)::int = r.weekday)
       OR (r.cadence = 'monthly' AND r.day_of_month IS NOT NULL AND EXTRACT(DAY FROM today)::int = r.day_of_month)
    THEN
      INSERT INTO public.hub_tasks (brand_id, title, details, assignee_id, due_date, priority, status, checklist, tags, link_type, link_id, link_label, created_by)
      VALUES (r.brand_id, r.title, r.details, r.owner_id, today, 'normal', 'todo', r.checklist,
              r.tags || ARRAY['routine'], 'routine', r.id::text, 'Routine', r.created_by);
      UPDATE public.hub_routines SET last_spawned_on = today WHERE id = r.id;
      made := made + 1;
    END IF;
  END LOOP;
  RETURN made;
END;
$$;
REVOKE ALL ON FUNCTION public.hub_spawn_due_routines(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hub_spawn_due_routines(uuid[]) TO authenticated, service_role;