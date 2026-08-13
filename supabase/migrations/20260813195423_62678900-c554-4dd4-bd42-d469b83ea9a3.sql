CREATE TABLE public.hub_product_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  source_url text,
  supplier_name text,
  supplier_url text,
  category text,
  est_unit_cost numeric NOT NULL DEFAULT 0,
  est_sell_price numeric NOT NULL DEFAULT 0,
  moq int,
  status text NOT NULL DEFAULT 'idea',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  linked_product_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_product_ideas_brand_status_idx ON public.hub_product_ideas (brand_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_product_ideas TO authenticated;
GRANT ALL ON public.hub_product_ideas TO service_role;
ALTER TABLE public.hub_product_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub ideas brand scoped" ON public.hub_product_ideas FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE TABLE public.hub_idea_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.hub_product_ideas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);
CREATE INDEX hub_idea_votes_idea_idx ON public.hub_idea_votes (idea_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_idea_votes TO authenticated;
GRANT ALL ON public.hub_idea_votes TO service_role;
ALTER TABLE public.hub_idea_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub votes readable" ON public.hub_idea_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "hub votes own insert" ON public.hub_idea_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "hub votes own update" ON public.hub_idea_votes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "hub votes own delete" ON public.hub_idea_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.hub_idea_forecast (
  idea_id uuid PRIMARY KEY REFERENCES public.hub_product_ideas(id) ON DELETE CASCADE,
  monthly_units numeric NOT NULL DEFAULT 0,
  sell_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  ad_cost_per_order numeric NOT NULL DEFAULT 0,
  courier_cost numeric NOT NULL DEFAULT 0,
  packaging_cost numeric NOT NULL DEFAULT 0,
  return_rate numeric NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_idea_forecast TO authenticated;
GRANT ALL ON public.hub_idea_forecast TO service_role;
ALTER TABLE public.hub_idea_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub forecast brand scoped" ON public.hub_idea_forecast FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (get_user_brand_ids()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hub_product_ideas i WHERE i.id = idea_id AND (i.brand_id IS NULL OR i.brand_id = ANY (get_user_brand_ids()))));

CREATE TRIGGER hub_product_ideas_updated_at BEFORE UPDATE ON public.hub_product_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.hub_idea_summary(_brand_ids uuid[])
RETURNS TABLE (
  idea_id uuid,
  up_votes int,
  down_votes int,
  score int,
  voters int,
  monthly_profit numeric,
  breakeven_roas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
    COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(v.vote), 0)::int,
    COUNT(v.id)::int,
    CASE WHEN f.idea_id IS NULL THEN NULL ELSE
      f.monthly_units * (1 - COALESCE(f.return_rate, 0) / 100.0)
        * (f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost - f.ad_cost_per_order)
      - f.monthly_units * (COALESCE(f.return_rate, 0) / 100.0) * (f.courier_cost + f.ad_cost_per_order)
    END,
    CASE WHEN f.idea_id IS NULL OR (f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost) <= 0 THEN NULL
      ELSE f.sell_price / NULLIF(f.sell_price - f.unit_cost - f.packaging_cost - f.courier_cost, 0) END
  FROM public.hub_product_ideas i
  LEFT JOIN public.hub_idea_votes v ON v.idea_id = i.id
  LEFT JOIN public.hub_idea_forecast f ON f.idea_id = i.id
  WHERE (i.brand_id IS NULL OR i.brand_id = ANY (_brand_ids))
  GROUP BY i.id, f.idea_id, f.monthly_units, f.return_rate, f.sell_price, f.unit_cost, f.packaging_cost, f.courier_cost, f.ad_cost_per_order;
$$;

GRANT EXECUTE ON FUNCTION public.hub_idea_summary(uuid[]) TO authenticated;