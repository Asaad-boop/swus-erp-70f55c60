-- Fix orders wrongly marked as returned by invoice reconciliation
-- while the courier shipment status says delivered.
WITH bad AS (
  SELECT o.id, o.reconciliation_status, cs.updated_at AS cs_up
  FROM public.orders o
  JOIN LATERAL (
    SELECT * FROM public.courier_shipments c
    WHERE c.order_id = o.id
    ORDER BY c.updated_at DESC LIMIT 1
  ) cs ON true
  WHERE o.status = 'returned'
    AND lower(cs.status) LIKE '%deliver%'
    AND lower(cs.status) NOT LIKE '%partial%'
    AND lower(cs.status) NOT LIKE '%return%'
)
UPDATE public.orders o
SET status = CASE WHEN b.reconciliation_status = 'reconciled' THEN 'paid'::order_status ELSE 'delivered'::order_status END,
    payment_status = CASE WHEN b.reconciliation_status = 'reconciled' THEN 'paid'::payment_status ELSE o.payment_status END,
    delivered_at = COALESCE(o.delivered_at, b.cs_up)
FROM bad b
WHERE o.id = b.id;

INSERT INTO public.order_status_history (order_id, from_status, to_status, reason, note)
SELECT o.id, 'returned'::order_status, o.status, 'reconciliation_fix', 'Courier API says delivered — corrected from returned'
FROM public.orders o
JOIN LATERAL (
  SELECT * FROM public.courier_shipments c WHERE c.order_id = o.id ORDER BY c.updated_at DESC LIMIT 1
) cs ON true
WHERE o.status IN ('paid','delivered')
  AND lower(cs.status) LIKE '%deliver%'
  AND o.updated_at > now() - interval '2 minutes';