ALTER TABLE public.hub_content_plans
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS script_updated_at timestamptz;