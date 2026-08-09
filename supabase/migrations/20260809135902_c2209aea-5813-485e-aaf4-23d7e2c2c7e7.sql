CREATE OR REPLACE FUNCTION public.rpt_sales_summary(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  agg AS (
    SELECT
      COUNT(DISTINCT order_id) FILTER (WHERE is_delivered) AS delivered_orders,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered), 0) AS units_sold,
      COALESCE(SUM(gross_line) FILTER (WHERE is_delivered), 0) AS gross_sales,
      COALESCE(SUM(discount_alloc) FILTER (WHERE is_delivered), 0) AS discounts,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_delivered), 0) AS net_revenue,
      COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered), 0) AS cogs,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered), 0) AS courier_cost,
      COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered), 0) AS packaging_cost,
      COALESCE(SUM(refund_alloc) FILTER (WHERE is_delivered), 0) AS refunds,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_returned), 0) AS returned_value,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_returned), 0) AS return_courier_cost,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered AND cost_missing), 0) AS cost_missing_units
    FROM l
  ),
  cohort AS (
    SELECT
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE o.status::text IN ('delivered','completed','partial_delivered')) AS c_delivered,
      COUNT(*) FILTER (WHERE o.status::text IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return')) AS c_returned,
      COUNT(*) FILTER (WHERE o.status::text IN ('cancelled','fake')) AS c_cancelled,
      COUNT(*) FILTER (WHERE o.status::text NOT IN ('delivered','completed','partial_delivered','returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return','cancelled','fake')) AS c_open
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  )
  SELECT jsonb_build_object(
    'orders_placed', c.placed,
    'open_orders', c.c_open,
    'delivered_orders', a.delivered_orders,
    'returned_orders', c.c_returned,
    'cancelled_orders', c.c_cancelled,
    'units_sold', a.units_sold,
    'gross_sales', round(a.gross_sales, 2),
    'discounts', round(a.discounts, 2),
    'net_revenue', round(a.net_revenue, 2),
    'cogs', round(a.cogs, 2),
    'gross_profit', round(a.net_revenue - a.cogs, 2),
    'courier_cost', round(a.courier_cost, 2),
    'packaging_cost', round(a.packaging_cost, 2),
    'refunds', round(a.refunds, 2),
    'returned_value', round(a.returned_value, 2),
    'return_courier_cost', round(a.return_courier_cost, 2),
    'contribution_profit', round(a.net_revenue - a.cogs - a.courier_cost - a.packaging_cost - a.refunds - a.return_courier_cost, 2),
    'aov', CASE WHEN a.delivered_orders > 0 THEN round(a.net_revenue / a.delivered_orders, 2) ELSE 0 END,
    'delivery_rate', CASE WHEN (c.c_delivered + c.c_returned + c.c_cancelled) > 0 THEN round(100.0 * c.c_delivered / (c.c_delivered + c.c_returned + c.c_cancelled), 2) ELSE 0 END,
    'return_rate', CASE WHEN (c.c_delivered + c.c_returned) > 0 THEN round(100.0 * c.c_returned / (c.c_delivered + c.c_returned), 2) ELSE 0 END,
    'cancel_rate', CASE WHEN c.placed > 0 THEN round(100.0 * c.c_cancelled / c.placed, 2) ELSE 0 END,
    'cost_missing_units', a.cost_missing_units
  ) FROM agg a CROSS JOIN cohort c;
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_sales_summary(uuid[], date, date, text) TO authenticated;