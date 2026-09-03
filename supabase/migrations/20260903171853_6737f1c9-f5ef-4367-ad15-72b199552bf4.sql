-- 1) Deterministic primary campaign per order
CREATE OR REPLACE FUNCTION public.mkt_order_primary_campaign(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(order_id uuid, campaign_id uuid, source text, priority int, confidence numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH o AS (
  SELECT ord.id, ord.brand_id, ord.fb_campaign_id, ord.utm_campaign, ord.created_at
  FROM public.orders ord
  WHERE ord.brand_id = ANY(_brand_ids)
    AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), cand AS (
  SELECT o.id AS oid, a.campaign_id AS cid, 'manual'::text AS src, 1 AS prio,
         COALESCE(a.confidence, 1)::numeric AS conf, a.updated_at AS ts
  FROM o JOIN public.mkt_order_attributions a
    ON a.order_id = o.id AND a.campaign_id IS NOT NULL AND a.source::text = 'manual'
  UNION ALL
  SELECT o.id, a.campaign_id, 'linked', 2, COALESCE(a.confidence, 0.9)::numeric, a.updated_at
  FROM o JOIN public.mkt_order_attributions a
    ON a.order_id = o.id AND a.campaign_id IS NOT NULL AND a.source::text NOT IN ('manual','pixel')
  UNION ALL
  SELECT o.id, c.id, 'fb_campaign_id', 3, 0.8::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON c.brand_id = ANY(_brand_ids) AND c.external_id IS NOT NULL
   AND c.external_id = NULLIF(o.fb_campaign_id, '')
  UNION ALL
  SELECT o.id, c.id, 'utm_campaign_id', 4, 0.7::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON c.brand_id = ANY(_brand_ids) AND c.external_id IS NOT NULL
   AND c.external_id = NULLIF(o.utm_campaign, '')
  UNION ALL
  SELECT o.id, c.id, 'utm_campaign_name', 5, 0.6::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON c.brand_id = ANY(_brand_ids) AND c.name IS NOT NULL
   AND lower(c.name) = lower(NULLIF(o.utm_campaign, ''))
  UNION ALL
  SELECT o.id, a.campaign_id, 'pixel', 6, COALESCE(a.confidence, 0.5)::numeric, a.updated_at
  FROM o JOIN public.mkt_order_attributions a
    ON a.order_id = o.id AND a.campaign_id IS NOT NULL AND a.source::text = 'pixel'
), ranked AS (
  SELECT cand.*, ROW_NUMBER() OVER (
    PARTITION BY oid
    ORDER BY prio ASC, conf DESC NULLS LAST, ts DESC NULLS LAST, cid ASC
  ) AS rn
  FROM cand
)
SELECT oid, cid, src, prio, conf FROM ranked WHERE rn = 1;
$function$;

REVOKE ALL ON FUNCTION public.mkt_order_primary_campaign(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_order_primary_campaign(uuid[], date, date) TO authenticated, service_role;

-- 2) Canonical delivered line costs now use the single primary campaign
CREATE OR REPLACE FUNCTION public.mkt_delivered_line_costs(_brand_id uuid, _from date, _to date)
RETURNS TABLE(order_id uuid, order_item_id uuid, day date, campaign_id uuid, product_id uuid,
              variant_id uuid, quantity numeric, line_total numeric, unit_cost numeric,
              line_cogs numeric, cost_source text, cost_missing boolean,
              courier_cost_allocated numeric, packaging_cost_allocated numeric,
              refund_amount_allocated numeric, operating_cost numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      o.id AS order_id,
      oi.id AS order_item_id,
      (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
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
        WHEN b.snap_cost          IS NOT NULL THEN 'snapshot'
        WHEN b.variant_wac        IS NOT NULL THEN 'wac_variant'
        WHEN b.product_wac        IS NOT NULL THEN 'wac_product'
        WHEN b.product_cost_price IS NOT NULL THEN 'cost_price'
        ELSE 'missing'
      END AS cost_source_resolved
    FROM base b
  ),
  pc AS (
    SELECT * FROM public.mkt_order_primary_campaign(ARRAY[_brand_id], _from, _to)
  )
  SELECT
    c.order_id,
    c.order_item_id,
    c.day,
    pc.campaign_id,
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
  LEFT JOIN pc ON pc.order_id = c.order_id;
$function$;

REVOKE ALL ON FUNCTION public.mkt_delivered_line_costs(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_delivered_line_costs(uuid, date, date) TO authenticated, service_role;

-- 3) Cash-truth per campaign (collected money, variance, return charges, coverage)
CREATE OR REPLACE FUNCTION public.mkt_campaign_cash(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH o AS (
  SELECT ord.id, ord.brand_id, ord.status::text AS status,
         ord.confirmation_status::text AS confirmation_status,
         COALESCE(ord.total,0)::numeric AS total,
         COALESCE(ord.advance_amount,0)::numeric AS advance_amount
  FROM public.orders ord
  WHERE ord.brand_id = ANY(_brand_ids)
    AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), recon AS (
  SELECT r.matched_order_id AS oid,
         SUM(COALESCE(r.collected,0))::numeric AS collected,
         SUM(COALESCE(r.return_fee,0))::numeric AS return_fee,
         COUNT(*)::int AS n
  FROM public.erp_reconciliation_rows r
  WHERE r.matched_order_id IS NOT NULL
  GROUP BY 1
), settle AS (
  SELECT s.matched_order_id AS oid,
         SUM(COALESCE(s.collected_amount,0))::numeric AS collected,
         SUM(COALESCE(s.final_fee,0))::numeric AS fee,
         COUNT(*)::int AS n
  FROM public.erp_courier_settlement_lines s
  WHERE s.matched_order_id IS NOT NULL
  GROUP BY 1
), rc AS (
  SELECT c.order_id AS oid,
         SUM(COALESCE(c.return_delivery_cost,0))::numeric AS return_delivery_cost,
         SUM(CASE WHEN c.item_condition = 'sellable'
                  THEN COALESCE(c.qty,0) * COALESCE(NULLIF(oi.unit_cost_snapshot,0),
                                                    NULLIF(pv.weighted_avg_cost,0),
                                                    NULLIF(p.weighted_avg_cost,0),
                                                    NULLIF(p.cost_price,0), 0)
                  ELSE 0 END)::numeric AS cogs_recovered
  FROM public.erp_return_cases c
  LEFT JOIN public.order_items oi ON oi.id = c.order_item_id
  LEFT JOIN public.product_variants pv ON pv.id = c.variant_id
  LEFT JOIN public.products p ON p.id = c.product_id
  GROUP BY 1
), est AS (
  SELECT AVG(NULLIF(ord.courier_fee,0))::numeric AS avg_fee
  FROM public.orders ord
  WHERE ord.brand_id = ANY(_brand_ids)
    AND ord.courier_fee IS NOT NULL
    AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), j AS (
  SELECT
    pc.campaign_id AS cid,
    o.id AS oid,
    o.status,
    o.confirmation_status,
    o.total,
    o.advance_amount,
    (o.status = ANY(public.rpt_delivered_statuses())) AS is_delivered,
    (o.status IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS is_returned,
    (o.status IN ('cancelled','fake')) AS is_cancelled,
    COALESCE(recon.n,0) + COALESCE(settle.n,0) AS settle_rows,
    (COALESCE(recon.collected,0) + COALESCE(settle.collected,0))::numeric AS courier_collected,
    COALESCE(recon.return_fee, 0)::numeric AS recon_return_fee,
    COALESCE(rc.return_delivery_cost, 0)::numeric AS case_return_fee,
    COALESCE(rc.cogs_recovered, 0)::numeric AS cogs_recovered,
    (SELECT avg_fee FROM est) AS est_fee
  FROM o
  JOIN pc ON pc.order_id = o.id
  LEFT JOIN recon ON recon.oid = o.id
  LEFT JOIN settle ON settle.oid = o.id
  LEFT JOIN rc ON rc.oid = o.id
  WHERE pc.campaign_id IS NOT NULL
), k AS (
  SELECT
    cid,
    COUNT(*)::int AS booked_order_count,
    SUM(total)::numeric AS booked_value,
    COUNT(*) FILTER (WHERE is_cancelled)::int AS cancelled_count,
    COALESCE(SUM(total) FILTER (WHERE is_cancelled),0)::numeric AS cancelled_value,
    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed')::int AS confirmed_count,
    COALESCE(SUM(total) FILTER (WHERE confirmation_status = 'confirmed'),0)::numeric AS confirmed_value,
    COUNT(*) FILTER (WHERE is_delivered)::int AS delivered_count,
    COALESCE(SUM(total) FILTER (WHERE is_delivered),0)::numeric AS delivered_order_value,
    COUNT(*) FILTER (WHERE is_returned)::int AS returned_count,
    COUNT(*) FILTER (WHERE is_delivered AND settle_rows > 0)::int AS settled_delivered_count,
    -- collected = courier collected on settled delivered orders + their advance payments
    SUM(CASE WHEN is_delivered AND settle_rows > 0
             THEN courier_collected + advance_amount ELSE 0 END)::numeric AS collected_amount,
    SUM(CASE WHEN is_delivered AND settle_rows > 0 THEN total ELSE 0 END)::numeric AS expected_collectible,
    -- return charge: actual (recon fee, else return-case cost) or estimated
    SUM(CASE WHEN is_returned THEN
          CASE WHEN recon_return_fee > 0 THEN recon_return_fee
               WHEN case_return_fee  > 0 THEN case_return_fee
               ELSE COALESCE(est_fee, 0) END
         ELSE 0 END)::numeric AS return_charge,
    BOOL_OR(is_returned AND recon_return_fee = 0 AND case_return_fee = 0) AS return_charge_is_estimate,
    COUNT(*) FILTER (WHERE is_returned AND recon_return_fee = 0 AND case_return_fee = 0
                       AND (SELECT avg_fee FROM est) IS NULL)::int AS return_charge_unknown_count,
    SUM(cogs_recovered) FILTER (WHERE is_delivered)::numeric AS cogs_recovered
  FROM j GROUP BY cid
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', cid,
  'booked_order_count', booked_order_count,
  'booked_value', round(booked_value,2),
  'cancelled_count', cancelled_count,
  'cancelled_value', round(cancelled_value,2),
  'confirmed_count', confirmed_count,
  'confirmed_value', round(confirmed_value,2),
  'delivered_count', delivered_count,
  'delivered_order_value', round(delivered_order_value,2),
  'returned_count', returned_count,
  'settled_delivered_count', settled_delivered_count,
  'collected_amount', CASE WHEN settled_delivered_count > 0 THEN round(collected_amount,2) ELSE NULL END,
  'expected_collectible', CASE WHEN settled_delivered_count > 0 THEN round(expected_collectible,2) ELSE NULL END,
  'collection_variance', CASE WHEN settled_delivered_count > 0
                              THEN round(expected_collectible - collected_amount,2) ELSE NULL END,
  'return_charge', CASE WHEN returned_count > 0 AND return_charge_unknown_count < returned_count
                        THEN round(return_charge,2) ELSE NULL END,
  'return_charge_is_estimate', COALESCE(return_charge_is_estimate,false),
  'cogs_recovered', round(COALESCE(cogs_recovered,0),2),
  'settlement_coverage', CASE WHEN delivered_count > 0
                              THEN round(100.0 * settled_delivered_count / delivered_count, 1) ELSE NULL END
)), '[]'::jsonb) FROM k;
$function$;

REVOKE ALL ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) TO authenticated, service_role;

-- 4) Campaign truth uses the deterministic primary campaign + cash metrics
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
         pc.campaign_id AS cid, pc.source AS attr_source, pc.priority AS attr_priority
  FROM public.orders o
  JOIN pc ON pc.order_id = o.id
  WHERE o.brand_id = ANY(_brand_ids)
), att AS (
  SELECT cid,
    COUNT(*) AS orders,
    COUNT(*) FILTER (WHERE attr_priority <= 2) AS attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority > 2) AS unlinked_orders,
    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed') AS confirmed_orders,
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
    COALESCE(t.unlinked_orders,0) AS unlinked_orders,
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
  WHERE c.brand_id = ANY(_brand_ids)
    AND (COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0)
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
    'unlinked_orders', unlinked_orders,
    'attribution_source', primary_source,
    'attribution_coverage', CASE WHEN orders > 0 THEN round(100.0*attributed_orders/orders,1) ELSE NULL END,
    'match_status', CASE
      WHEN orders = 0 AND spend > 0 THEN 'no_orders'
      WHEN unlinked_orders = 0 THEN 'linked'
      WHEN attributed_orders = 0 THEN 'utm_only'
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

