-- 1) Sourcing event log
CREATE TABLE IF NOT EXISTS public.hub_sourcing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.hub_product_ideas(id) ON DELETE CASCADE,
  quote_id uuid,
  event_type text NOT NULL,
  from_stage text,
  to_stage text,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_sourcing_events TO authenticated;
GRANT ALL ON public.hub_sourcing_events TO service_role;

ALTER TABLE public.hub_sourcing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub sourcing events brand scoped" ON public.hub_sourcing_events
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = hub_sourcing_events.idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (get_user_brand_ids()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = hub_sourcing_events.idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (get_user_brand_ids()))));

CREATE INDEX IF NOT EXISTS hub_sourcing_events_idea_idx ON public.hub_sourcing_events (idea_id, created_at DESC);

-- 2) Follow-up / ownership on ideas
ALTER TABLE public.hub_product_ideas
  ADD COLUMN IF NOT EXISTS sourcing_owner text,
  ADD COLUMN IF NOT EXISTS next_action_at date,
  ADD COLUMN IF NOT EXISTS next_action_note text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

-- 3) Sample tracking on quotes
ALTER TABLE public.hub_sourcing_quotes
  ADD COLUMN IF NOT EXISTS sample_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_tracking text,
  ADD COLUMN IF NOT EXISTS sample_received_at date;