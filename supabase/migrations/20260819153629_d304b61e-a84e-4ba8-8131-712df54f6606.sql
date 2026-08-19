ALTER TABLE public.hub_month_plans
  ADD COLUMN IF NOT EXISTS target_ad_spend numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_aov numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_roas numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opex_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_rate_pct numeric NOT NULL DEFAULT 0;