CREATE OR REPLACE FUNCTION public.mkt_campaign_truth(_brand_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH ins AS (
  SELECT i.campaign_id AS cid,
    SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
    SUM(COALESCE(i.clicks,0)) AS clicks,
    SUM(COALESCE(i.meta_purchases,0)) AS meta_purchases,
    SUM(COALESCE(i.meta_purchase_value,0)) AS meta_purchase_value
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), ord AS (
  SELECT o.id, o.status, o.confirmation_status, o.total,
         (SELECT a.campaign_id FROM public.mkt_order_attributions a
            WHERE a.order_id = o.id AND a.campaign_id IS NOT NULL LIMIT 1) AS linked_cid,
         (SELECT c.id FROM public.mkt_campaigns c
            WHERE c.brand_id = ANY(_brand_ids)
              AND c.external_id IS NOT NULL
              AND c.external_id = COALESCE(NULLIF(o.fb_campaign_id,''), NULLIF(o.utm_campaign,''))
            LIMIT 1) AS utm_cid
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND (o.utm_campaign IS NOT NULL OR o.fb_campaign_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.mkt_order_attributions a WHERE a.order_id = o.id))
), ord2 AS (
  SELECT *, COALESCE(linked_cid, utm_cid) AS cid FROM ord
), att AS (
  SELECT cid,
    COUNT(*) AS orders,
    COUNT(*) FILTER (WHERE linked_cid IS NOT NULL) AS attributed_orders,
    COUNT(*) FILTER (WHERE linked_cid IS NULL) AS unlinked_orders,
    COUNT(*) FILTER (WHERE confirmation_status::text = 'confirmed') AS confirmed_orders,
    COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
    COUNT(*) FILTER (WHERE status::text IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS returned_orders,
    COUNT(*) FILTER (WHERE status::text IN ('cancelled','fake')) AS cancelled_orders,
    COUNT(*) FILTER (WHERE status::text NOT IN ('cancelled','fake','returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')
      AND NOT (status::text = ANY(public.rpt_delivered_statuses()))) AS in_progress_orders,
    COALESCE(SUM(total) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())),0) AS delivered_revenue,
    COALESCE(SUM(total),0) AS booked_revenue
  FROM ord2 WHERE cid IS NOT NULL GROUP BY 1
), j AS (
  SELECT c.id, COALESCE(c.name,'(unnamed)') AS name, COALESCE(c.effective_status, c.status, '—') AS status,
    c.external_id,
    COALESCE(i.spend,0) AS spend, COALESCE(i.clicks,0) AS clicks,
    COALESCE(i.meta_purchases,0) AS meta_purchases,
    COALESCE(i.meta_purchase_value,0) AS meta_purchase_value,
    COALESCE(t.orders,0) AS orders,
    COALESCE(t.attributed_orders,0) AS attributed_orders,
    COALESCE(t.unlinked_orders,0) AS unlinked_orders,
    COALESCE(t.confirmed_orders,0) AS confirmed_orders,
    COALESCE(t.delivered_orders,0) AS delivered_orders,
    COALESCE(t.returned_orders,0) AS returned_orders,
    COALESCE(t.cancelled_orders,0) AS cancelled_orders,
    COALESCE(t.in_progress_orders,0) AS in_progress_orders,
    COALESCE(t.delivered_revenue,0) AS delivered_revenue,
    COALESCE(t.booked_revenue,0) AS booked_revenue
  FROM public.mkt_campaigns c
  LEFT JOIN ins i ON i.cid = c.id
  LEFT JOIN att t ON t.cid = c.id
  WHERE c.brand_id = ANY(_brand_ids)
    AND (COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0)
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'spend')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'id', id, 'name', name, 'status', status, 'external_id', external_id,
    'spend', round(spend,2), 'clicks', clicks,
    'meta_purchases', meta_purchases,
    'meta_purchase_value', round(meta_purchase_value,2),
    'meta_roas', CASE WHEN spend > 0 THEN round(meta_purchase_value/spend,2) ELSE 0 END,
    'orders', orders,
    'attributed_orders', attributed_orders,
    'unlinked_orders', unlinked_orders,
    'match_status', CASE
      WHEN orders = 0 AND spend > 0 THEN 'no_orders'
      WHEN unlinked_orders = 0 THEN 'linked'
      WHEN attributed_orders = 0 THEN 'utm_only'
      ELSE 'partial' END,
    'confirmed_orders', confirmed_orders,
    'delivered_orders', delivered_orders, 'returned_orders', returned_orders,
    'cancelled_orders', cancelled_orders, 'in_progress_orders', in_progress_orders,
    'delivered_revenue', round(delivered_revenue,2),
    'booked_revenue', round(booked_revenue,2),
    'actual_roas', CASE WHEN spend > 0 THEN round(delivered_revenue/spend,2) ELSE 0 END,
    'booked_roas', CASE WHEN spend > 0 THEN round(booked_revenue/spend,2) ELSE 0 END,
    'purchase_gap', orders - meta_purchases,
    'delivery_rate', CASE WHEN orders > 0 THEN round(100.0*delivered_orders/orders,1) ELSE 0 END,
    'cpa', CASE WHEN orders > 0 THEN round(spend/orders,2) ELSE 0 END,
    'cac', CASE WHEN delivered_orders > 0 THEN round(spend/delivered_orders,2) ELSE 0 END
  ) AS x FROM j
) s;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_rerun_campaign_matching(_brand_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  v_scanned int := 0;
BEGIN
  IF NOT public._mkt_require_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  SELECT o.id AS order_id, o.brand_id, o.utm_source, o.utm_medium, o.utm_campaign,
         o.utm_content, o.utm_term, c.id AS campaign_id
  FROM public.orders o
  JOIN public.mkt_campaigns c
    ON c.brand_id = ANY(_brand_ids)
   AND c.external_id IS NOT NULL
   AND c.external_id = COALESCE(NULLIF(o.fb_campaign_id,''), NULLIF(o.utm_campaign,''))
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka');

  SELECT count(*) INTO v_scanned FROM _m;

  WITH upd AS (
    UPDATE public.mkt_order_attributions a
       SET campaign_id = m.campaign_id, updated_at = now()
      FROM _m m
     WHERE a.order_id = m.order_id
       AND a.campaign_id IS DISTINCT FROM m.campaign_id
    RETURNING 1
  ) SELECT count(*) INTO v_updated FROM upd;

  WITH ins AS (
    INSERT INTO public.mkt_order_attributions
      (brand_id, order_id, campaign_id, source, confidence, utm_source, utm_medium, utm_campaign, utm_content, utm_term, note)
    SELECT m.brand_id, m.order_id, m.campaign_id, 'auto_campaign'::mkt_attribution_source, 0.9,
           m.utm_source, m.utm_medium, m.utm_campaign, m.utm_content, m.utm_term, 'rerun matching'
    FROM _m m
    WHERE NOT EXISTS (SELECT 1 FROM public.mkt_order_attributions a WHERE a.order_id = m.order_id)
    ON CONFLICT (order_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('scanned', v_scanned, 'inserted', v_inserted, 'updated', v_updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.mkt_rerun_campaign_matching(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_rerun_campaign_matching(uuid[], date, date) TO authenticated, service_role;