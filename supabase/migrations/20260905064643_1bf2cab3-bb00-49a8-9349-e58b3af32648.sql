CREATE OR REPLACE FUNCTION public.mkt_product_perf(_brand_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH fx AS (SELECT public.mkt_usd_bdt_rate(_brand_ids) AS r),
pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), att_orders AS (
  SELECT pc.order_id, pc.campaign_id, COALESCE(o.total,0)::numeric AS total, o.status::text AS status
  FROM pc
  JOIN public.orders o ON o.id = pc.order_id
  WHERE pc.campaign_id IS NOT NULL
    AND o.status::text NOT IN ('cancelled','fake')
), camp_spend AS (
  SELECT i.campaign_id,
         SUM(CASE WHEN COALESCE(i.spend_bdt_fifo,0) > 0 THEN i.spend_bdt_fifo
                  WHEN COALESCE(a.currency,'USD') = 'BDT' THEN COALESCE(i.spend,0)
                  ELSE COALESCE(i.spend,0) * (SELECT r FROM fx) END) AS spend
  FROM public.mkt_insights_daily i
  LEFT JOIN public.mkt_ad_accounts a ON a.id = i.account_id
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), camp_att AS (
  SELECT campaign_id, SUM(total) AS att_total
  FROM att_orders GROUP BY 1
), order_spend AS (
  SELECT ao.order_id,
         CASE WHEN COALESCE(ca.att_total,0) > 0
              THEN COALESCE(cs.spend,0) * ao.total / ca.att_total ELSE 0 END AS spend
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
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS returned_orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status::text IN ('cancelled','fake')) AS cancelled_orders,
         SUM(COALESCE(oi.quantity,0)) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_units,
         SUM(COALESCE(oi.line_total,0)) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_revenue,
         SUM(COALESCE(oi.line_total,0)) FILTER (WHERE o.status::text NOT IN ('cancelled','fake')) AS booked_revenue,
         SUM(
           COALESCE(oi.quantity,0) * COALESCE(oi.unit_cost_snapshot, pv.weighted_avg_cost, p.weighted_avg_cost, p.cost_price)
         ) FILTER (
           WHERE o.status::text = ANY(public.rpt_delivered_statuses())
             AND COALESCE(oi.unit_cost_snapshot, pv.weighted_avg_cost, p.weighted_avg_cost, p.cost_price) IS NOT NULL
         ) AS cogs,
         SUM(COALESCE(oi.courier_cost_allocated,0) + COALESCE(oi.packaging_cost_allocated,0))
           FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS opex,
         SUM(COALESCE(oi.quantity,0)) FILTER (
           WHERE o.status::text = ANY(public.rpt_delivered_statuses())
             AND COALESCE(COALESCE(oi.unit_cost_snapshot, pv.weighted_avg_cost, p.weighted_avg_cost, p.cost_price), 0) = 0
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
         COALESCE(s.returned_orders,0) AS returned_orders,
         COALESCE(s.cancelled_orders,0) AS cancelled_orders,
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
    'returned_orders', j.returned_orders,
    'cancelled_orders', j.cancelled_orders,
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
    'roas', CASE WHEN j.ad_spend > 0 THEN round(j.delivered_revenue / j.ad_spend, 2) END,
    'cpa', CASE WHEN j.attributed_delivered_orders > 0 AND j.ad_spend > 0 THEN round(j.ad_spend / j.attributed_delivered_orders, 2) END,
    'aov', CASE WHEN j.delivered_orders > 0 THEN round(j.delivered_revenue / j.delivered_orders, 2) END,
    'margin_pct', CASE WHEN j.delivered_revenue > 0
        THEN round(100.0 * (j.delivered_revenue - j.cogs - j.opex - j.ad_spend) / j.delivered_revenue, 2) END,
    'delivery_rate', CASE WHEN j.orders - j.cancelled_orders > 0
        THEN round(100.0 * j.delivered_orders / (j.orders - j.cancelled_orders), 2) END,
    'return_rate', CASE WHEN j.delivered_orders + j.returned_orders > 0
        THEN round(100.0 * j.returned_orders / (j.delivered_orders + j.returned_orders), 2) END,
    'cost_missing_units', j.cost_missing_units,
    'cost_coverage_pct', CASE WHEN j.delivered_units > 0
        THEN round(100.0 * (j.delivered_units - j.cost_missing_units) / j.delivered_units, 2) END
  ) AS x
  FROM j LEFT JOIN public.products p ON p.id = j.product_id
  WHERE j.delivered_revenue <> 0 OR j.ad_spend <> 0 OR j.orders > 0
) q;
$function$;
GRANT EXECUTE ON FUNCTION public.mkt_product_perf(uuid[], date, date) TO authenticated, service_role;