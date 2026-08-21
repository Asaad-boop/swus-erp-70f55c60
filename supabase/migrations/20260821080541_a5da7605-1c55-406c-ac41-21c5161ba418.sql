CREATE OR REPLACE FUNCTION public.rpt_product_360(_brand_ids uuid[], _from date, _to date, _product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH span AS (
  SELECT (_to - _from + 1) AS days,
         (_from - (_to - _from + 1))::date AS pfrom,
         (_from - 1)::date AS pto
), prod AS (
  SELECT p.id, p.title, p.sku, p.image, p.is_active, COALESCE(p.price,0) AS price,
         COALESCE(p.cost_price,0) AS cost_price, COALESCE(p.weighted_avg_cost,0) AS wac,
         COALESCE(p.stock,0) AS stock, COALESCE(p.available_stock,0) AS available_stock,
         b.name AS brand_name
  FROM public.products p LEFT JOIN public.brands b ON b.id = p.brand_id
  WHERE p.id = _product_id
), ord AS (
  SELECT o.id, o.status::text AS status, COALESCE(o.source::text,'manual') AS source,
         COALESCE(o.confirmation_status::text,'pending') AS confirmation_status,
         COALESCE(NULLIF(o.pathao_city_name,''), NULLIF(o.shipping_district,''), NULLIF(o.shipping_city,''), 'Unknown') AS district,
         COALESCE(o.total,0) AS total, COALESCE(o.advance_amount,0) AS advance_amount,
         COALESCE(o.discount_amount,0) AS discount_amount,
         NULLIF(regexp_replace(COALESCE(o.shipping_phone,''), '\D', '', 'g'), '') AS phone,
         COALESCE(o.payment_status::text,'unpaid') AS payment_status,
         (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
         CASE WHEN o.delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (o.delivered_at - o.created_at))/86400.0 END AS days_to_deliver,
         (o.status::text = ANY(public.rpt_delivered_statuses())) AS is_delivered,
         (o.status::text = ANY(public.rpt_returned_statuses())) AS is_returned,
         (o.status::text IN ('cancelled','fake')) AS is_cancelled,
         (o.confirmed_at IS NOT NULL) AS is_confirmed,
         CASE WHEN (o.created_at AT TIME ZONE 'Asia/Dhaka')::date >= _from THEN 'cur' ELSE 'prev' END AS period
  FROM public.orders o, span
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (span.pfrom::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.product_id = _product_id)
), tot AS (
  SELECT oi.order_id, SUM(COALESCE(oi.line_total,0)) AS lines_total
  FROM public.order_items oi JOIN ord ON ord.id = oi.order_id GROUP BY 1
), line AS (
  SELECT o.*,
         SUM(COALESCE(oi.quantity,0)) AS qty,
         SUM(COALESCE(oi.line_total,0)) AS line_total,
         SUM(COALESCE(oi.quantity,0) * COALESCE(NULLIF(oi.unit_cost_snapshot,0), NULLIF(pv.weighted_avg_cost,0), NULLIF(p.weighted_avg_cost,0), NULLIF(p.cost_price,0), 0)) AS line_cogs,
         SUM(COALESCE(oi.quantity,0)) FILTER (WHERE COALESCE(NULLIF(oi.unit_cost_snapshot,0), NULLIF(pv.weighted_avg_cost,0), NULLIF(p.weighted_avg_cost,0), NULLIF(p.cost_price,0), 0) = 0) AS qty_no_cost,
         SUM(COALESCE(oi.courier_cost_allocated,0)) AS courier_cost,
         SUM(COALESCE(oi.packaging_cost_allocated,0)) AS packaging_cost,
         CASE WHEN COALESCE(MAX(t.lines_total),0) > 0
              THEN SUM(COALESCE(oi.line_total,0)) / MAX(t.lines_total) ELSE 1 END AS share
  FROM ord o
  JOIN public.order_items oi ON oi.order_id = o.id AND oi.product_id = _product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN tot t ON t.order_id = o.id
  GROUP BY o.id, o.status, o.source, o.confirmation_status, o.district, o.total,
           o.advance_amount, o.discount_amount, o.phone, o.payment_status, o.day,
           o.days_to_deliver, o.is_delivered, o.is_returned, o.is_cancelled, o.is_confirmed, o.period
), cur AS (
  SELECT * FROM line WHERE period = 'cur'
), prv AS (
  SELECT * FROM line WHERE period = 'prev'
), variants AS (
  SELECT COALESCE(NULLIF(pv.color_name,''), NULLIF(pv.sku,''), 'Default') AS label,
         COALESCE(pv.sku,'') AS sku,
         COALESCE(pv.color_hex,'') AS color_hex,
         SUM(COALESCE(oi.quantity,0)) AS units,
         SUM(COALESCE(oi.quantity,0)) FILTER (WHERE c.is_delivered) AS delivered_units,
         SUM(COALESCE(oi.quantity,0)) FILTER (WHERE c.is_returned) AS returned_units,
         COALESCE(SUM(COALESCE(oi.line_total,0)) FILTER (WHERE c.is_delivered),0) AS revenue,
         COUNT(DISTINCT oi.order_id) AS orders
  FROM cur c
  JOIN public.order_items oi ON oi.order_id = c.id AND oi.product_id = _product_id
  LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
  GROUP BY 1,2,3
), recon AS (
  SELECT l.id AS order_id,
         SUM(COALESCE(r.collected,0)) * MAX(l.share) AS collected,
         SUM(COALESCE(r.total_fee,0))  * MAX(l.share) AS fees,
         SUM(COALESCE(r.payout,0))     * MAX(l.share) AS payout
  FROM cur l
  JOIN public.erp_reconciliation_rows r ON r.matched_order_id = l.id AND r.match_status IN ('matched','accepted','settled','resolved')
  GROUP BY l.id
), all_att AS (
  SELECT DISTINCT ON (a.order_id)
         a.order_id, COALESCE(a.campaign_id, c1.id) AS campaign_id, COALESCE(o.total,0) AS total,
         CASE WHEN (o.created_at AT TIME ZONE 'Asia/Dhaka')::date >= _from THEN 'cur' ELSE 'prev' END AS period
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  CROSS JOIN span
  LEFT JOIN public.mkt_campaigns c1 ON a.campaign_id IS NULL AND a.utm_campaign IS NOT NULL
        AND c1.external_id = a.utm_campaign AND c1.brand_id = ANY(_brand_ids)
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (span.pfrom::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ORDER BY a.order_id, a.confidence DESC NULLS LAST, a.created_at DESC
), camp_spend AS (
  SELECT i.campaign_id,
         CASE WHEN i.date >= _from THEN 'cur' ELSE 'prev' END AS period,
         SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend
  FROM public.mkt_insights_daily i, span
  WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN span.pfrom AND _to
  GROUP BY 1,2
), camp_att_total AS (
  SELECT campaign_id, period, SUM(total) AS att_total
  FROM all_att WHERE campaign_id IS NOT NULL GROUP BY 1,2
), order_ads AS (
  SELECT l.id AS order_id, l.period, a.campaign_id,
         CASE WHEN COALESCE(cat.att_total,0) > 0
              THEN COALESCE(cs.spend,0) * l.total / cat.att_total * l.share ELSE 0 END AS ad_spend
  FROM line l
  JOIN all_att a ON a.order_id = l.id AND a.campaign_id IS NOT NULL
  LEFT JOIN camp_spend cs ON cs.campaign_id = a.campaign_id AND cs.period = l.period
  LEFT JOIN camp_att_total cat ON cat.campaign_id = a.campaign_id AND cat.period = l.period
), camps AS (
  SELECT c.id AS campaign_id, COALESCE(c.name,'—') AS campaign_name,
         COALESCE(SUM(oa.ad_spend),0) AS ad_spend,
         COUNT(DISTINCT oa.order_id) AS orders,
         COUNT(DISTINCT oa.order_id) FILTER (WHERE l.is_delivered) AS delivered_orders,
         COALESCE(SUM(l.line_total) FILTER (WHERE l.is_delivered),0) AS revenue,
         COALESCE(SUM(l.line_cogs) FILTER (WHERE l.is_delivered),0) AS cogs
  FROM order_ads oa
  JOIN cur l ON l.id = oa.order_id
  JOIN public.mkt_campaigns c ON c.id = oa.campaign_id
  WHERE oa.period = 'cur'
  GROUP BY c.id, c.name
), cust AS (
  SELECT phone, COUNT(*) AS n FROM cur WHERE phone IS NOT NULL GROUP BY 1
)
SELECT jsonb_build_object(
  'product', (SELECT to_jsonb(prod) FROM prod),
  'range_days', (SELECT days FROM span),
  'prev_range', (SELECT jsonb_build_object('from', pfrom::text, 'to', pto::text) FROM span),
  'summary', (
    SELECT jsonb_build_object(
      'orders', COUNT(*),
      'units_ordered', COALESCE(SUM(qty),0),
      'booked_value', COALESCE(SUM(line_total),0),
      'discount', COALESCE(SUM(discount_amount * share),0),
      'confirmed_orders', COUNT(*) FILTER (WHERE is_confirmed OR is_delivered),
      'cancelled_orders', COUNT(*) FILTER (WHERE is_cancelled),
      'returned_orders', COUNT(*) FILTER (WHERE is_returned),
      'delivered_orders', COUNT(*) FILTER (WHERE is_delivered),
      'open_orders', COUNT(*) FILTER (WHERE NOT is_delivered AND NOT is_cancelled AND NOT is_returned),
      'open_units', COALESCE(SUM(qty) FILTER (WHERE NOT is_delivered AND NOT is_cancelled AND NOT is_returned),0),
      'open_value', COALESCE(SUM(line_total) FILTER (WHERE NOT is_delivered AND NOT is_cancelled AND NOT is_returned),0),
      'delivered_units', COALESCE(SUM(qty) FILTER (WHERE is_delivered),0),
      'returned_units', COALESCE(SUM(qty) FILTER (WHERE is_returned),0),
      'returned_value', COALESCE(SUM(line_total) FILTER (WHERE is_returned),0),
      'delivered_revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0),
      'cogs', COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered),0),
      'courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered),0),
      'packaging_cost', COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered),0),
      'return_courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_returned),0),
      'units_no_cost', COALESCE(SUM(qty_no_cost) FILTER (WHERE is_delivered),0),
      'advance_collected', COALESCE(SUM(advance_amount * share) FILTER (WHERE is_delivered),0),
      'paid_orders', COUNT(*) FILTER (WHERE payment_status = 'paid'),
      'avg_days_to_deliver', COALESCE(ROUND(AVG(days_to_deliver) FILTER (WHERE is_delivered)::numeric, 1), 0),
      'delivery_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_delivered)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END,
      'return_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_returned)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END,
      'cancel_rate', CASE WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_cancelled)::numeric * 100 / COUNT(*), 2) ELSE 0 END
    ) FROM cur
  ),
  'prev', (
    SELECT jsonb_build_object(
      'orders', COUNT(*),
      'units_ordered', COALESCE(SUM(qty),0),
      'delivered_orders', COUNT(*) FILTER (WHERE is_delivered),
      'delivered_units', COALESCE(SUM(qty) FILTER (WHERE is_delivered),0),
      'delivered_revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0),
      'cogs', COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered),0),
      'courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered),0),
      'packaging_cost', COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered),0),
      'return_courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_returned),0),
      'ad_spend', COALESCE((SELECT SUM(ad_spend) FROM order_ads WHERE period='prev'),0),
      'delivery_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_delivered)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END,
      'return_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_returned)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END
    ) FROM prv
  ),
  'customers', (
    SELECT jsonb_build_object(
      'unique_customers', COUNT(*),
      'repeat_customers', COUNT(*) FILTER (WHERE n > 1),
      'repeat_rate', CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE n > 1)::numeric * 100 / COUNT(*), 2) ELSE 0 END
    ) FROM cust
  ),
  'health', (
    SELECT jsonb_build_object(
      'units_no_cost', COALESCE(SUM(c.qty_no_cost) FILTER (WHERE c.is_delivered),0),
      'delivered_no_courier_cost', COUNT(*) FILTER (WHERE c.is_delivered AND COALESCE(c.courier_cost,0) = 0),
      'delivered_unreconciled', COUNT(*) FILTER (WHERE c.is_delivered AND NOT EXISTS (SELECT 1 FROM recon r WHERE r.order_id = c.id)),
      'unattributed_orders', COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM order_ads oa WHERE oa.order_id = c.id AND oa.period='cur')),
      'total_orders', COUNT(*)
    ) FROM cur c
  ),
  'money', (
    SELECT jsonb_build_object(
      'collected', COALESCE(SUM(collected),0),
      'fees', COALESCE(SUM(fees),0),
      'payout', COALESCE(SUM(payout),0),
      'settled_orders', COUNT(*)
    ) FROM recon
  ),
  'ads', (
    SELECT jsonb_build_object(
      'ad_spend', COALESCE(SUM(ad_spend),0),
      'attributed_orders', COUNT(DISTINCT order_id)
    ) FROM order_ads WHERE period = 'cur'
  ),
  'variants', COALESCE((
    SELECT jsonb_agg(to_jsonb(variants) ORDER BY variants.units DESC) FROM variants
  ), '[]'::jsonb),
  'by_status', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', status, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'value', COALESCE(SUM(line_total),0)) AS x
      FROM cur GROUP BY status
    ) s
  ), '[]'::jsonb),
  'by_source', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', source, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered', COUNT(*) FILTER (WHERE is_delivered),
                                'returned', COUNT(*) FILTER (WHERE is_returned),
                                'revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0),
                                'value', COALESCE(SUM(line_total),0)) AS x
      FROM cur GROUP BY source
    ) s
  ), '[]'::jsonb),
  'by_district', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', district, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered', COUNT(*) FILTER (WHERE is_delivered),
                                'returned', COUNT(*) FILTER (WHERE is_returned),
                                'revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0)) AS x
      FROM cur GROUP BY district
    ) s
  ), '[]'::jsonb),
  'daily', COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
      SELECT jsonb_build_object('day', day::text, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered_orders', COUNT(*) FILTER (WHERE is_delivered),
                                'returned_orders', COUNT(*) FILTER (WHERE is_returned),
                                'cogs', COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered),0),
                                'revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0)) AS x
      FROM cur GROUP BY day
    ) s
  ), '[]'::jsonb),
  'campaigns', COALESCE((
    SELECT jsonb_agg(to_jsonb(camps) ORDER BY camps.ad_spend DESC) FROM camps
  ), '[]'::jsonb)
);
$function$;