ALTER TABLE public.hub_plan_scenarios
  ADD COLUMN IF NOT EXISTS packaging_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_cost numeric NOT NULL DEFAULT 0;

UPDATE public.hub_plan_scenarios
SET marketing_cost = ROUND(marketing_cost / NULLIF(qty,0), 2)
WHERE qty > 1 AND marketing_cost > 0;