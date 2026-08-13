
CREATE TABLE IF NOT EXISTS public.mkt_creative_meta (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  creative_key text not null,
  creative_type text,
  hook text,
  angle text,
  creator text,
  product_id uuid references public.products(id) on delete set null,
  status text default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, creative_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_creative_meta TO authenticated;
GRANT ALL ON public.mkt_creative_meta TO service_role;
ALTER TABLE public.mkt_creative_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative meta brand scoped" ON public.mkt_creative_meta;
CREATE POLICY "creative meta brand scoped" ON public.mkt_creative_meta
  FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE OR REPLACE FUNCTION public.mkt_creative_perf(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH ad_key AS (
  SELECT d.id AS ad_id, d.brand_id, d.name, d.creative_thumbnail, d.creative_body,
         COALESCE(d.effective_status, d.status, '—') AS status,
         COALESCE(NULLIF(d.creative_thumbnail, ''), 'name:' || COALESCE(d.name, d.id::text)) AS creative_key
  FROM public.mkt_ads d
  WHERE d.brand_id = ANY(_brand_ids)
), ins AS (
  SELECT k.creative_key,
         SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
         SUM(COALESCE(i.impressions,0)) AS impressions,
         SUM(COALESCE(i.clicks,0)) AS clicks,
         SUM(COALESCE(i.reach,0)) AS reach,
         SUM(COALESCE(i.meta_purchases,0)) AS meta_purchases,
         SUM(COALESCE(i.impressions,0)) FILTER (WHERE i.date > _to - 7) AS impr_7,
         SUM(COALESCE(i.clicks,0)) FILTER (WHERE i.date > _to - 7) AS clicks_7,
         SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) FILTER (WHERE i.date > _to - 7) AS spend_7,
         MAX(i.date) AS last_active
  FROM public.mkt_insights_daily i
  JOIN ad_key k ON k.ad_id = i.ad_id
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), att AS (
  SELECT k.creative_key,
         COUNT(DISTINCT o.id) AS orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
         COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())),0) AS revenue,
         COALESCE(SUM(o.total),0) AS booked_revenue
  FROM public.mkt_order_attributions a
  JOIN ad_key k ON k.ad_id = a.ad_id
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY 1
), grp AS (
  SELECT k.creative_key,
         MIN(k.name) AS name,
         MAX(k.creative_thumbnail) AS thumbnail,
         MAX(k.creative_body) AS body,
         COUNT(*) AS ad_count,
         MIN(k.brand_id::text)::uuid AS brand_id,
         BOOL_OR(UPPER(k.status) = 'ACTIVE') AS any_active
  FROM ad_key k GROUP BY 1
), j AS (
  SELECT g.*, m.creative_type, m.hook, m.angle, m.creator, m.status AS meta_status, m.notes, m.product_id,
    COALESCE(i.spend,0) AS spend, COALESCE(i.impressions,0) AS impressions,
    COALESCE(i.clicks,0) AS clicks, COALESCE(i.reach,0) AS reach,
    COALESCE(i.meta_purchases,0) AS meta_purchases,
    COALESCE(i.impr_7,0) AS impr_7, COALESCE(i.clicks_7,0) AS clicks_7, COALESCE(i.spend_7,0) AS spend_7,
    i.last_active,
    COALESCE(t.orders,0) AS orders, COALESCE(t.delivered_orders,0) AS delivered_orders,
    COALESCE(t.revenue,0) AS revenue, COALESCE(t.booked_revenue,0) AS booked_revenue
  FROM grp g
  LEFT JOIN ins i ON i.creative_key = g.creative_key
  LEFT JOIN att t ON t.creative_key = g.creative_key
  LEFT JOIN public.mkt_creative_meta m ON m.creative_key = g.creative_key AND m.brand_id = g.brand_id
  WHERE COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'spend')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'creative_key', creative_key,
    'name', COALESCE(name,'(unnamed)'),
    'thumbnail', thumbnail,
    'body', LEFT(COALESCE(body,''), 400),
    'ad_count', ad_count,
    'brand_id', brand_id,
    'active', any_active,
    'creative_type', creative_type,
    'hook', hook, 'angle', angle, 'creator', creator,
    'meta_status', meta_status, 'notes', notes, 'product_id', product_id,
    'last_active', last_active,
    'spend', round(spend,2), 'impressions', impressions, 'clicks', clicks, 'reach', reach,
    'meta_purchases', meta_purchases,
    'frequency', CASE WHEN reach > 0 THEN round(impressions::numeric / reach, 2) ELSE 0 END,
    'ctr', CASE WHEN impressions > 0 THEN round(100.0*clicks/impressions,2) ELSE 0 END,
    'ctr_7', CASE WHEN impr_7 > 0 THEN round(100.0*clicks_7/impr_7,2) ELSE 0 END,
    'spend_7', round(spend_7,2),
    'cpc', CASE WHEN clicks > 0 THEN round(spend/clicks,2) ELSE 0 END,
    'cpm', CASE WHEN impressions > 0 THEN round(1000.0*spend/impressions,2) ELSE 0 END,
    'orders', orders, 'delivered_orders', delivered_orders,
    'revenue', round(revenue,2), 'booked_revenue', round(booked_revenue,2),
    'roas', CASE WHEN spend > 0 THEN round(revenue/spend,2) ELSE 0 END,
    'booked_roas', CASE WHEN spend > 0 THEN round(booked_revenue/spend,2) ELSE 0 END,
    'cpa', CASE WHEN orders > 0 THEN round(spend/orders,2) ELSE 0 END,
    'cac', CASE WHEN delivered_orders > 0 THEN round(spend/delivered_orders,2) ELSE 0 END,
    'fatigued', (
      (reach > 0 AND impressions::numeric / reach > 3)
      OR (impr_7 > 500 AND impressions > 0 AND clicks > 0
          AND (100.0*clicks_7/NULLIF(impr_7,0)) < 0.7 * (100.0*clicks/NULLIF(impressions,0)))
    ),
    'winning', (spend >= 1000 AND revenue > 0 AND revenue/NULLIF(spend,0) >= 2)
  ) AS x FROM j
) s;
$function$;

GRANT EXECUTE ON FUNCTION public.mkt_creative_perf(uuid[], date, date) TO authenticated, service_role;
