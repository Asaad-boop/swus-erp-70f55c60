
ALTER TABLE public.hub_product_ideas
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_price_min numeric,
  ADD COLUMN IF NOT EXISTS target_price_max numeric,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS selected_quote_id uuid,
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_qty integer,
  ADD COLUMN IF NOT EXISTS order_unit_price numeric;

ALTER TABLE public.hub_idea_votes
  ADD COLUMN IF NOT EXISTS rating smallint;

DO $$ BEGIN
  ALTER TABLE public.hub_idea_votes ADD CONSTRAINT hub_idea_votes_rating_chk CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hub_sourcing_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.hub_product_ideas(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  supplier_url text,
  contact text,
  platform text NOT NULL DEFAULT '1688',
  unit_price_cny numeric NOT NULL DEFAULT 0,
  cny_rate numeric NOT NULL DEFAULT 17,
  moq integer,
  lead_time_days integer,
  shipping_mode text NOT NULL DEFAULT 'air',
  shipping_cost_per_unit numeric NOT NULL DEFAULT 0,
  sample_status text NOT NULL DEFAULT 'none',
  quality_rating smallint,
  status text NOT NULL DEFAULT 'quoted',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_sourcing_quotes TO authenticated;
GRANT ALL ON public.hub_sourcing_quotes TO service_role;
ALTER TABLE public.hub_sourcing_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub sourcing quotes authenticated" ON public.hub_sourcing_quotes;
CREATE POLICY "hub sourcing quotes authenticated" ON public.hub_sourcing_quotes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (public.get_user_brand_ids()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (public.get_user_brand_ids()))));

CREATE INDEX IF NOT EXISTS idx_hub_sourcing_quotes_idea ON public.hub_sourcing_quotes(idea_id);

DROP FUNCTION IF EXISTS public.hub_idea_summary(uuid[]);
CREATE OR REPLACE FUNCTION public.hub_idea_summary(_brand_ids uuid[])
 RETURNS TABLE(idea_id uuid, up_votes integer, down_votes integer, score integer, voters integer, avg_rating numeric, rating_count integer, quote_count integer, best_landed_cost numeric, monthly_profit numeric, breakeven_roas numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id,
    COALESCE((SELECT COUNT(*) FROM public.hub_idea_votes v WHERE v.idea_id = i.id AND v.vote = 1), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.hub_idea_votes v WHERE v.idea_id = i.id AND v.vote = -1), 0)::int,
    COALESCE((SELECT SUM(v.vote) FROM public.hub_idea_votes v WHERE v.idea_id = i.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.hub_idea_votes v WHERE v.idea_id = i.id), 0)::int,
    (SELECT ROUND(AVG(v.rating)::numeric, 2) FROM public.hub_idea_votes v WHERE v.idea_id = i.id AND v.rating IS NOT NULL),
    COALESCE((SELECT COUNT(*) FROM public.hub_idea_votes v WHERE v.idea_id = i.id AND v.rating IS NOT NULL), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.hub_sourcing_quotes q WHERE q.idea_id = i.id), 0)::int,
    (SELECT MIN(q.unit_price_cny * q.cny_rate + q.shipping_cost_per_unit) FROM public.hub_sourcing_quotes q WHERE q.idea_id = i.id AND q.status <> 'rejected'),
    CASE WHEN f.idea_id IS NULL THEN NULL ELSE
      f.monthly_units * (1 - COALESCE(f.return_rate, 0) / 100.0)
        * (f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost - f.ad_cost_per_order)
      - f.monthly_units * (COALESCE(f.return_rate, 0) / 100.0) * (f.courier_cost + f.ad_cost_per_order)
    END,
    CASE WHEN f.idea_id IS NULL OR (f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost) <= 0 THEN NULL
      ELSE f.sell_price / NULLIF(f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost, 0) END
  FROM public.hub_product_ideas i
  LEFT JOIN public.hub_idea_forecast f ON f.idea_id = i.id
  WHERE (i.brand_id IS NULL OR i.brand_id = ANY (_brand_ids));
$function$;
