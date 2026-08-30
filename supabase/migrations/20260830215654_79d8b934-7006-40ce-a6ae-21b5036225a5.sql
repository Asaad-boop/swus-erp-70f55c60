CREATE OR REPLACE VIEW public.v_product_incoming AS
WITH expected AS (
  SELECT pi.product_id, p.id AS po_id, p.brand_id, SUM(pi.quantity)::int AS qty
  FROM imp_po_items pi
  JOIN imp_purchase_orders p ON p.id = pi.po_id
  WHERE pi.product_id IS NOT NULL
    AND p.status <> ALL (ARRAY['completed'::imp_po_status,'cancelled'::imp_po_status])
  GROUP BY pi.product_id, p.id, p.brand_id
),
recv_carton AS (
  SELECT ci.product_id, c.po_id, SUM(ci.quantity_ok)::int AS qty
  FROM imp_carton_items ci
  JOIN imp_cartons c ON c.id = ci.carton_id
  WHERE ci.product_id IS NOT NULL AND c.status = 'in_stock'::imp_carton_status
  GROUP BY ci.product_id, c.po_id
),
recv_release AS (
  SELECT ri.product_id, r.po_id, SUM(COALESCE(ri.quantity,0))::int AS qty
  FROM imp_po_release_items ri
  JOIN imp_po_releases r ON r.id = ri.release_id
  WHERE ri.product_id IS NOT NULL
  GROUP BY ri.product_id, r.po_id
),
netted AS (
  SELECT e.product_id, e.brand_id,
    GREATEST(e.qty - GREATEST(COALESCE(rc.qty,0), COALESCE(rr.qty,0)), 0) AS incoming
  FROM expected e
  LEFT JOIN recv_carton rc ON rc.product_id = e.product_id AND rc.po_id = e.po_id
  LEFT JOIN recv_release rr ON rr.product_id = e.product_id AND rr.po_id = e.po_id
)
SELECT product_id, brand_id, SUM(incoming)::int AS incoming
FROM netted
GROUP BY product_id, brand_id
HAVING SUM(incoming) > 0;

GRANT SELECT ON public.v_product_incoming TO authenticated;
GRANT ALL ON public.v_product_incoming TO service_role;