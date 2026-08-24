
CREATE TABLE IF NOT EXISTS public.mkt_campaign_meta (
  campaign_id uuid PRIMARY KEY REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  brand_id uuid,
  tags text[] NOT NULL DEFAULT '{}',
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_campaign_meta TO authenticated;
GRANT ALL ON public.mkt_campaign_meta TO service_role;
ALTER TABLE public.mkt_campaign_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage campaign meta" ON public.mkt_campaign_meta;
CREATE POLICY "staff manage campaign meta" ON public.mkt_campaign_meta
  FOR ALL TO authenticated
  USING (public.is_marketing_staff((SELECT auth.uid())))
  WITH CHECK (public.is_marketing_staff((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.mkt_campaign_cost_split(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH src AS (
  SELECT l.*
  FROM unnest(_brand_ids) AS b(bid)
  CROSS JOIN LATERAL public.mkt_delivered_line_costs(b.bid, _from, _to) l
  WHERE l.campaign_id IS NOT NULL
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', campaign_id,
  'delivered_revenue', round(revenue,2),
  'cogs', round(cogs,2),
  'courier', round(courier,2),
  'packaging', round(packaging,2),
  'refunds', round(refunds,2),
  'other', round(other_cost,2)
)), '[]'::jsonb)
FROM (
  SELECT campaign_id,
    COALESCE(SUM(line_total),0)::numeric AS revenue,
    COALESCE(SUM(line_cogs),0)::numeric AS cogs,
    COALESCE(SUM(courier_cost_allocated),0)::numeric AS courier,
    COALESCE(SUM(packaging_cost_allocated),0)::numeric AS packaging,
    COALESCE(SUM(refund_amount_allocated),0)::numeric AS refunds,
    GREATEST(COALESCE(SUM(operating_cost),0)
      - COALESCE(SUM(courier_cost_allocated),0)
      - COALESCE(SUM(packaging_cost_allocated),0)
      - COALESCE(SUM(refund_amount_allocated),0), 0)::numeric AS other_cost
  FROM src GROUP BY campaign_id
) q;
$function$;

REVOKE ALL ON FUNCTION public.mkt_campaign_cost_split(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_cost_split(uuid[], date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mkt_campaign_trend(_brand_ids uuid[], _from date, _to date, _grain text DEFAULT 'day')
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH g AS (SELECT CASE WHEN lower(_grain) = 'week' THEN 'week' ELSE 'day' END AS grain),
spend AS (
  SELECT i.campaign_id AS cid,
    date_trunc((SELECT grain FROM g), i.date::timestamp)::date AS bucket,
    SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0))::numeric AS spend
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1,2
),
lines AS (
  SELECT l.campaign_id AS cid,
    date_trunc((SELECT grain FROM g), l.day::timestamp)::date AS bucket,
    SUM(l.line_total)::numeric AS revenue,
    SUM(l.line_cogs)::numeric AS cogs,
    SUM(l.operating_cost)::numeric AS opex
  FROM unnest(_brand_ids) AS b(bid)
  CROSS JOIN LATERAL public.mkt_delivered_line_costs(b.bid, _from, _to) l
  WHERE l.campaign_id IS NOT NULL
  GROUP BY 1,2
),
merged AS (
  SELECT COALESCE(s.cid, x.cid) AS cid,
         COALESCE(s.bucket, x.bucket) AS bucket,
         COALESCE(s.spend,0) AS spend,
         COALESCE(x.revenue,0) AS revenue,
         COALESCE(x.cogs,0) AS cogs,
         COALESCE(x.opex,0) AS opex
  FROM spend s
  FULL OUTER JOIN lines x ON x.cid = s.cid AND x.bucket = s.bucket
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', cid,
  'bucket', bucket,
  'spend', round(spend,2),
  'delivered_revenue', round(revenue,2),
  'cogs', round(cogs,2),
  'operating_cost', round(opex,2),
  'gross_profit', round(revenue - cogs - opex,2),
  'net_profit', round(revenue - cogs - opex - spend,2)
) ORDER BY bucket), '[]'::jsonb)
FROM merged WHERE cid IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.mkt_campaign_trend(uuid[], date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_trend(uuid[], date, date, text) TO authenticated, service_role;
