DROP MATERIALIZED VIEW IF EXISTS public.crm_customers_mv;

CREATE OR REPLACE VIEW public.crm_customers_v AS
WITH order_rows AS (
  SELECT crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) AS customer_key,
    COALESCE(o.shipping_name, o.guest_name) AS name,
    o.guest_email AS email,
    o.user_id::text AS user_id_text,
    o.brand_id,
    o.total,
    o.created_at,
    o.status::text AS status
  FROM orders o
  WHERE crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) IS NOT NULL
), agg AS (
  SELECT order_rows.customer_key,
    max(order_rows.name) FILTER (WHERE order_rows.name IS NOT NULL) AS name,
    max(order_rows.email) FILTER (WHERE order_rows.email IS NOT NULL) AS email,
    max(order_rows.user_id_text) FILTER (WHERE order_rows.user_id_text IS NOT NULL) AS user_id_text,
    count(*) AS orders_count,
    count(*) FILTER (WHERE order_rows.status <> ALL (ARRAY['cancelled','returned','refunded','failed'])) AS valid_orders_count,
    count(*) FILTER (WHERE order_rows.status = ANY (ARRAY['cancelled','returned','refunded','failed'])) AS cancelled_orders_count,
    COALESCE(sum(order_rows.total) FILTER (WHERE order_rows.status <> ALL (ARRAY['cancelled','returned','refunded','failed'])), 0::numeric) AS lifetime_value,
    min(order_rows.created_at) AS first_order_at,
    max(order_rows.created_at) AS last_order_at,
    array_agg(DISTINCT order_rows.brand_id) FILTER (WHERE order_rows.brand_id IS NOT NULL) AS brand_ids
  FROM order_rows
  GROUP BY order_rows.customer_key
), base AS (
  SELECT a.customer_key,
    COALESCE(p.display_name, a.name) AS name,
    COALESCE(m.internal_email, a.email) AS email,
    a.user_id_text::uuid AS user_id,
    a.user_id_text IS NOT NULL AS is_registered,
    a.orders_count,
    a.valid_orders_count,
    a.lifetime_value,
    CASE WHEN a.valid_orders_count > 0 THEN a.lifetime_value / a.valid_orders_count::numeric ELSE 0::numeric END AS avg_order_value,
    a.first_order_at,
    a.last_order_at,
    a.brand_ids,
    p.customer_segment AS profile_segment,
    m.status AS meta_status,
    a.cancelled_orders_count
  FROM agg a
  LEFT JOIN profiles p ON p.id = a.user_id_text::uuid
  LEFT JOIN crm_customer_meta m ON m.customer_key = a.customer_key
)
SELECT base.customer_key, base.name, base.email, base.user_id, base.is_registered,
  base.orders_count, base.valid_orders_count, base.lifetime_value,
  base.avg_order_value, base.first_order_at, base.last_order_at, base.brand_ids,
  base.profile_segment, base.meta_status, base.cancelled_orders_count
FROM base
UNION ALL
SELECT i.customer_key, i.name, COALESCE(m.internal_email, i.email) AS email,
  NULL::uuid AS user_id, false AS is_registered,
  0::bigint AS orders_count, 0::bigint AS valid_orders_count,
  0::numeric AS lifetime_value, 0::numeric AS avg_order_value,
  NULL::timestamptz AS first_order_at, NULL::timestamptz AS last_order_at,
  NULL::uuid[] AS brand_ids, NULL::text AS profile_segment, m.status AS meta_status,
  0::bigint AS cancelled_orders_count
FROM crm_imported_customers i
LEFT JOIN crm_customer_meta m ON m.customer_key = i.customer_key
WHERE NOT (EXISTS (SELECT 1 FROM base b WHERE b.customer_key = i.customer_key));

CREATE MATERIALIZED VIEW public.crm_customers_mv AS SELECT * FROM public.crm_customers_v;
CREATE UNIQUE INDEX IF NOT EXISTS crm_customers_mv_customer_key_idx ON public.crm_customers_mv (customer_key);
GRANT SELECT ON public.crm_customers_mv TO authenticated;
GRANT SELECT ON public.crm_customers_v TO authenticated;