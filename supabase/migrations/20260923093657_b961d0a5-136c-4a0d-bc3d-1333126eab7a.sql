CREATE OR REPLACE FUNCTION public.erp_order_list_daily_pulse(
  p_brand_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH bounds AS (
  SELECT
    (date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka') AS day_start,
    ((date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') + interval '1 day') AT TIME ZONE 'Asia/Dhaka') AS day_end
),
today_orders AS (
  SELECT
    o.id,
    o.brand_id,
    regexp_replace(coalesce(nullif(o.shipping_phone, ''), nullif(o.guest_phone, ''), ''), '[^0-9]', '', 'g') AS phone
  FROM public.orders o
  CROSS JOIN bounds b
  WHERE (p_brand_ids IS NULL OR cardinality(p_brand_ids) = 0 OR o.brand_id = ANY(p_brand_ids))
    AND o.created_at >= b.day_start
    AND o.created_at < b.day_end
    AND o.status::text NOT IN ('new', 'pre_order')
    AND (
      o.status::text <> 'confirmed'
      OR o.source IS NULL
      OR o.source::text NOT IN ('website', 'pixel', 'utm')
      OR o.web_status::text = 'complete'
    )
),
normalized_today AS (
  SELECT id, brand_id,
    CASE
      WHEN length(phone) >= 11 THEN right(phone, 11)
      WHEN phone <> '' THEN phone
      ELSE NULL
    END AS phone
  FROM today_orders
),
customer_stats AS (
  SELECT
    count(DISTINCT phone) FILTER (WHERE phone IS NOT NULL)::int AS unique_customers,
    count(DISTINCT phone) FILTER (
      WHERE phone IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.orders prior
        CROSS JOIN bounds b
        WHERE prior.created_at < b.day_start
          AND (p_brand_ids IS NULL OR cardinality(p_brand_ids) = 0 OR prior.brand_id = ANY(p_brand_ids))
          AND right(regexp_replace(coalesce(nullif(prior.shipping_phone, ''), nullif(prior.guest_phone, ''), ''), '[^0-9]', '', 'g'), 11) = normalized_today.phone
      )
    )::int AS repeat_customers
  FROM normalized_today
),
item_stats AS (
  SELECT coalesce(sum(oi.quantity), 0)::int AS total_pieces
  FROM public.order_items oi
  JOIN today_orders o ON o.id = oi.order_id
  WHERE coalesce(oi.is_combo_child, false) = false
),
top_products AS (
  SELECT
    coalesce(nullif(oi.name, ''), 'Unnamed product') AS name,
    sum(oi.quantity)::int AS qty,
    count(DISTINCT oi.order_id)::int AS orders,
    (array_agg(oi.image ORDER BY oi.created_at DESC) FILTER (WHERE oi.image IS NOT NULL AND oi.image <> ''))[1] AS image
  FROM public.order_items oi
  JOIN today_orders o ON o.id = oi.order_id
  WHERE coalesce(oi.is_combo_child, false) = false
  GROUP BY coalesce(nullif(oi.name, ''), 'Unnamed product')
  HAVING sum(oi.quantity) > 0
  ORDER BY qty DESC, orders DESC, name ASC
  LIMIT 3
)
SELECT jsonb_build_object(
  'orders', (SELECT count(*)::int FROM today_orders),
  'pieces', coalesce((SELECT total_pieces FROM item_stats), 0),
  'unique_customers', coalesce((SELECT unique_customers FROM customer_stats), 0),
  'repeat_customers', coalesce((SELECT repeat_customers FROM customer_stats), 0),
  'top_products', coalesce((SELECT jsonb_agg(to_jsonb(tp)) FROM top_products tp), '[]'::jsonb)
);
$fn$;

REVOKE ALL ON FUNCTION public.erp_order_list_daily_pulse(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_order_list_daily_pulse(uuid[]) TO authenticated, service_role;