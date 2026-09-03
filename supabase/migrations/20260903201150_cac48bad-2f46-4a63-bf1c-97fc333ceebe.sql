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
), pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), ord2 AS (
  SELECT o.id, o.status::text AS status, o.confirmation_status::text AS confirmation_status,
         COALESCE(o.total,0)::numeric AS total,
         pc.campaign_id AS cid, pc.source AS attr_source, pc.priority AS attr_priority,
         pc.confidence AS attr_conf
  FROM public.orders o
  JOIN pc ON pc.order_id = o.id
  WHERE o.brand_id = ANY(_brand_ids)
), att AS (
  SELECT cid,
    COUNT(*) AS orders,
    COUNT(*) AS attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority <= 2) AS explicit_attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority > 2) AS auto_attributed_orders,
    0 AS unlinked_orders,
    AVG(COALESCE(attr_conf,0)) AS attr_confidence,
    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed'
                        OR status NOT IN ('new','incomplete','cancelled','fake','on_hold','advance_payment_pending')) AS confirmed_orders,
    COUNT(*) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
    COUNT(*) FILTER (WHERE status IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS returned_orders,
    COUNT(*) FILTER (WHERE status IN ('cancelled','fake')) AS cancelled_orders,
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled','fake','returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')
      AND NOT (status = ANY(public.rpt_delivered_statuses()))) AS in_progress_orders,
    COALESCE(SUM(total) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())),0) AS delivered_revenue,
    COALESCE(SUM(total),0) AS booked_revenue,
    MODE() WITHIN GROUP (ORDER BY attr_source) AS primary_source
  FROM ord2 WHERE cid IS NOT NULL GROUP BY 1
), cash AS (
  SELECT (e->>'campaign_id')::uuid AS cid, e AS c
  FROM jsonb_array_elements(public.mkt_campaign_cash(_brand_ids, _from, _to)) e
), j AS (
  SELECT c.id, COALESCE(c.name,'(unnamed)') AS name, COALESCE(c.effective_status, c.status, '—') AS status,
    c.external_id,
    COALESCE(i.spend,0) AS spend, COALESCE(i.clicks,0) AS clicks,
    COALESCE(i.meta_purchases,0) AS meta_purchases,
    COALESCE(i.meta_purchase_value,0) AS meta_purchase_value,
    COALESCE(t.orders,0) AS orders,
    COALESCE(t.attributed_orders,0) AS attributed_orders,
    COALESCE(t.explicit_attributed_orders,0) AS explicit_attributed_orders,
    COALESCE(t.auto_attributed_orders,0) AS auto_attributed_orders,
    COALESCE(t.unlinked_orders,0) AS unlinked_orders,
    t.attr_confidence,
    COALESCE(t.confirmed_orders,0) AS confirmed_orders,
    COALESCE(t.delivered_orders,0) AS delivered_orders,
    COALESCE(t.returned_orders,0) AS returned_orders,
    COALESCE(t.cancelled_orders,0) AS cancelled_orders,
    COALESCE(t.in_progress_orders,0) AS in_progress_orders,
    COALESCE(t.delivered_revenue,0) AS delivered_revenue,
    COALESCE(t.booked_revenue,0) AS booked_revenue,
    t.primary_source,
    ch.c AS cash
  FROM public.mkt_campaigns c
  LEFT JOIN ins i ON i.cid = c.id
  LEFT JOIN att t ON t.cid = c.id
  LEFT JOIN cash ch ON ch.cid = c.id
  WHERE (COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0)
    AND (
      c.brand_id = ANY(_brand_ids)
      OR i.cid IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.mkt_ad_accounts a
                  WHERE a.id = c.account_id AND a.brand_id = ANY(_brand_ids))
      OR EXISTS (SELECT 1 FROM public.mkt_ad_account_brands ab
                  WHERE ab.ad_account_id = c.account_id AND ab.brand_id = ANY(_brand_ids))
    )
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
    'explicit_attributed_orders', explicit_attributed_orders,
    'auto_attributed_orders', auto_attributed_orders,
    'unlinked_orders', unlinked_orders,
    'attribution_source', primary_source,
    'attribution_confidence', CASE WHEN attr_confidence IS NULL THEN NULL ELSE round(100.0*attr_confidence,1) END,
    'attribution_coverage', CASE WHEN orders > 0 THEN round(100.0*attributed_orders/orders,1) ELSE NULL END,
    'match_status', CASE
      WHEN orders = 0 AND spend > 0 THEN 'no_orders'
      WHEN explicit_attributed_orders = orders AND orders > 0 THEN 'linked'
      WHEN explicit_attributed_orders = 0 THEN 'utm_only'
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
  ) || COALESCE(cash - 'campaign_id', '{}'::jsonb) AS x FROM j
) s;
$function$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_truth(uuid[], date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_campaign_products_summary(_campaign_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH manual AS (
  SELECT cp.campaign_id,
         jsonb_agg(jsonb_build_object(
           'product_id', cp.product_id,
           'title', COALESCE(p.title,'(deleted product)'),
           'sku', p.sku,
           'image', p.image
         ) ORDER BY COALESCE(p.title,'')) AS items,
         COUNT(*) AS cnt
  FROM public.mkt_campaign_products cp
  LEFT JOIN public.products p ON p.id = cp.product_id
  WHERE cp.campaign_id = ANY(_campaign_ids)
  GROUP BY cp.campaign_id
), win AS (
  SELECT o.id, o.fb_campaign_id, o.utm_campaign
  FROM public.orders o
  WHERE o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), att AS (
  SELECT DISTINCT campaign_id, order_id FROM (
    SELECT a.campaign_id, w.id AS order_id
    FROM public.mkt_order_attributions a
    JOIN win w ON w.id = a.order_id
    WHERE a.campaign_id = ANY(_campaign_ids)
    UNION ALL
    SELECT c.id, w.id
    FROM win w
    JOIN public.mkt_campaigns c
      ON c.id = ANY(_campaign_ids)
     AND c.external_id IS NOT NULL
     AND c.external_id IN (NULLIF(w.fb_campaign_id,''), NULLIF(w.utm_campaign,''))
    UNION ALL
    SELECT c.id, w.id
    FROM win w
    JOIN public.mkt_campaigns c
      ON c.id = ANY(_campaign_ids)
     AND c.name IS NOT NULL
     AND lower(c.name) = lower(NULLIF(w.utm_campaign,''))
  ) u
), li AS (
  SELECT at.campaign_id, oi.product_id,
         COUNT(DISTINCT oi.order_id) AS orders,
         COALESCE(SUM(COALESCE(oi.line_total, oi.price*oi.quantity,0)),0) AS revenue
  FROM public.order_items oi
  JOIN att at ON at.order_id = oi.order_id
  WHERE oi.product_id IS NOT NULL AND COALESCE(oi.is_combo_child,false) = false
  GROUP BY at.campaign_id, oi.product_id
), ranked AS (
  SELECT li.*, p.title, p.sku, p.image,
         SUM(li.revenue) OVER (PARTITION BY li.campaign_id) AS total_rev,
         ROW_NUMBER() OVER (PARTITION BY li.campaign_id ORDER BY li.revenue DESC, li.orders DESC, li.product_id) AS rn
  FROM li LEFT JOIN public.products p ON p.id = li.product_id
), auto AS (
  SELECT campaign_id,
         jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'title', COALESCE(title,'(deleted product)'),
           'sku', sku,
           'image', image,
           'orders', orders,
           'revenue', round(revenue,2),
           'share', CASE WHEN total_rev > 0 THEN round(100*revenue/total_rev,1) ELSE NULL END
         ) ORDER BY rn) AS items
  FROM ranked WHERE rn <= 3
  GROUP BY campaign_id
)
SELECT COALESCE(jsonb_object_agg(c.cid, jsonb_build_object(
  'manual', COALESCE(m.items, '[]'::jsonb),
  'manual_count', COALESCE(m.cnt, 0),
  'auto', COALESCE(a.items, '[]'::jsonb)
)), '{}'::jsonb)
FROM (SELECT DISTINCT unnest(_campaign_ids) AS cid) c
LEFT JOIN manual m ON m.campaign_id = c.cid
LEFT JOIN auto a ON a.campaign_id = c.cid;
$function$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_products_summary(uuid[], date, date) TO authenticated;