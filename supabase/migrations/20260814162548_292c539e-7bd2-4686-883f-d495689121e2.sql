
ALTER TABLE public.hub_content_plans
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS brief text,
  ADD COLUMN IF NOT EXISTS script text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS hashtags text,
  ADD COLUMN IF NOT EXISTS reference_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS published_at date,
  ADD COLUMN IF NOT EXISTS views bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagements bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributed_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.hub_creators
  ADD COLUMN IF NOT EXISTS rating numeric,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
