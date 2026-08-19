ALTER TABLE public.hub_plan_scenarios
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS courier_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 0;