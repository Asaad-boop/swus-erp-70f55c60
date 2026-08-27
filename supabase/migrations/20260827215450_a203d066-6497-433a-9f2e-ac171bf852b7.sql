WITH single_item AS (
  SELECT oi.order_id, (array_agg(oi.id))[1] AS item_id
  FROM public.order_items oi
  GROUP BY oi.order_id
  HAVING count(*) = 1
)
UPDATE public.erp_return_cases rc
SET order_item_id = oi.id,
    product_id    = oi.product_id,
    variant_id    = COALESCE(rc.variant_id, oi.variant_id),
    sku           = COALESCE(rc.sku, p.sku),
    qty           = GREATEST(COALESCE(rc.qty, 1), 1)
FROM single_item si
JOIN public.order_items oi ON oi.id = si.item_id
LEFT JOIN public.products p ON p.id = oi.product_id
WHERE rc.order_id = si.order_id
  AND rc.product_id IS NULL;