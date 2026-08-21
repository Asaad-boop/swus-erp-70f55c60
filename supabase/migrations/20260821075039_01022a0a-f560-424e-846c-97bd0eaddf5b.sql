CREATE OR REPLACE FUNCTION public.rpt_product_search(_brand_ids uuid[], _q text DEFAULT NULL, _limit int DEFAULT 30)
RETURNS TABLE(product_id uuid, title text, sku text, image text, brand_id uuid, brand_name text,
              is_active boolean, price numeric, cost_price numeric, weighted_avg_cost numeric, stock integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.title, p.sku, p.image, p.brand_id, b.name, COALESCE(p.is_active,false),
         COALESCE(p.price,0), COALESCE(p.cost_price,0), COALESCE(p.weighted_avg_cost,0), COALESCE(p.stock,0)
  FROM public.products p
  LEFT JOIN public.brands b ON b.id = p.brand_id
  WHERE p.brand_id = ANY(_brand_ids)
    AND (
      _q IS NULL OR btrim(_q) = '' OR
      p.title ILIKE '%'||btrim(_q)||'%' OR
      COALESCE(p.sku,'') ILIKE '%'||btrim(_q)||'%' OR
      COALESCE(p.barcode,'') ILIKE '%'||btrim(_q)||'%' OR
      COALESCE(p.slug,'') ILIKE '%'||btrim(_q)||'%' OR
      EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND COALESCE(pv.sku,'') ILIKE '%'||btrim(_q)||'%')
    )
  ORDER BY (p.is_active IS TRUE) DESC, p.title
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.rpt_product_search(uuid[], text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpt_product_360(_brand_ids uuid[], _from date, _to date, _product_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
WITH prod AS (
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
         COALESCE(NULLIF(o.pathao_zone_name,''),'—') AS zone,
         COALESCE(o.total,0) AS total, COALESCE(o.advance_amount,0) AS advance_amount,
         COALESCE(o.payment_status::text,'unpaid') AS payment_status,
         (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
         (o.status::text = ANY(public.rpt_delivered_statuses())) AS is_delivered,
         (o.status::text = ANY(public.rpt_returned_statuses())) AS is_returned,
         (o.status::text IN ('cancelled','fake')) AS is_cancelled,
         (o.confirmed_at IS NOT NULL) AS is_confirmed
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
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
  GROUP BY o.id, o.status, o.source, o.confirmation_status, o.district, o.zone, o.total,
           o.advance_amount, o.payment_status, o.day, o.is_delivered, o.is_returned, o.is_cancelled, o.is_confirmed
), recon AS (
  SELECT l.id AS order_id,
         SUM(COALESCE(r.collected,0)) * MAX(l.share) AS collected,
         SUM(COALESCE(r.total_fee,0))  * MAX(l.share) AS fees,
         SUM(COALESCE(r.payout,0))     * MAX(l.share) AS payout
  FROM line l
  JOIN public.erp_reconciliation_rows r ON r.matched_order_id = l.id AND r.match_status IN ('matched','accepted','settled','resolved')
  GROUP BY l.id
), att AS (
  SELECT DISTINCT ON (a.order_id) a.order_id, COALESCE(a.campaign_id, c1.id) AS campaign_id
  FROM public.mkt_order_attributions a
  JOIN line l ON l.id = a.order_id
  LEFT JOIN public.mkt_campaigns c1 ON a.campaign_id IS NULL AND a.utm_campaign IS NOT NULL
        AND c1.external_id = a.utm_campaign AND c1.brand_id = ANY(_brand_ids)
  WHERE a.brand_id = ANY(_brand_ids)
  ORDER BY a.order_id, a.confidence DESC NULLS LAST, a.created_at DESC
), camp_spend AS (
  SELECT i.campaign_id, SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
         SUM(COALESCE(i.impressions,0)) AS impressions, SUM(COALESCE(i.clicks,0)) AS clicks
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
  GROUP BY 1
), camp_att_total AS (
  SELECT a.campaign_id, SUM(COALESCE(o.total,0)) AS att_total
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.brand_id = ANY(_brand_ids) AND a.campaign_id IS NOT NULL
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  GROUP BY 1
), order_ads AS (
  SELECT l.id AS order_id, att.campaign_id,
         CASE WHEN COALESCE(cat.att_total,0) > 0
              THEN COALESCE(cs.spend,0) * l.total / cat.att_total * l.share ELSE 0 END AS ad_spend
  FROM line l
  JOIN att ON att.order_id = l.id
  LEFT JOIN camp_spend cs ON cs.campaign_id = att.campaign_id
  LEFT JOIN camp_att_total cat ON cat.campaign_id = att.campaign_id
), camps AS (
  SELECT c.id AS campaign_id, COALESCE(c.name,'—') AS campaign_name,
         COALESCE(SUM(oa.ad_spend),0) AS ad_spend,
         COUNT(DISTINCT oa.order_id) AS orders,
         COUNT(DISTINCT oa.order_id) FILTER (WHERE l.is_delivered) AS delivered_orders,
         COALESCE(SUM(l.line_total) FILTER (WHERE l.is_delivered),0) AS revenue
  FROM order_ads oa
  JOIN line l ON l.id = oa.order_id
  JOIN public.mkt_campaigns c ON c.id = oa.campaign_id
  GROUP BY c.id, c.name
)
SELECT jsonb_build_object(
  'product', (SELECT to_jsonb(prod) FROM prod),
  'summary', (
    SELECT jsonb_build_object(
      'orders', COUNT(*),
      'units_ordered', COALESCE(SUM(qty),0),
      'booked_value', COALESCE(SUM(line_total),0),
      'confirmed_orders', COUNT(*) FILTER (WHERE is_confirmed OR is_delivered),
      'cancelled_orders', COUNT(*) FILTER (WHERE is_cancelled),
      'returned_orders', COUNT(*) FILTER (WHERE is_returned),
      'delivered_orders', COUNT(*) FILTER (WHERE is_delivered),
      'open_orders', COUNT(*) FILTER (WHERE NOT is_delivered AND NOT is_cancelled AND NOT is_returned),
      'delivered_units', COALESCE(SUM(qty) FILTER (WHERE is_delivered),0),
      'returned_units', COALESCE(SUM(qty) FILTER (WHERE is_returned),0),
      'delivered_revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0),
      'cogs', COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered),0),
      'courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered),0),
      'packaging_cost', COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered),0),
      'return_courier_cost', COALESCE(SUM(courier_cost) FILTER (WHERE is_returned),0),
      'units_no_cost', COALESCE(SUM(qty_no_cost) FILTER (WHERE is_delivered),0),
      'advance_collected', COALESCE(SUM(advance_amount * share) FILTER (WHERE is_delivered),0),
      'paid_orders', COUNT(*) FILTER (WHERE payment_status = 'paid'),
      'delivery_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_delivered)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END,
      'return_rate', CASE WHEN COUNT(*) FILTER (WHERE NOT is_cancelled) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_returned)::numeric * 100 / COUNT(*) FILTER (WHERE NOT is_cancelled), 2) ELSE 0 END,
      'cancel_rate', CASE WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE is_cancelled)::numeric * 100 / COUNT(*), 2) ELSE 0 END
    ) FROM line
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
    ) FROM order_ads
  ),
  'by_status', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', status, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'value', COALESCE(SUM(line_total),0)) AS x
      FROM line GROUP BY status
    ) s
  ), '[]'::jsonb),
  'by_source', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', source, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered', COUNT(*) FILTER (WHERE is_delivered),
                                'value', COALESCE(SUM(line_total),0)) AS x
      FROM line GROUP BY source
    ) s
  ), '[]'::jsonb),
  'by_district', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'orders')::int DESC) FROM (
      SELECT jsonb_build_object('label', district, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered', COUNT(*) FILTER (WHERE is_delivered),
                                'returned', COUNT(*) FILTER (WHERE is_returned),
                                'revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0)) AS x
      FROM line GROUP BY district
    ) s
  ), '[]'::jsonb),
  'daily', COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
      SELECT jsonb_build_object('day', day::text, 'orders', COUNT(*), 'units', COALESCE(SUM(qty),0),
                                'delivered_orders', COUNT(*) FILTER (WHERE is_delivered),
                                'revenue', COALESCE(SUM(line_total) FILTER (WHERE is_delivered),0)) AS x
      FROM line GROUP BY day
    ) s
  ), '[]'::jsonb),
  'campaigns', COALESCE((
    SELECT jsonb_agg(to_jsonb(camps) ORDER BY camps.ad_spend DESC) FROM camps
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.rpt_product_360(uuid[], date, date, uuid) TO authenticated;