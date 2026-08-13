
CREATE TABLE IF NOT EXISTS public.mkt_budgets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  campaign_id uuid references public.mkt_campaigns(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  planned_spend numeric not null default 0,
  target_revenue numeric not null default 0,
  target_roas numeric,
  scaling_status text not null default 'hold',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_budgets TO authenticated;
GRANT ALL ON public.mkt_budgets TO service_role;
ALTER TABLE public.mkt_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mkt budgets brand scoped" ON public.mkt_budgets;
CREATE POLICY "mkt budgets brand scoped" ON public.mkt_budgets
  FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE TABLE IF NOT EXISTS public.mkt_calendar_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  title text not null,
  event_type text not null default 'campaign_launch',
  start_date date not null,
  end_date date,
  owner text,
  status text not null default 'planned',
  color text,
  notes text,
  campaign_id uuid references public.mkt_campaigns(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_calendar_events TO authenticated;
GRANT ALL ON public.mkt_calendar_events TO service_role;
ALTER TABLE public.mkt_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mkt calendar brand scoped" ON public.mkt_calendar_events;
CREATE POLICY "mkt calendar brand scoped" ON public.mkt_calendar_events
  FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE TABLE IF NOT EXISTS public.mkt_experiments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  name text not null,
  test_type text not null default 'creative',
  hypothesis text,
  variant_a text,
  variant_b text,
  metric text not null default 'roas',
  start_date date,
  end_date date,
  status text not null default 'running',
  result_a numeric,
  result_b numeric,
  winner text,
  learning text,
  decision text,
  campaign_id uuid references public.mkt_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_experiments TO authenticated;
GRANT ALL ON public.mkt_experiments TO service_role;
ALTER TABLE public.mkt_experiments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mkt experiments brand scoped" ON public.mkt_experiments;
CREATE POLICY "mkt experiments brand scoped" ON public.mkt_experiments
  FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE INDEX IF NOT EXISTS mkt_budgets_brand_period_idx ON public.mkt_budgets (brand_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS mkt_calendar_brand_date_idx ON public.mkt_calendar_events (brand_id, start_date);
CREATE INDEX IF NOT EXISTS mkt_experiments_brand_idx ON public.mkt_experiments (brand_id, start_date);

CREATE OR REPLACE FUNCTION public.mkt_budget_status(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH b AS (
  SELECT * FROM public.mkt_budgets
  WHERE (brand_id IS NULL OR brand_id = ANY(_brand_ids))
    AND period_start <= _to AND period_end >= _from
), spend AS (
  SELECT b.id,
         COALESCE(SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)), 0) AS actual_spend
  FROM b
  LEFT JOIN public.mkt_insights_daily i
    ON i.brand_id = ANY(_brand_ids)
   AND i.date >= b.period_start AND i.date <= b.period_end
   AND (b.campaign_id IS NULL OR i.campaign_id = b.campaign_id)
  GROUP BY b.id
), rev AS (
  SELECT b.id,
         COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())), 0) AS actual_revenue,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders
  FROM b
  LEFT JOIN public.mkt_order_attributions a
    ON a.brand_id = ANY(_brand_ids)
   AND (b.campaign_id IS NULL OR a.campaign_id = b.campaign_id)
  LEFT JOIN public.orders o
    ON o.id = a.order_id
   AND o.created_at >= (b.period_start::timestamp AT TIME ZONE 'Asia/Dhaka')
   AND o.created_at <  ((b.period_end + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY b.id
)
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.period_start DESC, x.name), '[]'::jsonb)
FROM (
  SELECT b.id, b.brand_id, b.campaign_id, b.name, b.period_start, b.period_end,
         b.planned_spend::numeric, b.target_revenue::numeric, b.target_roas,
         b.scaling_status, b.notes,
         c.name AS campaign_name,
         s.actual_spend::numeric,
         r.actual_revenue::numeric,
         r.delivered_orders,
         CASE WHEN b.planned_spend > 0 THEN round((s.actual_spend / b.planned_spend) * 100, 1) ELSE 0 END AS utilization,
         GREATEST(b.planned_spend - s.actual_spend, 0)::numeric AS remaining,
         CASE WHEN s.actual_spend > 0 THEN round(r.actual_revenue / s.actual_spend, 2) ELSE 0 END AS actual_roas
  FROM b
  LEFT JOIN spend s ON s.id = b.id
  LEFT JOIN rev r ON r.id = b.id
  LEFT JOIN public.mkt_campaigns c ON c.id = b.campaign_id
) x;
$function$;
