CREATE OR REPLACE FUNCTION public.rpt_sales_breakdown(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered', _dim text DEFAULT 'source'
)
RETURNS TABLE(
  label text, orders bigint, delivered_orders bigint, units numeric,
  net_revenue numeric, cogs numeric, gross_profit numeric, courier_cost numeric,
  return_rate numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  z AS (
    SELECT o.id,
           COALESCE(NULLIF(o.pathao_zone_name, ''), 'Unknown') AS zone_name
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
  ),
  c AS (
    SELECT p.id AS product_id,
           COALESCE((SELECT cat.name FROM public.categories cat WHERE cat.id = p.category_id), 'Uncategorized') AS category_name
    FROM public.products p
  ),
  k AS (
    SELECT l.*,
      CASE _dim
        WHEN 'payment'  THEN l.payment_method
        WHEN 'courier'  THEN l.courier_name
        WHEN 'city'     THEN l.city
        WHEN 'zone'     THEN COALESCE(z.zone_name, 'Unknown')
        WHEN 'category' THEN COALESCE(c.category_name, 'Uncategorized')
        WHEN 'brand'    THEN COALESCE((SELECT b.name FROM public.brands b WHERE b.id = l.brand_id), 'Unknown')
        WHEN 'status'   THEN l.status
        ELSE l.source
      END AS label
    FROM l
    LEFT JOIN z ON z.id = l.order_id
    LEFT JOIN c ON c.product_id = l.product_id
  )
  SELECT
    k.label,
    COUNT(DISTINCT k.order_id) AS orders,
    COUNT(DISTINCT k.order_id) FILTER (WHERE k.is_delivered) AS delivered_orders,
    COALESCE(SUM(k.quantity) FILTER (WHERE k.is_delivered), 0)::numeric AS units,
    round(COALESCE(SUM(k.net_revenue) FILTER (WHERE k.is_delivered), 0), 2) AS net_revenue,
    round(COALESCE(SUM(k.line_cogs) FILTER (WHERE k.is_delivered), 0), 2) AS cogs,
    round(COALESCE(SUM(k.net_revenue - k.line_cogs) FILTER (WHERE k.is_delivered), 0), 2) AS gross_profit,
    round(COALESCE(SUM(k.courier_cost) FILTER (WHERE k.is_delivered), 0), 2) AS courier_cost,
    CASE WHEN COUNT(DISTINCT k.order_id) > 0
      THEN round(100.0 * COUNT(DISTINCT k.order_id) FILTER (WHERE k.is_returned) / COUNT(DISTINCT k.order_id), 2)
      ELSE 0 END AS return_rate
  FROM k
  GROUP BY k.label
  ORDER BY 5 DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_sales_breakdown(uuid[], date, date, text, text) TO authenticated;