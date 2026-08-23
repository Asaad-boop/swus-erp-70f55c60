CREATE OR REPLACE FUNCTION public.mkt_campaign_product_perf(_campaign_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH att AS (
  SELECT o.id AS order_id, o.status::text AS status
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.campaign_id = _campaign_id
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), li AS (
  SELECT
    oi.product_id,
    COUNT(DISTINCT oi.order_id) AS orders,
    SUM(oi.quantity) AS qty,
    COUNT(DISTINCT oi.order_id) FILTER (WHERE at.status = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
    COALESCE(SUM(oi.quantity) FILTER (WHERE at.status = ANY(public.rpt_delivered_statuses())),0) AS delivered_qty,
    COALESCE(SUM(COALESCE(oi.line_total, oi.price*oi.quantity,0)) FILTER (WHERE at.status = ANY(public.rpt_delivered_statuses())),0) AS revenue,
    COALESCE(SUM(COALESCE(oi.unit_cost_snapshot,0)*oi.quantity) FILTER (WHERE at.status = ANY(public.rpt_delivered_statuses())),0) AS cogs,
    COALESCE(SUM(COALESCE(oi.line_total, oi.price*oi.quantity,0)),0) AS booked_revenue
  FROM public.order_items oi
  JOIN att at ON at.order_id = oi.order_id
  WHERE oi.product_id IS NOT NULL AND COALESCE(oi.is_combo_child,false) = false
  GROUP BY oi.product_id
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'revenue')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'product_id', li.product_id,
    'title', COALESCE(p.title,'(deleted product)'),
    'sku', p.sku,
    'image', p.image,
    'orders', li.orders,
    'qty', li.qty,
    'delivered_orders', li.delivered_orders,
    'delivered_qty', li.delivered_qty,
    'revenue', round(li.revenue,2),
    'booked_revenue', round(li.booked_revenue,2),
    'cogs', round(li.cogs,2),
    'gross_profit', round(li.revenue - li.cogs,2),
    'linked', (cp.id IS NOT NULL),
    'weight', COALESCE(cp.weight, 0)
  ) AS x
  FROM li
  LEFT JOIN public.products p ON p.id = li.product_id
  LEFT JOIN public.mkt_campaign_products cp
    ON cp.campaign_id = _campaign_id AND cp.product_id = li.product_id
) s;
$function$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_product_perf(uuid, date, date) TO authenticated, service_role;