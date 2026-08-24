CREATE OR REPLACE FUNCTION public.mkt_delivered_line_costs(_brand_id uuid, _from date, _to date)
 RETURNS TABLE(order_id uuid, order_item_id uuid, day date, campaign_id uuid, product_id uuid, variant_id uuid, quantity numeric, line_total numeric, unit_cost numeric, line_cogs numeric, cost_source text, cost_missing boolean, courier_cost_allocated numeric, packaging_cost_allocated numeric, refund_amount_allocated numeric, operating_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      o.id AS order_id,
      oi.id AS order_item_id,
      (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
      NULLIF(COALESCE(NULLIF(o.fb_campaign_id,''), NULLIF(o.utm_campaign,'')), '') AS ext_campaign,
      oi.product_id,
      oi.variant_id,
      COALESCE(oi.quantity, 0)::numeric AS quantity,
      COALESCE(oi.line_total, 0)::numeric AS line_total,
      NULLIF(oi.unit_cost_snapshot, 0)::numeric AS snap_cost,
      NULLIF(pv.weighted_avg_cost, 0)::numeric AS variant_wac,
      NULLIF(p.weighted_avg_cost, 0)::numeric AS product_wac,
      NULLIF(p.cost_price, 0)::numeric AS product_cost_price,
      COALESCE(oi.courier_cost_allocated, 0)::numeric AS courier_cost_allocated,
      COALESCE(oi.packaging_cost_allocated, 0)::numeric AS packaging_cost_allocated,
      COALESCE(oi.refund_amount_allocated, 0)::numeric AS refund_amount_allocated
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE o.brand_id = _brand_id
      AND o.status::text = ANY(public.rpt_delivered_statuses())
      AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  costed AS (
    SELECT
      b.*,
      COALESCE(b.snap_cost, b.variant_wac, b.product_wac, b.product_cost_price, 0)::numeric AS unit_cost_resolved,
      CASE
        WHEN b.snap_cost         IS NOT NULL THEN 'snapshot'
        WHEN b.variant_wac       IS NOT NULL THEN 'wac_variant'
        WHEN b.product_wac       IS NOT NULL THEN 'wac_product'
        WHEN b.product_cost_price IS NOT NULL THEN 'cost_price'
        ELSE 'missing'
      END AS cost_source_resolved
    FROM base b
  )
  SELECT
    c.order_id,
    c.order_item_id,
    c.day,
    COALESCE(attr.campaign_id, uc.id) AS campaign_id,
    c.product_id,
    c.variant_id,
    c.quantity,
    c.line_total,
    c.unit_cost_resolved AS unit_cost,
    (c.unit_cost_resolved * c.quantity)::numeric AS line_cogs,
    c.cost_source_resolved AS cost_source,
    (c.cost_source_resolved = 'missing') AS cost_missing,
    c.courier_cost_allocated,
    c.packaging_cost_allocated,
    c.refund_amount_allocated,
    (c.courier_cost_allocated + c.packaging_cost_allocated + c.refund_amount_allocated)::numeric AS operating_cost
  FROM costed c
  LEFT JOIN (
    SELECT DISTINCT order_id, campaign_id
    FROM public.mkt_order_attributions
    WHERE campaign_id IS NOT NULL
  ) attr ON attr.order_id = c.order_id
  LEFT JOIN LATERAL (
    SELECT mc.id FROM public.mkt_campaigns mc
    WHERE attr.campaign_id IS NULL
      AND c.ext_campaign IS NOT NULL
      AND mc.brand_id = _brand_id
      AND mc.external_id = c.ext_campaign
    LIMIT 1
  ) uc ON TRUE;
$function$;