REVOKE ALL ON FUNCTION public.mkt_campaign_truth(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_truth(uuid[], date, date) TO authenticated, service_role;

-- 5) Auto matching must never overwrite a manual attribution
CREATE OR REPLACE FUNCTION public.mkt_rerun_campaign_matching(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  v_scanned int := 0;
BEGIN
  IF NOT public._mkt_require_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  SELECT o.id AS order_id, o.brand_id, o.utm_source, o.utm_medium, o.utm_campaign,
         o.utm_content, o.utm_term, c.id AS campaign_id
  FROM public.orders o
  JOIN public.mkt_campaigns c
    ON c.brand_id = ANY(_brand_ids)
   AND c.external_id IS NOT NULL
   AND c.external_id = COALESCE(NULLIF(o.fb_campaign_id,''), NULLIF(o.utm_campaign,''))
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka');

  SELECT count(*) INTO v_scanned FROM _m;

  WITH upd AS (
    UPDATE public.mkt_order_attributions a
       SET campaign_id = m.campaign_id, updated_at = now()
      FROM _m m
     WHERE a.order_id = m.order_id
       AND a.source::text <> 'manual'
       AND a.campaign_id IS DISTINCT FROM m.campaign_id
    RETURNING 1
  ) SELECT count(*) INTO v_updated FROM upd;

  WITH ins AS (
    INSERT INTO public.mkt_order_attributions
      (brand_id, order_id, campaign_id, source, confidence, utm_source, utm_medium, utm_campaign, utm_content, utm_term, note)
    SELECT m.brand_id, m.order_id, m.campaign_id, 'auto_campaign'::mkt_attribution_source, 0.9,
           m.utm_source, m.utm_medium, m.utm_campaign, m.utm_content, m.utm_term, 'rerun matching'
    FROM _m m
    WHERE NOT EXISTS (SELECT 1 FROM public.mkt_order_attributions a WHERE a.order_id = m.order_id)
    ON CONFLICT (order_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('scanned', v_scanned, 'inserted', v_inserted, 'updated', v_updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.mkt_rerun_campaign_matching(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_rerun_campaign_matching(uuid[], date, date) TO authenticated, service_role;