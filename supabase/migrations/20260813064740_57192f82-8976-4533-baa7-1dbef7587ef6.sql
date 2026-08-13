
CREATE OR REPLACE FUNCTION public.mkt_product_perf(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH att_orders AS (
  SELECT DISTINCT ON (a.order_id) a.order_id, a.campaign_id, o.total, o.status::text AS status
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ORDER BY a.order_id, a.confidence DESC NULLS LAST, a.created_at DESC
), camp_spend AS (
  SELECT i.campaign_id, SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), camp_att AS (
  SELECT campaign_id, SUM(COALESCE(total,0)) AS att_total
  FROM att_orders WHERE campaign_id IS NOT NULL GROUP BY 1
), order_spend AS (
  SELECT ao.order_id,
         CASE WHEN COALESCE(ca.att_total,0) > 0
              THEN COALESCE(cs.spend,0) * COALESCE(ao.total,0) / ca.att_total ELSE 0 END AS spend
  FROM att_orders ao
  LEFT JOIN camp_spend cs ON cs.campaign_id = ao.campaign_id
  LEFT JOIN camp_att  ca ON ca.campaign_id = ao.campaign_id
), order_line_total AS (
  SELECT oi.order_id, SUM(COALESCE(oi.line_total,0)) AS lt
  FROM public.order_items oi
  JOIN att_orders ao ON ao.order_id = oi.order_id
  GROUP BY 1
), spend_lines AS (
  SELECT oi.product_id,
         SUM(CASE WHEN COALESCE(olt.lt,0) > 0
                  THEN os.spend * COALESCE(oi.line_total,0) / olt.lt ELSE 0 END) AS ad_spend,
         COUNT(DISTINCT oi.order_id) AS att_orders,
         COUNT(DISTINCT oi.order_id) FILTER (WHERE ao.status = ANY(public.rpt_delivered_statuses())) AS att_delivered_orders
  FROM public.order_items oi
  JOIN att_orders ao ON ao.order_id = oi.order_id
  JOIN order_spend os ON os.order_id = oi.order_id
  LEFT JOIN order_line_total olt ON olt.order_id = oi.order_id
  WHERE oi.product_id IS NOT NULL
  GROUP BY 1
), sold AS (
  SELECT oi.product_id,
         COUNT(DISTINCT o.id) AS orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
         SUM(COALESCE(oi.quantity,0)) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_units,
         SUM(COALESCE(oi.line_total,0)) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_revenue,
         SUM(COALESCE(oi.line_total,0)) AS booked_revenue,
         SUM(
           COALESCE(oi.quantity,0) * COALESCE(oi.unit_cost_snapshot, pv.weighted_avg_cost, p.weighted_avg_cost, p.cost_price, 0)
         ) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS cogs,
         SUM(COALESCE(oi.courier_cost_allocated,0) + COALESCE(oi.packaging_cost_allocated,0))
           FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS opex,
         SUM(COALESCE(oi.quantity,0)) FILTER (
           WHERE o.status::text = ANY(public.rpt_delivered_statuses())
             AND COALESCE(oi.unit_cost_snapshot, pv.weighted_avg_cost, p.weighted_avg_cost, p.cost_price, 0) = 0
         ) AS cost_missing_units
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND oi.product_id IS NOT NULL
  GROUP BY 1
), j AS (
  SELECT COALESCE(s.product_id, sl.product_id) AS product_id,
         COALESCE(s.orders,0) AS orders,
         COALESCE(s.delivered_orders,0) AS delivered_orders,
         COALESCE(s.delivered_units,0) AS delivered_units,
         COALESCE(s.delivered_revenue,0) AS delivered_revenue,
         COALESCE(s.booked_revenue,0) AS booked_revenue,
         COALESCE(s.cogs,0) AS cogs,
         COALESCE(s.opex,0) AS opex,
         COALESCE(s.cost_missing_units,0) AS cost_missing_units,
         COALESCE(sl.ad_spend,0) AS ad_spend,
         COALESCE(sl.att_orders,0) AS attributed_orders,
         COALESCE(sl.att_delivered_orders,0) AS attributed_delivered_orders
  FROM sold s
  FULL OUTER JOIN spend_lines sl ON sl.product_id = s.product_id
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'delivered_revenue')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'product_id', j.product_id,
    'title', COALESCE(p.title, '(unknown product)'),
    'sku', p.sku,
    'image', p.image,
    'orders', j.orders,
    'delivered_orders', j.delivered_orders,
    'delivered_units', j.delivered_units,
    'delivered_revenue', round(j.delivered_revenue,2),
    'booked_revenue', round(j.booked_revenue,2),
    'cogs', round(j.cogs,2),
    'operating_cost', round(j.opex,2),
    'gross_profit', round(j.delivered_revenue - j.cogs - j.opex, 2),
    'ad_spend', round(j.ad_spend,2),
    'net_profit', round(j.delivered_revenue - j.cogs - j.opex - j.ad_spend, 2),
    'attributed_orders', j.attributed_orders,
    'attributed_delivered_orders', j.attributed_delivered_orders,
    'roas', CASE WHEN j.ad_spend > 0 THEN round(j.delivered_revenue / j.ad_spend, 2) ELSE 0 END,
    'cpa', CASE WHEN j.attributed_delivered_orders > 0 THEN round(j.ad_spend / j.attributed_delivered_orders, 2) ELSE 0 END,
    'aov', CASE WHEN j.delivered_orders > 0 THEN round(j.delivered_revenue / j.delivered_orders, 2) ELSE 0 END,
    'margin_pct', CASE WHEN j.delivered_revenue > 0
        THEN round(100.0 * (j.delivered_revenue - j.cogs - j.opex - j.ad_spend) / j.delivered_revenue, 2) ELSE 0 END,
    'cost_missing_units', j.cost_missing_units
  ) AS x
  FROM j LEFT JOIN public.products p ON p.id = j.product_id
  WHERE j.delivered_revenue <> 0 OR j.ad_spend <> 0 OR j.orders > 0
) q;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_acquisition(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT o.id,
         regexp_replace(COALESCE(NULLIF(o.shipping_phone,''), NULLIF(o.guest_phone,''), ''), '[^0-9]', '', 'g') AS phone_raw,
         o.created_at,
         o.total,
         o.status::text AS status
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND COALESCE(NULLIF(o.shipping_phone,''), NULLIF(o.guest_phone,'')) IS NOT NULL
), cust AS (
  SELECT right(phone_raw, 10) AS cust_key, id, created_at, total, status
  FROM base WHERE length(phone_raw) >= 10
), firsts AS (
  SELECT cust_key, MIN(created_at) AS first_at FROM cust GROUP BY 1
), win AS (
  SELECT c.*, f.first_at,
         (f.first_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
          AND f.first_at < ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')) AS is_new
  FROM cust c JOIN firsts f ON f.cust_key = c.cust_key
  WHERE c.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND c.created_at < ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), spend AS (
  SELECT COALESCE(SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)),0) AS spend
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
), summary AS (
  SELECT
    COUNT(DISTINCT cust_key) FILTER (WHERE is_new) AS new_customers,
    COUNT(DISTINCT cust_key) FILTER (WHERE NOT is_new) AS returning_customers,
    COUNT(*) FILTER (WHERE is_new) AS new_orders,
    COUNT(*) FILTER (WHERE NOT is_new) AS returning_orders,
    COALESCE(SUM(total) FILTER (WHERE is_new AND status = ANY(public.rpt_delivered_statuses())),0) AS new_revenue,
    COALESCE(SUM(total) FILTER (WHERE NOT is_new AND status = ANY(public.rpt_delivered_statuses())),0) AS returning_revenue,
    COUNT(DISTINCT cust_key) AS active_customers
  FROM win
), ltv AS (
  SELECT COALESCE(AVG(v),0) AS ltv, COALESCE(AVG(oc),0) AS orders_per_customer
  FROM (
    SELECT c.cust_key,
           SUM(c.total) FILTER (WHERE c.status = ANY(public.rpt_delivered_statuses())) AS v,
           COUNT(*) AS oc
    FROM cust c JOIN firsts f ON f.cust_key = c.cust_key
    WHERE f.first_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND f.first_at < ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    GROUP BY 1
  ) t
), cohorts AS (
  SELECT to_char(date_trunc('month', (f.first_at AT TIME ZONE 'Asia/Dhaka')), 'YYYY-MM') AS cohort_month,
         COUNT(DISTINCT f.cust_key) AS customers,
         COUNT(c.id) AS orders,
         COALESCE(SUM(c.total) FILTER (WHERE c.status = ANY(public.rpt_delivered_statuses())),0) AS revenue,
         COUNT(DISTINCT c.cust_key) FILTER (WHERE c.created_at > f.first_at) AS repeat_customers
  FROM firsts f JOIN cust c ON c.cust_key = f.cust_key
  WHERE f.first_at >= ((_from::date - interval '180 days')::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY 1
)
SELECT jsonb_build_object(
  'summary', (
    SELECT jsonb_build_object(
      'new_customers', s.new_customers,
      'returning_customers', s.returning_customers,
      'active_customers', s.active_customers,
      'new_orders', s.new_orders,
      'returning_orders', s.returning_orders,
      'new_revenue', round(s.new_revenue,2),
      'returning_revenue', round(s.returning_revenue,2),
      'spend', round(sp.spend,2),
      'cac', CASE WHEN s.new_customers > 0 THEN round(sp.spend / s.new_customers, 2) ELSE 0 END,
      'ltv', round(l.ltv,2),
      'ltv_cac', CASE WHEN s.new_customers > 0 AND sp.spend > 0
                      THEN round(l.ltv / (sp.spend / s.new_customers), 2) ELSE 0 END,
      'orders_per_customer', round(l.orders_per_customer,2),
      'repeat_rate', CASE WHEN s.active_customers > 0
          THEN round(100.0 * s.returning_customers / s.active_customers, 2) ELSE 0 END
    ) FROM summary s, spend sp, ltv l
  ),
  'cohorts', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'cohort_month', cohort_month,
      'customers', customers,
      'orders', orders,
      'revenue', round(revenue,2),
      'repeat_customers', repeat_customers,
      'repeat_rate', CASE WHEN customers > 0 THEN round(100.0*repeat_customers/customers,2) ELSE 0 END,
      'ltv', CASE WHEN customers > 0 THEN round(revenue/customers,2) ELSE 0 END
    ) ORDER BY cohort_month), '[]'::jsonb) FROM cohorts
  )
);
$function$;

REVOKE ALL ON FUNCTION public.mkt_product_perf(uuid[], date, date) FROM public;
REVOKE ALL ON FUNCTION public.mkt_acquisition(uuid[], date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.mkt_product_perf(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_acquisition(uuid[], date, date) TO authenticated, service_role;
