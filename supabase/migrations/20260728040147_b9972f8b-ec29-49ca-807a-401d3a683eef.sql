DO $$
DECLARE
  r RECORD;
  v_deleted integer := 0;
BEGIN
  FOR r IN
    SELECT sm.*
    FROM public.stock_movements sm
    JOIN public.orders o ON o.id = sm.reference_id
    WHERE sm.reference_type = 'order_stock'
      AND sm.reason = 'order_sale_backfill'
      AND o.status IN ('returned','paid_return','unpaid_return','partial_return')
      AND sm.idempotency_key LIKE 'order-stock:sale:%'
    ORDER BY sm.created_at DESC, sm.id DESC
  LOOP
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET stock = stock - r.delta,
             updated_at = now()
       WHERE id = r.variant_id;
    ELSE
      UPDATE public.products
         SET stock = stock - r.delta,
             updated_at = now()
       WHERE id = r.product_id;
    END IF;

    DELETE FROM public.stock_movements WHERE id = r.id;
    v_deleted := v_deleted + 1;
  END LOOP;

  UPDATE public.order_stock_backfill_runs
     SET note = COALESCE(note, '') || ' | cleaned return-status sale backfill movements: ' || v_deleted::text
   WHERE run_key = 'fix_order_stock_sales_20260728';
END $$;