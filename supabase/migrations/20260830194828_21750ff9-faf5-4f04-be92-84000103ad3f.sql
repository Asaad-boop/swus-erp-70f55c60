CREATE OR REPLACE VIEW public.v_inv_expected_reserved AS
WITH open_orders AS (
  SELECT oi.product_id, oi.variant_id, SUM(COALESCE(oi.quantity,0))::int AS qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE public.order_stock_is_reserved_status(o.status)
    AND COALESCE(p.is_combo, false) = false
  GROUP BY 1, 2
),
qc_hold AS (
  SELECT ri.product_id, ri.variant_id, SUM(COALESCE(ri.reserved_qty,0))::int AS qty
  FROM public.imp_po_release_items ri
  WHERE COALESCE(ri.reserved_qty,0) > 0
  GROUP BY 1, 2
),
keys AS (
  SELECT product_id, variant_id FROM open_orders
  UNION
  SELECT product_id, variant_id FROM qc_hold
)
SELECT
  k.product_id,
  k.variant_id,
  COALESCE(oo.qty, 0) AS open_order_qty,
  COALESCE(qh.qty, 0) AS qc_hold_qty,
  COALESCE(oo.qty, 0) + COALESCE(qh.qty, 0) AS expected_reserved
FROM keys k
LEFT JOIN open_orders oo
  ON oo.product_id IS NOT DISTINCT FROM k.product_id
 AND oo.variant_id IS NOT DISTINCT FROM k.variant_id
LEFT JOIN qc_hold qh
  ON qh.product_id IS NOT DISTINCT FROM k.product_id
 AND qh.variant_id IS NOT DISTINCT FROM k.variant_id;

ALTER VIEW public.v_inv_expected_reserved SET (security_invoker = on);
GRANT SELECT ON public.v_inv_expected_reserved TO authenticated, service_role;