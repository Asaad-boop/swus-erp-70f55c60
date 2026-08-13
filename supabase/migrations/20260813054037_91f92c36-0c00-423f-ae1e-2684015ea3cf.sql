CREATE OR REPLACE FUNCTION public.mkt_dashboard_kpis(_brand_ids uuid[], _from date, _to date)
 RETURNS TABLE(spend_bdt numeric, impressions bigint, clicks bigint, reach bigint, booked_revenue numeric, orders bigint, confirmed_orders bigint, cancelled_orders bigint, returned_orders bigint, delivered_orders bigint, delivered_revenue numeric, cogs numeric, operating_cost numeric, gross_profit numeric, contribution_profit numeric, cost_missing_units numeric, new_customers bigint, returning_customers bigint, roas numeric, delivered_roas numeric, mer numeric, cac numeric, cpa numeric, aov numeric, conversion_rate numeric, marketing_cost_pct numeric, return_rate numeric, cancel_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx AS (
    SELECT COALESCE(
      (SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
         FROM public.meta_dollar_purchases WHERE status='confirmed'),
      (SELECT rate FROM public.erp_fx_rates
        WHERE from_ccy='USD' AND to_ccy='BDT' ORDER BY rate_date DESC LIMIT 1),
      0
    ) AS rate
  ),
  ads AS (
    SELECT
      COALESCE(SUM(CASE WHEN i.spend_bdt_fifo IS NOT NULL AND i.spend_bdt_fifo > 0
                        THEN i.spend_bdt_fifo
                        ELSE COALESCE(i.spend,0) * (SELECT rate FROM fx) END), 0)::numeric AS spend_bdt,
      COALESCE(SUM(i.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(i.clicks), 0)::bigint AS clicks,
      COALESCE(SUM(i.reach), 0)::bigint AS reach
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
  ),
  ord AS (
    SELECT
      o.id,
      o.status::text AS status,
      COALESCE(o.total,0)::numeric AS total,
      NULLIF(regexp_replace(COALESCE(o.shipping_phone, o.guest_phone, ''), '\D', '', 'g'), '') AS phone
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
      AND o.status::text NOT IN ('incomplete')
  ),
  osum AS (
    SELECT
      COUNT(*)::bigint AS orders,
      COALESCE(SUM(total),0)::numeric AS booked_revenue,
      COUNT(*) FILTER (WHERE status NOT IN ('new','cancelled','fake','on_hold'))::bigint AS confirmed_orders,
      COUNT(*) FILTER (WHERE status IN ('cancelled','fake'))::bigint AS cancelled_orders,
      COUNT(*) FILTER (WHERE status IN ('returned','unpaid_return','paid_return','partial_return','return_in_transit','pending_return'))::bigint AS returned_orders
    FROM ord
  ),
  all_orders AS (
    SELECT
      NULLIF(regexp_replace(COALESCE(p.shipping_phone, p.guest_phone, ''), '\D', '', 'g'), '') AS phone,
      (p.created_at AT TIME ZONE 'Asia/Dhaka')::date AS d
    FROM public.orders p
    WHERE p.brand_id = ANY(_brand_ids)
  ),
  cust AS (
    SELECT
      COUNT(*) FILTER (WHERE first_seen >= _from)::bigint AS new_customers,
      COUNT(*) FILTER (WHERE first_seen < _from)::bigint AS returning_customers
    FROM (
      SELECT a.phone, MIN(a.d) AS first_seen
        FROM all_orders a
       WHERE a.phone IS NOT NULL
         AND a.phone IN (SELECT phone FROM ord WHERE phone IS NOT NULL)
       GROUP BY a.phone
    ) t
  ),
  deliv AS (
    SELECT
      COUNT(DISTINCT l.order_id)::bigint AS delivered_orders,
      COALESCE(SUM(l.line_total),0)::numeric AS delivered_revenue,
      COALESCE(SUM(l.line_cogs),0)::numeric AS cogs,
      COALESCE(SUM(l.operating_cost),0)::numeric AS operating_cost,
      COALESCE(SUM(CASE WHEN l.cost_missing THEN l.quantity ELSE 0 END),0)::numeric AS cost_missing_units
    FROM unnest(_brand_ids) AS b(id)
    CROSS JOIN LATERAL public.mkt_delivered_line_costs(b.id, _from, _to) l
  )
  SELECT
    a.spend_bdt, a.impressions, a.clicks, a.reach,
    s.booked_revenue, s.orders, s.confirmed_orders, s.cancelled_orders, s.returned_orders,
    d.delivered_orders, d.delivered_revenue, d.cogs, d.operating_cost,
    (d.delivered_revenue - d.cogs - d.operating_cost)::numeric AS gross_profit,
    (d.delivered_revenue - d.cogs - d.operating_cost - a.spend_bdt)::numeric AS contribution_profit,
    d.cost_missing_units,
    c.new_customers, c.returning_customers,
    CASE WHEN a.spend_bdt > 0 THEN s.booked_revenue / a.spend_bdt END AS roas,
    CASE WHEN a.spend_bdt > 0 THEN d.delivered_revenue / a.spend_bdt END AS delivered_roas,
    CASE WHEN a.spend_bdt > 0 THEN s.booked_revenue / a.spend_bdt END AS mer,
    CASE WHEN c.new_customers > 0 THEN a.spend_bdt / c.new_customers END AS cac,
    CASE WHEN s.orders > 0 THEN a.spend_bdt / s.orders END AS cpa,
    CASE WHEN s.orders > 0 THEN s.booked_revenue / s.orders END AS aov,
    CASE WHEN a.clicks > 0 THEN (s.orders::numeric / a.clicks) * 100 END AS conversion_rate,
    CASE WHEN s.booked_revenue > 0 THEN (a.spend_bdt / s.booked_revenue) * 100 END AS marketing_cost_pct,
    CASE WHEN s.orders > 0 THEN (s.returned_orders::numeric / s.orders) * 100 END AS return_rate,
    CASE WHEN s.orders > 0 THEN (s.cancelled_orders::numeric / s.orders) * 100 END AS cancel_rate
  FROM ads a, osum s, cust c, deliv d;
$function$;