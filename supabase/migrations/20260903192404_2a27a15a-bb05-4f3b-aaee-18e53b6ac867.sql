
CREATE OR REPLACE FUNCTION public.mkt_order_primary_campaign(_brand_ids uuid[], _from date, _to date)
 RETURNS TABLE(order_id uuid, campaign_id uuid, source text, priority integer, confidence numeric)
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
  -- External Meta campaign ids are globally unique, so brand bookkeeping on the
  -- campaign row must not break attribution for the order's own brand.
  SELECT o.id, c.id, 'fb_campaign_id', 3, 0.8::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON c.external_id IS NOT NULL
   AND c.external_id = NULLIF(o.fb_campaign_id, '')
  UNION ALL
  SELECT o.id, c.id, 'utm_campaign_id', 4, 0.7::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON c.external_id IS NOT NULL
   AND c.external_id = NULLIF(o.utm_campaign, '')
  UNION ALL
  -- Name matching stays brand-scoped (names are not unique across brands).
  SELECT o.id, c.id, 'utm_campaign_name', 5, 0.6::numeric, o.created_at
  FROM o JOIN public.mkt_campaigns c
    ON (c.brand_id = ANY(_brand_ids) OR c.brand_id IS NULL) AND c.name IS NOT NULL
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
