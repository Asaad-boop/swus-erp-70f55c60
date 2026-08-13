
-- Phase 4: UTM / Attribution / Funnel

CREATE OR REPLACE FUNCTION public.mkt_utm_breakdown(
  _brand_ids uuid[], _from date, _to date, _dim text DEFAULT 'source'
)
RETURNS TABLE(
  dim_value text, orders bigint, confirmed_orders bigint, delivered_orders bigint,
  cancelled_orders bigint, returned_orders bigint,
  booked_revenue numeric, delivered_revenue numeric, aov numeric,
  delivery_rate numeric, sessions bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH o AS (
    SELECT
      ord.id, ord.status, ord.total,
      COALESCE(NULLIF(TRIM(
        CASE _dim
          WHEN 'source'   THEN COALESCE(ord.utm_source, a.utm_source)
          WHEN 'medium'   THEN COALESCE(ord.utm_medium, a.utm_medium)
          WHEN 'campaign' THEN COALESCE(ord.utm_campaign, a.utm_campaign)
          WHEN 'content'  THEN COALESCE(ord.utm_content, a.utm_content)
          WHEN 'term'     THEN COALESCE(ord.utm_term, a.utm_term)
          WHEN 'landing'  THEN ord.attribution_landing_page
          ELSE COALESCE(ord.utm_source, a.utm_source)
        END
      ), ''), '(none)') AS dim_value
    FROM public.orders ord
    LEFT JOIN LATERAL (
      SELECT * FROM public.mkt_order_attributions m
      WHERE m.order_id = ord.id ORDER BY m.confidence DESC NULLS LAST LIMIT 1
    ) a ON true
    WHERE ord.brand_id = ANY(_brand_ids)
      AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  rev AS (
    SELECT o.dim_value, SUM(COALESCE(oi.line_total,0))::numeric AS delivered_revenue
    FROM o JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.status = 'delivered'
    GROUP BY 1
  ),
  sess AS (
    SELECT
      COALESCE(NULLIF(TRIM(
        CASE _dim
          WHEN 'source'   THEN e.utm_source
          WHEN 'medium'   THEN e.utm_medium
          WHEN 'campaign' THEN e.utm_campaign
          WHEN 'content'  THEN e.utm_content
          WHEN 'term'     THEN e.utm_term
          WHEN 'landing'  THEN e.url
          ELSE e.utm_source
        END
      ), ''), '(none)') AS dim_value,
      COUNT(DISTINCT e.session_id)::bigint AS sessions
    FROM public.mkt_tracking_events e
    WHERE e.brand_id = ANY(_brand_ids)
      AND e.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND e.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    GROUP BY 1
  ),
  agg AS (
    SELECT
      o.dim_value,
      COUNT(*)::bigint AS orders,
      COUNT(*) FILTER (WHERE o.status NOT IN ('new','incomplete','cancelled','fake'))::bigint AS confirmed_orders,
      COUNT(*) FILTER (WHERE o.status = 'delivered')::bigint AS delivered_orders,
      COUNT(*) FILTER (WHERE o.status IN ('cancelled','fake'))::bigint AS cancelled_orders,
      COUNT(*) FILTER (WHERE o.status IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit'))::bigint AS returned_orders,
      COALESCE(SUM(o.total),0)::numeric AS booked_revenue
    FROM o GROUP BY 1
  )
  SELECT
    COALESCE(agg.dim_value, sess.dim_value) AS dim_value,
    COALESCE(agg.orders,0),
    COALESCE(agg.confirmed_orders,0),
    COALESCE(agg.delivered_orders,0),
    COALESCE(agg.cancelled_orders,0),
    COALESCE(agg.returned_orders,0),
    COALESCE(agg.booked_revenue,0),
    COALESCE(rev.delivered_revenue,0),
    CASE WHEN COALESCE(agg.orders,0) > 0 THEN ROUND(COALESCE(agg.booked_revenue,0)/agg.orders,2) ELSE 0 END,
    CASE WHEN COALESCE(agg.orders,0) > 0 THEN ROUND(100.0*COALESCE(agg.delivered_orders,0)/agg.orders,2) ELSE 0 END,
    COALESCE(sess.sessions,0)
  FROM agg
  FULL OUTER JOIN sess ON sess.dim_value = agg.dim_value
  LEFT JOIN rev ON rev.dim_value = agg.dim_value
  ORDER BY 7 DESC, 2 DESC;
$$;

CREATE OR REPLACE FUNCTION public.mkt_funnel(
  _brand_ids uuid[], _from date, _to date
)
RETURNS TABLE(
  impressions bigint, reach bigint, clicks bigint, sessions bigint, page_views bigint,
  orders bigint, confirmed_orders bigint, shipped_orders bigint, delivered_orders bigint,
  returned_orders bigint, cancelled_orders bigint,
  spend numeric, delivered_revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ins AS (
    SELECT
      COALESCE(SUM(i.impressions),0)::bigint AS impressions,
      COALESCE(SUM(i.reach),0)::bigint AS reach,
      COALESCE(SUM(i.clicks),0)::bigint AS clicks,
      COALESCE(SUM(COALESCE(i.spend_bdt_fifo, 0)),0)::numeric AS spend
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
  ),
  ev AS (
    SELECT
      COUNT(DISTINCT e.session_id)::bigint AS sessions,
      COUNT(*) FILTER (WHERE e.event_type = 'page_view')::bigint AS page_views
    FROM public.mkt_tracking_events e
    WHERE e.brand_id = ANY(_brand_ids)
      AND e.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND e.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  o AS (
    SELECT ord.id, ord.status
    FROM public.orders ord
    WHERE ord.brand_id = ANY(_brand_ids)
      AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  oagg AS (
    SELECT
      COUNT(*)::bigint AS orders,
      COUNT(*) FILTER (WHERE status NOT IN ('new','incomplete','cancelled','fake'))::bigint AS confirmed_orders,
      COUNT(*) FILTER (WHERE status IN ('shipped','in_transit','delivered','partial_delivered','returned','paid_return','unpaid_return','partial_return','return_in_transit'))::bigint AS shipped_orders,
      COUNT(*) FILTER (WHERE status = 'delivered')::bigint AS delivered_orders,
      COUNT(*) FILTER (WHERE status IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit'))::bigint AS returned_orders,
      COUNT(*) FILTER (WHERE status IN ('cancelled','fake'))::bigint AS cancelled_orders
    FROM o
  ),
  rev AS (
    SELECT COALESCE(SUM(oi.line_total),0)::numeric AS delivered_revenue
    FROM o JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.status = 'delivered'
  )
  SELECT ins.impressions, ins.reach, ins.clicks, ev.sessions, ev.page_views,
         oagg.orders, oagg.confirmed_orders, oagg.shipped_orders, oagg.delivered_orders,
         oagg.returned_orders, oagg.cancelled_orders, ins.spend, rev.delivered_revenue
  FROM ins, ev, oagg, rev;
$$;

CREATE OR REPLACE FUNCTION public.mkt_attribution_queue(
  _brand_ids uuid[], _limit int DEFAULT 100
)
RETURNS TABLE(
  id uuid, order_id uuid, brand_id uuid, invoice_no text, order_total numeric,
  order_status text, order_created_at timestamptz, customer_name text,
  source text, confidence numeric, matched_signal jsonb,
  suggested_campaign_id uuid, suggested_campaign_name text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.order_id, c.brand_id, o.invoice_no, o.total, o.status::text, o.created_at,
         COALESCE(o.shipping_name, o.guest_name), c.source, c.confidence, c.matched_signal,
         c.suggested_campaign_id, cp.name, c.created_at
  FROM public.mkt_attribution_candidates c
  JOIN public.orders o ON o.id = c.order_id
  LEFT JOIN public.mkt_campaigns cp ON cp.id = c.suggested_campaign_id
  WHERE c.status = 'pending' AND c.brand_id = ANY(_brand_ids)
  ORDER BY c.confidence DESC NULLS LAST, c.created_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.mkt_utm_breakdown(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_funnel(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_attribution_queue(uuid[], int) TO authenticated;
