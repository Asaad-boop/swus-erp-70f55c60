CREATE OR REPLACE FUNCTION public.mkt_campaign_products_summary(_campaign_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH manual AS (
  SELECT cp.campaign_id,
         jsonb_agg(jsonb_build_object(
           'product_id', cp.product_id,
           'title', COALESCE(p.title,'(deleted product)'),
           'sku', p.sku
         ) ORDER BY COALESCE(p.title,'')) AS items,
         COUNT(*) AS cnt
  FROM public.mkt_campaign_products cp
  LEFT JOIN public.products p ON p.id = cp.product_id
  WHERE cp.campaign_id = ANY(_campaign_ids)
  GROUP BY cp.campaign_id
), att AS (
  SELECT a.campaign_id, o.id AS order_id
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.campaign_id = ANY(_campaign_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), li AS (
  SELECT at.campaign_id, oi.product_id,
         COUNT(DISTINCT oi.order_id) AS orders,
         COALESCE(SUM(COALESCE(oi.line_total, oi.price*oi.quantity,0)),0) AS revenue
  FROM public.order_items oi
  JOIN att at ON at.order_id = oi.order_id
  WHERE oi.product_id IS NOT NULL AND COALESCE(oi.is_combo_child,false) = false
  GROUP BY at.campaign_id, oi.product_id
), ranked AS (
  SELECT li.*, p.title, p.sku,
         SUM(li.revenue) OVER (PARTITION BY li.campaign_id) AS total_rev,
         ROW_NUMBER() OVER (PARTITION BY li.campaign_id ORDER BY li.revenue DESC, li.orders DESC, li.product_id) AS rn
  FROM li LEFT JOIN public.products p ON p.id = li.product_id
), auto AS (
  SELECT campaign_id,
         jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'title', COALESCE(title,'(deleted product)'),
           'sku', sku,
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
$$;

REVOKE ALL ON FUNCTION public.mkt_campaign_products_summary(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_products_summary(uuid[], date, date) TO authenticated, service_role;