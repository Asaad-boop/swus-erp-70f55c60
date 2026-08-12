
CREATE OR REPLACE FUNCTION public.rpt_courier_performance(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.shipped_at IS NOT NULL
      AND o.shipped_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.shipped_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ), a AS (
    SELECT
      COALESCE(NULLIF(TRIM(courier_name), ''), 'Unassigned') AS courier,
      COUNT(*) AS shipped,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())) AS delivered,
      COUNT(*) FILTER (WHERE status::text IN ('returned','paid_return','unpaid_return','return_in_transit','pending_return')) AS returned,
      COUNT(*) FILTER (WHERE status::text IN ('partial_return','partial_delivered')) AS partial,
      COUNT(*) FILTER (WHERE status::text IN ('shipped','in_transit','courier_entry','ready_to_ship')) AS in_transit,
      COALESCE(SUM(total) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())),0) AS delivered_value,
      COALESCE(SUM(net_collected),0) AS collected,
      COALESCE(SUM(COALESCE(actual_shipping_cost, courier_fee, 0)),0) AS courier_charge,
      AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at))/86400.0)
        FILTER (WHERE delivered_at IS NOT NULL AND delivered_at > shipped_at) AS avg_days
    FROM r
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'shipped')::int DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'courier', courier,
      'shipped', shipped,
      'delivered', delivered,
      'returned', returned,
      'partial', partial,
      'in_transit', in_transit,
      'delivered_value', round(delivered_value,2),
      'collected', round(collected,2),
      'courier_charge', round(courier_charge,2),
      'avg_days', round(COALESCE(avg_days,0)::numeric,2),
      'success_rate', CASE WHEN (delivered + returned) > 0 THEN round(100.0*delivered/(delivered+returned),2) ELSE 0 END,
      'return_rate', CASE WHEN shipped > 0 THEN round(100.0*returned/shipped,2) ELSE 0 END,
      'charge_per_parcel', CASE WHEN shipped > 0 THEN round(courier_charge/shipped,2) ELSE 0 END
    ) AS x
    FROM a
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_delivery_areas(_brand_ids uuid[], _from date, _to date, _dim text DEFAULT 'zone')
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT
      CASE WHEN _dim = 'city'
           THEN COALESCE(NULLIF(TRIM(o.pathao_city_name),''), NULLIF(TRIM(o.shipping_city),''), 'Unknown')
           ELSE COALESCE(NULLIF(TRIM(o.pathao_zone_name),''), NULLIF(TRIM(o.shipping_thana),''), 'Unknown')
      END AS area,
      o.*
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.shipped_at IS NOT NULL
      AND o.shipped_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.shipped_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ), a AS (
    SELECT
      area,
      COUNT(*) AS shipped,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())) AS delivered,
      COUNT(*) FILTER (WHERE status::text IN ('returned','paid_return','unpaid_return','return_in_transit','pending_return')) AS returned,
      COALESCE(SUM(total) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())),0) AS delivered_value,
      COALESCE(SUM(COALESCE(actual_shipping_cost, courier_fee, 0)),0) AS courier_charge,
      AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at))/86400.0)
        FILTER (WHERE delivered_at IS NOT NULL AND delivered_at > shipped_at) AS avg_days
    FROM r GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'shipped')::int DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'area', area,
      'shipped', shipped,
      'delivered', delivered,
      'returned', returned,
      'delivered_value', round(delivered_value,2),
      'courier_charge', round(courier_charge,2),
      'avg_days', round(COALESCE(avg_days,0)::numeric,2),
      'success_rate', CASE WHEN (delivered + returned) > 0 THEN round(100.0*delivered/(delivered+returned),2) ELSE 0 END,
      'return_rate', CASE WHEN shipped > 0 THEN round(100.0*returned/shipped,2) ELSE 0 END
    ) AS x FROM a
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_marketing_ads(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ins AS (
    SELECT i.ad_id,
           SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
           SUM(COALESCE(i.impressions,0)) AS impressions,
           SUM(COALESCE(i.clicks,0)) AS clicks
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids)
      AND i.ad_id IS NOT NULL
      AND i.date >= _from AND i.date <= _to
    GROUP BY 1
  ), att AS (
    SELECT at.ad_id,
           COUNT(DISTINCT o.id) AS orders,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
           COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())),0) AS revenue
    FROM public.mkt_order_attributions at
    JOIN public.orders o ON o.id = at.order_id
    WHERE at.brand_id = ANY(_brand_ids)
      AND at.ad_id IS NOT NULL
      AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    GROUP BY 1
  ), j AS (
    SELECT
      a.id AS ad_id,
      COALESCE(a.name,'(unnamed ad)') AS ad_name,
      COALESCE(ads.name,'—') AS adset_name,
      COALESCE(c.name,'—') AS campaign_name,
      COALESCE(a.effective_status, a.status, '—') AS status,
      COALESCE(ins.spend,0) AS spend,
      COALESCE(ins.impressions,0) AS impressions,
      COALESCE(ins.clicks,0) AS clicks,
      COALESCE(att.orders,0) AS orders,
      COALESCE(att.delivered_orders,0) AS delivered_orders,
      COALESCE(att.revenue,0) AS revenue
    FROM public.mkt_ads a
    LEFT JOIN ins ON ins.ad_id = a.id
    LEFT JOIN att ON att.ad_id = a.id
    LEFT JOIN public.mkt_adsets ads ON ads.id = a.adset_id
    LEFT JOIN public.mkt_campaigns c ON c.id = a.campaign_id
    WHERE a.brand_id = ANY(_brand_ids)
      AND (COALESCE(ins.spend,0) > 0 OR COALESCE(att.orders,0) > 0)
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'spend')::numeric DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'ad_id', ad_id, 'ad_name', ad_name, 'adset_name', adset_name,
      'campaign_name', campaign_name, 'status', status,
      'spend', round(spend,2), 'impressions', impressions, 'clicks', clicks,
      'ctr', CASE WHEN impressions > 0 THEN round(100.0*clicks/impressions,2) ELSE 0 END,
      'cpc', CASE WHEN clicks > 0 THEN round(spend/clicks,2) ELSE 0 END,
      'orders', orders, 'delivered_orders', delivered_orders,
      'revenue', round(revenue,2),
      'roas', CASE WHEN spend > 0 THEN round(revenue/spend,2) ELSE 0 END,
      'cac', CASE WHEN delivered_orders > 0 THEN round(spend/delivered_orders,2) ELSE 0 END
    ) AS x FROM j
  ) s;
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_courier_performance(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_delivery_areas(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_marketing_ads(uuid[], date, date) TO authenticated;
