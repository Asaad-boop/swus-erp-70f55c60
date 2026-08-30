CREATE OR REPLACE FUNCTION public.inv_backfill_opening_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n int := 0; k text;
BEGIN
  FOR r IN SELECT * FROM public.inv_ledger_drift() d WHERE d.movements = 0 AND d.stock <> 0 LOOP
    k := 'p4-opening:' || COALESCE(r.variant_id::text, r.product_id::text);
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = k) THEN CONTINUE; END IF;
    INSERT INTO public.stock_movements(
      product_id, variant_id, brand_id, user_id, delta,
      stock_before, stock_after, running_stock, reason, note, movement_source, idempotency_key
    )
    SELECT r.product_id, r.variant_id, p.brand_id, auth.uid(), r.stock,
           0, r.stock, r.stock, 'opening_stock',
           'P4 backfill: opening balance for item with no movement history',
           'system', k
    FROM public.products p WHERE p.id = r.product_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.inv_reconcile_ledger(_note text DEFAULT 'P4 ledger reconciliation')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n int := 0; k text;
BEGIN
  FOR r IN SELECT * FROM public.inv_ledger_drift() LOOP
    k := 'p4-recon:' || COALESCE(r.variant_id::text, r.product_id::text) || ':' || to_char(now(),'YYYYMMDDHH24MISS');
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = k) THEN CONTINUE; END IF;
    INSERT INTO public.stock_movements(
      product_id, variant_id, brand_id, user_id, delta,
      stock_before, stock_after, running_stock, reason, note, movement_source, idempotency_key
    )
    SELECT r.product_id, r.variant_id, p.brand_id, auth.uid(), r.drift::int,
           (r.stock - r.drift)::int, r.stock, r.stock, 'ledger_reconciliation',
           _note || ' (history ' || r.ledger_qty || ' vs stock ' || r.stock || ')',
           'system', k
    FROM public.products p WHERE p.id = r.product_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.inv_backfill_opening_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inv_reconcile_ledger(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_backfill_opening_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.inv_reconcile_ledger(text) TO service_role;