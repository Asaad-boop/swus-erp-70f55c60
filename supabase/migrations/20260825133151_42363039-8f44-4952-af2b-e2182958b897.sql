CREATE OR REPLACE FUNCTION public.rpt_sales_timeseries(
  _brand_ids uuid[],
  _from date,
  _to date,
  _basis text DEFAULT 'delivered'::text
)
RETURNS TABLE(
  day date,
  orders bigint,
  delivered_orders bigint,
  units numeric,
  net_revenue numeric,
  cogs numeric,
  gross_profit numeric,
  courier_cost numeric,
  contribution_profit numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
  ),
  daily_shipping AS (
    SELECT
      x.day,
      COALESCE(SUM(COALESCE(o.shipping_fee, 0)), 0)::numeric AS shipping_income
    FROM (
      SELECT DISTINCT day, order_id
      FROM l
      WHERE is_delivered
    ) x
    JOIN public.orders o ON o.id = x.order_id
    GROUP BY x.day
  )
  SELECT
    d.day::date,
    COUNT(DISTINCT l.order_id) AS orders,
    COUNT(DISTINCT l.order_id) FILTER (WHERE l.is_delivered) AS delivered_orders,
    COALESCE(SUM(l.quantity) FILTER (WHERE l.is_delivered), 0)::numeric AS units,
    round(COALESCE(SUM(l.net_revenue) FILTER (WHERE l.is_delivered), 0), 2) AS net_revenue,
    round(COALESCE(SUM(l.line_cogs) FILTER (WHERE l.is_delivered), 0), 2) AS cogs,
    round(COALESCE(SUM(l.net_revenue - l.line_cogs) FILTER (WHERE l.is_delivered), 0), 2) AS gross_profit,
    round(COALESCE(SUM(l.courier_cost) FILTER (WHERE l.is_delivered), 0), 2) AS courier_cost,
    round(
      COALESCE(SUM(l.net_revenue - l.line_cogs - l.courier_cost - l.packaging_cost - l.refund_alloc)
        FILTER (WHERE l.is_delivered), 0)
      + COALESCE(ds.shipping_income, 0),
      2
    ) AS contribution_profit
  FROM generate_series(_from::date, _to::date, interval '1 day') d(day)
  LEFT JOIN l ON l.day = d.day::date
  LEFT JOIN daily_shipping ds ON ds.day = d.day::date
  GROUP BY d.day, ds.shipping_income
  ORDER BY d.day;
$function$;

REVOKE ALL ON FUNCTION public.rpt_sales_timeseries(uuid[], date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpt_sales_timeseries(uuid[], date, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpt_sales_timeseries(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_sales_timeseries(uuid[], date, date, text) TO service_role;