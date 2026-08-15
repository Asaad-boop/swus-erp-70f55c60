CREATE TABLE public.hub_plan_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  month date NOT NULL,
  product_name text NOT NULL DEFAULT '',
  product_id uuid,
  qty numeric NOT NULL DEFAULT 0,
  sell_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  marketing_cost numeric NOT NULL DEFAULT 0,
  note text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_plan_scenarios TO authenticated;
GRANT ALL ON public.hub_plan_scenarios TO service_role;

ALTER TABLE public.hub_plan_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage plan scenarios"
ON public.hub_plan_scenarios FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_hub_plan_scenarios_brand_month ON public.hub_plan_scenarios (brand_id, month);

CREATE TRIGGER trg_hub_plan_scenarios_updated_at
BEFORE UPDATE ON public.hub_plan_scenarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();