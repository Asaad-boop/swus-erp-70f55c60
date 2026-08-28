DO $$
DECLARE
  r record;
  v_uid uuid;
  v_bid uuid;
  v_target integer;
BEGIN
  SELECT id INTO v_uid FROM public.profiles ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1;
  SELECT brand_id INTO v_bid FROM public.products WHERE id = '026a1808-24b1-43a9-ab66-c367a39be559';

  FOR r IN SELECT id, sku, stock FROM public.product_variants WHERE product_id = '026a1808-24b1-43a9-ab66-c367a39be559'
  LOOP
    v_target := CASE r.sku WHEN 'HS-CAR-01-Y' THEN 4 WHEN 'HS-CAR-01-P' THEN 4 ELSE 0 END;
    IF r.stock IS DISTINCT FROM v_target THEN
      UPDATE public.product_variants SET stock = v_target, updated_at = now() WHERE id = r.id;
      INSERT INTO public.stock_movements (product_id, variant_id, brand_id, user_id, delta, stock_before, stock_after, running_stock, reason, note, movement_source, reference_type)
      VALUES ('026a1808-24b1-43a9-ab66-c367a39be559', r.id, v_bid, v_uid, v_target - r.stock, r.stock, v_target, v_target,
              'physical_audit', 'Physical count 28 Aug 2026 (' || r.sku || '): counted ' || v_target || ' pcs', 'manual', 'audit');
    END IF;
  END LOOP;
END $$;