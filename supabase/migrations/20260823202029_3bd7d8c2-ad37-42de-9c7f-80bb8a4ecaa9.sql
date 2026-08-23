CREATE OR REPLACE FUNCTION public.mkt_attribution_audit(
  _brand_ids uuid[],
  _from date,
  _to date,
  _campaign_id uuid DEFAULT NULL,
  _outcome text DEFAULT 'all',
  _search text DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT
    o.id AS order_id,
    o.invoice_no,
    o.created_at,
    o.status::text AS status,
    o.confirmation_status::text AS confirmation_status,
    o.web_status::text AS web_status,
    o.source::text AS source,
    COALESCE(o.total,0) AS total,
    COALESCE(o.shipping_name, o.guest_name) AS customer_name,
    COALESCE(o.shipping_phone, o.guest_phone) AS phone,
    a.source::text AS attr_source,
    COALESCE(a.confidence,0) AS confidence,
    a.campaign_id, a.adset_id, a.ad_id,
    COALESCE(a.utm_source, o.utm_source) AS utm_source,
    COALESCE(a.utm_medium, o.utm_medium) AS utm_medium,
    COALESCE(a.utm_campaign, o.utm_campaign) AS utm_campaign,
    COALESCE(a.utm_content, o.utm_content) AS utm_content,
    a.utm_term,
    COALESCE(a.fbclid, o.fbclid) AS fbclid,
    a.note,
    c.name AS campaign_name,
    s.name AS adset_name,
    d.name AS ad_name,
    CASE
      WHEN o.status::text = ANY(public.rpt_delivered_statuses()) THEN 'delivered'
      WHEN o.status::text IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit') THEN 'returned'
      WHEN o.status::text IN ('cancelled','fake') THEN 'cancelled'
      ELSE 'in_progress'
    END AS outcome
  FROM public.orders o
  JOIN public.mkt_order_attributions a ON a.order_id = o.id
  LEFT JOIN public.mkt_campaigns c ON c.id = a.campaign_id
  LEFT JOIN public.mkt_adsets  s ON s.id = a.adset_id
  LEFT JOIN public.mkt_ads     d ON d.id = a.ad_id
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND (_campaign_id IS NULL OR a.campaign_id = _campaign_id)
    AND (
      _search IS NULL OR btrim(_search) = '' OR
      o.invoice_no ILIKE '%'||_search||'%' OR
      COALESCE(o.shipping_phone, o.guest_phone) ILIKE '%'||_search||'%' OR
      COALESCE(c.name,'') ILIKE '%'||_search||'%' OR
      COALESCE(a.utm_campaign, o.utm_campaign,'') ILIKE '%'||_search||'%'
    )
), filt AS (
  SELECT * FROM base
  WHERE _outcome = 'all' OR outcome = _outcome
  ORDER BY created_at DESC
  LIMIT GREATEST(_limit, 1)
), items AS (
  SELECT oi.order_id,
         jsonb_agg(jsonb_build_object(
           'product_id', oi.product_id,
           'title', COALESCE(p.title, oi.name, '—'),
           'sku', p.sku,
           'qty', COALESCE(oi.quantity,0)
         ) ORDER BY COALESCE(oi.quantity,0) DESC) AS products
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id IN (SELECT order_id FROM filt)
  GROUP BY oi.order_id
), path AS (
  SELECT t.order_id,
         jsonb_agg(jsonb_build_object(
           'event_type', t.event_type,
           'at', t.created_at,
           'url', t.url,
           'referrer', t.referrer,
           'utm_campaign', t.utm_campaign,
           'utm_source', t.utm_source
         ) ORDER BY t.created_at) AS steps,
         COUNT(*) AS step_count,
         MIN(t.created_at) AS first_touch,
         MAX(t.created_at) AS last_touch
  FROM public.mkt_tracking_events t
  WHERE t.order_id IN (SELECT order_id FROM filt)
  GROUP BY t.order_id
), phone_path AS (
  SELECT f.order_id,
         jsonb_agg(jsonb_build_object(
           'event_type', t.event_type,
           'at', t.created_at,
           'url', t.url,
           'referrer', t.referrer,
           'utm_campaign', t.utm_campaign,
           'utm_source', t.utm_source
         ) ORDER BY t.created_at) AS steps,
         COUNT(*) AS step_count,
         MIN(t.created_at) AS first_touch,
         MAX(t.created_at) AS last_touch
  FROM filt f
  JOIN public.mkt_tracking_events t
    ON t.phone IS NOT NULL AND f.phone IS NOT NULL
   AND right(regexp_replace(t.phone,'\D','','g'),10) = right(regexp_replace(f.phone,'\D','','g'),10)
   AND t.created_at <= f.created_at
   AND t.created_at >= f.created_at - interval '30 days'
  WHERE f.order_id NOT IN (SELECT order_id FROM path)
  GROUP BY f.order_id
), allpath AS (
  SELECT * FROM path UNION ALL SELECT * FROM phone_path
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'order_id', f.order_id,
  'invoice_no', f.invoice_no,
  'created_at', f.created_at,
  'status', f.status,
  'confirmation_status', f.confirmation_status,
  'web_status', f.web_status,
  'order_source', f.source,
  'total', round(f.total,2),
  'customer_name', f.customer_name,
  'phone', f.phone,
  'outcome', f.outcome,
  'attr_source', f.attr_source,
  'confidence', round(f.confidence,2),
  'campaign_id', f.campaign_id,
  'campaign_name', f.campaign_name,
  'adset_name', f.adset_name,
  'ad_name', f.ad_name,
  'utm_source', f.utm_source,
  'utm_medium', f.utm_medium,
  'utm_campaign', f.utm_campaign,
  'utm_content', f.utm_content,
  'utm_term', f.utm_term,
  'fbclid', f.fbclid,
  'note', f.note,
  'match_rule', CASE
      WHEN f.attr_source::text LIKE 'auto_ad%' THEN 'Pixel/ad id matched from tracking event'
      WHEN f.attr_source::text LIKE '%utm%' THEN 'UTM campaign parameter matched a synced campaign'
      WHEN f.attr_source::text = 'pixel' THEN 'Pixel session matched to the order'
      WHEN f.attr_source::text = 'phone_match' THEN 'Visitor phone matched the order phone'
      WHEN f.attr_source::text = 'product_link' THEN 'Ordered product is linked to this campaign'
      WHEN f.attr_source::text = 'manual' THEN 'Manually assigned by a team member'
      ELSE 'Unclassified signal'
    END,
  'products', COALESCE(i.products, '[]'::jsonb),
  'path', COALESCE(p.steps, '[]'::jsonb),
  'step_count', COALESCE(p.step_count, 0),
  'first_touch', p.first_touch,
  'last_touch', p.last_touch
) ORDER BY f.created_at DESC), '[]'::jsonb)
FROM filt f
LEFT JOIN items i ON i.order_id = f.order_id
LEFT JOIN allpath p ON p.order_id = f.order_id;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_budget_pacing(
  _brand_ids uuid[],
  _from date,
  _to date
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH span AS (
  SELECT _from AS d0, _to AS d1,
         (_to - _from + 1)::numeric AS total_days,
         LEAST(_to, (now() AT TIME ZONE 'Asia/Dhaka')::date) AS today
), elapsed AS (
  SELECT s.*, GREATEST(LEAST(s.today - s.d0 + 1, s.total_days), 0)::numeric AS days_elapsed FROM span s
), ins AS (
  SELECT i.campaign_id,
         SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
         SUM(COALESCE(i.clicks,0)) AS clicks
  FROM public.mkt_insights_daily i, span s
  WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN s.d0 AND s.d1
  GROUP BY 1
), att AS (
  SELECT a.campaign_id,
         COUNT(DISTINCT o.id) AS orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
         COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())),0) AS revenue
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id, span s
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (s.d0::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((s.d1 + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY 1
), bud AS (
  SELECT b.campaign_id,
         SUM(COALESCE(b.planned_spend,0)
             * (GREATEST(0, LEAST(b.period_end, s.d1) - GREATEST(b.period_start, s.d0) + 1)::numeric
                / NULLIF((b.period_end - b.period_start + 1)::numeric, 0))) AS planned,
         MAX(b.scaling_status) AS scaling_status,
         MAX(b.target_roas) AS budget_target_roas
  FROM public.mkt_budgets b, span s
  WHERE b.brand_id = ANY(_brand_ids)
    AND b.campaign_id IS NOT NULL
    AND b.period_start <= s.d1 AND b.period_end >= s.d0
  GROUP BY 1
), j AS (
  SELECT c.id, COALESCE(c.name,'(unnamed)') AS name,
         COALESCE(c.effective_status, c.status, '—') AS status,
         COALESCE(c.daily_budget,0) AS daily_budget,
         c.target_roas,
         COALESCE(bd.planned, COALESCE(c.daily_budget,0) * e.total_days) AS planned,
         (bd.planned IS NOT NULL) AS has_budget_row,
         bd.scaling_status,
         COALESCE(i.spend,0) AS spend,
         COALESCE(t.orders,0) AS orders,
         COALESCE(t.delivered_orders,0) AS delivered_orders,
         COALESCE(t.revenue,0) AS revenue,
         e.total_days, e.days_elapsed
  FROM public.mkt_campaigns c
  CROSS JOIN elapsed e
  LEFT JOIN ins i ON i.campaign_id = c.id
  LEFT JOIN att t ON t.campaign_id = c.id
  LEFT JOIN bud bd ON bd.campaign_id = c.id
  WHERE c.brand_id = ANY(_brand_ids)
    AND (COALESCE(i.spend,0) > 0 OR bd.planned IS NOT NULL)
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', id,
  'name', name,
  'status', status,
  'daily_budget', round(daily_budget,2),
  'planned', round(planned,2),
  'has_budget_row', has_budget_row,
  'scaling_status', scaling_status,
  'spend', round(spend,2),
  'expected_to_date', round(CASE WHEN total_days > 0 THEN planned * days_elapsed / total_days ELSE 0 END, 2),
  'pace_pct', CASE
      WHEN planned > 0 AND days_elapsed > 0
      THEN round(100.0 * spend / NULLIF(planned * days_elapsed / total_days, 0), 1)
      ELSE NULL END,
  'projected_spend', round(CASE WHEN days_elapsed > 0 THEN spend * total_days / days_elapsed ELSE spend END, 2),
  'remaining', round(GREATEST(planned - spend, 0), 2),
  'avg_daily_spend', round(CASE WHEN days_elapsed > 0 THEN spend / days_elapsed ELSE 0 END, 2),
  'required_daily', round(CASE WHEN total_days - days_elapsed > 0 THEN GREATEST(planned - spend,0) / (total_days - days_elapsed) ELSE 0 END, 2),
  'days_elapsed', days_elapsed,
  'total_days', total_days,
  'orders', orders,
  'delivered_orders', delivered_orders,
  'revenue', round(revenue,2),
  'roas', CASE WHEN spend > 0 THEN round(revenue/spend,2) ELSE 0 END,
  'target_roas', target_roas,
  'pace_state', CASE
      WHEN planned <= 0 OR days_elapsed = 0 THEN 'no_plan'
      WHEN spend > planned * days_elapsed / total_days * 1.15 THEN 'over'
      WHEN spend < planned * days_elapsed / total_days * 0.85 THEN 'under'
      ELSE 'on_track' END
) ORDER BY spend DESC), '[]'::jsonb)
FROM j;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_product_match_suggestions(
  _campaign_id uuid,
  _from date,
  _to date,
  _limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH camp AS (
  SELECT c.id, COALESCE(c.name,'') AS name, c.brand_id FROM public.mkt_campaigns c WHERE c.id = _campaign_id
), linked AS (
  SELECT product_id FROM public.mkt_campaign_products WHERE campaign_id = _campaign_id
), hist AS (
  SELECT oi.product_id,
         SUM(COALESCE(oi.quantity,0)) AS qty,
         COUNT(DISTINCT o.id) AS orders,
         COALESCE(SUM(COALESCE(oi.line_total, oi.unit_price * oi.quantity, oi.price * oi.quantity, 0))
                  FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())), 0) AS revenue
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE a.campaign_id = _campaign_id
    AND oi.product_id IS NOT NULL
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY 1
), scored AS (
  SELECT p.id AS product_id, p.title, p.sku, p.image,
         COALESCE(h.qty,0) AS qty, COALESCE(h.orders,0) AS orders, COALESCE(h.revenue,0) AS revenue,
         similarity(lower(p.title), lower(c.name)) AS title_sim,
         (p.sku IS NOT NULL AND p.sku <> '' AND lower(c.name) LIKE '%'||lower(p.sku)||'%') AS sku_hit
  FROM public.products p
  CROSS JOIN camp c
  LEFT JOIN hist h ON h.product_id = p.id
  WHERE p.id NOT IN (SELECT product_id FROM linked)
    AND (h.product_id IS NOT NULL
         OR similarity(lower(p.title), lower(c.name)) > 0.22
         OR (p.sku IS NOT NULL AND p.sku <> '' AND lower(c.name) LIKE '%'||lower(p.sku)||'%'))
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'score')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'product_id', product_id,
    'title', title,
    'sku', sku,
    'image', image,
    'qty', qty,
    'orders', orders,
    'revenue', round(revenue,2),
    'title_sim', round(COALESCE(title_sim,0)::numeric, 3),
    'sku_hit', sku_hit,
    'reason', CASE
        WHEN orders > 0 AND sku_hit THEN 'Sold via this campaign + SKU in campaign name'
        WHEN orders > 0 THEN 'Sold through this campaign''s attributed orders'
        WHEN sku_hit THEN 'SKU appears in the campaign name'
        ELSE 'Product title matches the campaign name' END,
    'score', round((LEAST(orders,20) * 5) + (CASE WHEN sku_hit THEN 40 ELSE 0 END) + (COALESCE(title_sim,0) * 60)::numeric, 2)
  ) AS x
  FROM scored
  ORDER BY (LEAST(orders,20) * 5) + (CASE WHEN sku_hit THEN 40 ELSE 0 END) + (COALESCE(title_sim,0) * 60) DESC
  LIMIT GREATEST(_limit,1)
) s;
$function$;

GRANT EXECUTE ON FUNCTION public.mkt_attribution_audit(uuid[], date, date, uuid, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_budget_pacing(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_match_suggestions(uuid, date, date, int) TO authenticated;