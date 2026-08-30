-- ============ P4: Ledger integrity ============

-- 1) Helper: is this entity ledger-tracked (not derived)?
CREATE OR REPLACE FUNCTION public.inv_is_ledger_tracked_product(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT NOT COALESCE(p.is_combo,false)
           AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active)
    FROM public.products p WHERE p.id = _product_id
  ), false);
$$;

-- 2) Auto-ledger trigger: every direct stock mutation writes a movement
CREATE OR REPLACE FUNCTION public.tg_inv_autoledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_pid uuid;
  v_vid uuid;
  v_delta int;
  v_bid uuid;
BEGIN
  IF COALESCE(current_setting('app.inv_ledger_write', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  v_delta := COALESCE(NEW.stock,0) - COALESCE(OLD.stock,0);
  IF v_delta = 0 THEN
    RETURN NULL;
  END IF;

  IF v_entity = 'variant' THEN
    v_vid := NEW.id;
    v_pid := NEW.product_id;
  ELSE
    v_pid := NEW.id;
    v_vid := NULL;
    IF NOT public.inv_is_ledger_tracked_product(v_pid) THEN
      RETURN NULL; -- combo / variant-derived stock is a projection, not a ledger entity
    END IF;
  END IF;

  SELECT brand_id INTO v_bid FROM public.products WHERE id = v_pid;

  INSERT INTO public.stock_movements (
    product_id, variant_id, brand_id, user_id, delta,
    stock_before, stock_after, running_stock,
    reason, note, movement_source
  ) VALUES (
    v_pid, v_vid, v_bid, auth.uid(), v_delta,
    COALESCE(OLD.stock,0), COALESCE(NEW.stock,0), COALESCE(NEW.stock,0),
    'auto_ledger_sync',
    'Auto-recorded: direct stock update outside the inventory engine',
    COALESCE(NULLIF(current_setting('app.inv_source', true), ''), 'system')
  );

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_inv_autoledger_products ON public.products;
CREATE TRIGGER trg_inv_autoledger_products
AFTER UPDATE OF stock ON public.products
FOR EACH ROW WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION public.tg_inv_autoledger('product');

DROP TRIGGER IF EXISTS trg_inv_autoledger_variants ON public.product_variants;
CREATE TRIGGER trg_inv_autoledger_variants
AFTER UPDATE OF stock ON public.product_variants
FOR EACH ROW WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION public.tg_inv_autoledger('variant');

-- 3) Engine writers mark their own ledger writes so we don't double-record
CREATE OR REPLACE FUNCTION public.adjust_stock_v2(_product_id uuid, _variant_id uuid, _delta integer, _reason text, _note text DEFAULT NULL::text, _unit_cost numeric DEFAULT NULL::numeric, _source text DEFAULT 'manual'::text, _reference_type text DEFAULT NULL::text, _reference_id uuid DEFAULT NULL::uuid, _idempotency_key text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_stock integer := 0;
  cur_reserved integer := 0;
  new_stock integer;
  mv_id uuid;
  pid uuid := _product_id;
  bid uuid;
BEGIN
  IF _delta = 0 OR _delta IS NULL THEN
    RAISE EXCEPTION 'Delta must be non-zero';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO mv_id FROM public.stock_movements WHERE idempotency_key = _idempotency_key LIMIT 1;
    IF mv_id IS NOT NULL THEN RETURN mv_id; END IF;
  END IF;

  IF _variant_id IS NOT NULL THEN
    SELECT v.stock, v.reserved_stock, v.product_id
      INTO cur_stock, cur_reserved, pid
    FROM public.product_variants v WHERE v.id = _variant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
  ELSE
    SELECT stock, reserved_stock INTO cur_stock, cur_reserved
    FROM public.products WHERE id = pid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  END IF;

  new_stock := cur_stock + _delta;
  IF new_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot go below 0 (current %, delta %)', cur_stock, _delta;
  END IF;
  IF new_stock < cur_reserved THEN
    RAISE EXCEPTION 'Cannot reduce stock below reserved (% reserved, would leave %)', cur_reserved, new_stock;
  END IF;

  SELECT brand_id INTO bid FROM public.products WHERE id = pid;

  IF _delta > 0 AND _unit_cost IS NOT NULL THEN
    PERFORM public.update_weighted_avg_cost(pid, _variant_id, _delta, _unit_cost);
  END IF;

  PERFORM set_config('app.inv_ledger_write', 'on', true);
  IF _variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = new_stock, updated_at = now() WHERE id = _variant_id;
  ELSE
    UPDATE public.products SET stock = new_stock, updated_at = now() WHERE id = pid;
  END IF;
  PERFORM set_config('app.inv_ledger_write', 'off', true);

  INSERT INTO public.stock_movements (
    product_id, variant_id, brand_id, user_id, delta, stock_before, stock_after, running_stock,
    reason, note, unit_cost_bdt, total_cost_bdt, movement_source, reference_type, reference_id, idempotency_key
  ) VALUES (
    pid, _variant_id, bid, auth.uid(), _delta, cur_stock, new_stock, new_stock,
    _reason, _note, _unit_cost, CASE WHEN _unit_cost IS NOT NULL THEN _unit_cost * ABS(_delta) ELSE NULL END,
    COALESCE(_source,'manual'), _reference_type, _reference_id, _idempotency_key
  ) RETURNING id INTO mv_id;

  RETURN mv_id;
END $function$;

-- combo projection must never write ledger rows
CREATE OR REPLACE FUNCTION public.recalc_combo_stock(_combo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v int;
BEGIN
  SELECT public.combo_derived_stock(_combo_id) INTO v;
  PERFORM set_config('app.inv_ledger_write', 'on', true);
  UPDATE public.products p
     SET stock = v,
         updated_at = now()
   WHERE p.id = _combo_id
     AND p.is_combo = true
     AND (p.stock IS DISTINCT FROM v);
  PERFORM set_config('app.inv_ledger_write', 'off', true);
END;
$function$;

-- variant -> product projection must never write ledger rows
CREATE OR REPLACE FUNCTION public.trg_sync_product_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pid uuid := COALESCE(NEW.product_id, OLD.product_id);
  s int; r int;
BEGIN
  SELECT COALESCE(SUM(stock),0), COALESCE(SUM(reserved_stock),0)
    INTO s, r
  FROM public.product_variants
  WHERE product_id = pid AND is_active;

  PERFORM set_config('app.inv_reserved_engine', 'on', true);
  PERFORM set_config('app.inv_ledger_write', 'on', true);
  UPDATE public.products
     SET stock = s, reserved_stock = r
   WHERE id = pid
     AND (stock IS DISTINCT FROM s OR reserved_stock IS DISTINCT FROM r);
  PERFORM set_config('app.inv_ledger_write', 'off', true);
  PERFORM set_config('app.inv_reserved_engine', 'off', true);

  RETURN NULL;
END $function$;

-- 4) Combo recalc on variant/child INSERT + DELETE too
CREATE OR REPLACE FUNCTION public.trg_variant_stock_recalc_combos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; vid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  FOR r IN
    SELECT DISTINCT ci.combo_product_id
    FROM public.product_combo_items ci
    WHERE ci.child_variant_id = vid
  LOOP
    PERFORM public.recalc_combo_stock(r.combo_product_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_child_stock_recalc_combos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; pid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  FOR r IN
    SELECT DISTINCT ci.combo_product_id
    FROM public.product_combo_items ci
    WHERE ci.child_product_id = pid
  LOOP
    PERFORM public.recalc_combo_stock(r.combo_product_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_variants_stock_recalc_combos ON public.product_variants;
CREATE TRIGGER trg_variants_stock_recalc_combos
AFTER INSERT OR DELETE OR UPDATE OF stock, is_active ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_variant_stock_recalc_combos();

DROP TRIGGER IF EXISTS trg_products_child_stock_recalc_combos ON public.products;
CREATE TRIGGER trg_products_child_stock_recalc_combos
AFTER INSERT OR DELETE OR UPDATE OF stock, is_active ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_child_stock_recalc_combos();

-- 5) Ledger drift reporting
CREATE OR REPLACE FUNCTION public.inv_ledger_drift()
RETURNS TABLE(
  entity text, product_id uuid, variant_id uuid, sku text, label text,
  stock int, ledger_qty bigint, drift bigint, movements bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'product'::text, p.id, NULL::uuid, p.sku, p.title,
         COALESCE(p.stock,0),
         COALESCE(m.qty,0)::bigint,
         (COALESCE(p.stock,0) - COALESCE(m.qty,0))::bigint,
         COALESCE(m.cnt,0)::bigint
  FROM public.products p
  LEFT JOIN (
    SELECT sm.product_id, SUM(sm.delta) qty, COUNT(*) cnt
    FROM public.stock_movements sm WHERE sm.variant_id IS NULL GROUP BY sm.product_id
  ) m ON m.product_id = p.id
  WHERE p.is_active
    AND public.inv_is_ledger_tracked_product(p.id)
    AND COALESCE(p.stock,0) <> COALESCE(m.qty,0)
  UNION ALL
  SELECT 'variant', v.product_id, v.id, v.sku, COALESCE(v.color_name,''),
         COALESCE(v.stock,0),
         COALESCE(m.qty,0)::bigint,
         (COALESCE(v.stock,0) - COALESCE(m.qty,0))::bigint,
         COALESCE(m.cnt,0)::bigint
  FROM public.product_variants v
  LEFT JOIN (
    SELECT sm.variant_id, SUM(sm.delta) qty, COUNT(*) cnt
    FROM public.stock_movements sm WHERE sm.variant_id IS NOT NULL GROUP BY sm.variant_id
  ) m ON m.variant_id = v.id
  WHERE v.is_active AND COALESCE(v.stock,0) <> COALESCE(m.qty,0);
$$;

-- 6) Backfill opening stock for ledger-less entities
CREATE OR REPLACE FUNCTION public.inv_backfill_opening_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.inv_ledger_drift() d WHERE d.movements = 0 AND d.stock <> 0
  LOOP
    INSERT INTO public.stock_movements(
      product_id, variant_id, brand_id, user_id, delta,
      stock_before, stock_after, running_stock, reason, note, movement_source, idempotency_key
    )
    SELECT r.product_id, r.variant_id, p.brand_id, auth.uid(), r.stock,
           0, r.stock, r.stock, 'opening_stock',
           'P4 backfill: opening balance for item with no movement history',
           'system',
           'p4-opening:' || COALESCE(r.variant_id::text, r.product_id::text)
    FROM public.products p WHERE p.id = r.product_id
    ON CONFLICT (idempotency_key) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 7) Documented balancing entry for real drift (does NOT change stock)
CREATE OR REPLACE FUNCTION public.inv_reconcile_ledger(_note text DEFAULT 'P4 ledger reconciliation')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.inv_ledger_drift() LOOP
    INSERT INTO public.stock_movements(
      product_id, variant_id, brand_id, user_id, delta,
      stock_before, stock_after, running_stock, reason, note, movement_source, idempotency_key
    )
    SELECT r.product_id, r.variant_id, p.brand_id, auth.uid(), r.drift::int,
           (r.stock - r.drift)::int, r.stock, r.stock, 'ledger_reconciliation',
           _note || ' (history ' || r.ledger_qty || ' vs stock ' || r.stock || ')',
           'system',
           'p4-recon:' || COALESCE(r.variant_id::text, r.product_id::text) || ':' || to_char(now(),'YYYYMMDDHH24MISS')
    FROM public.products p WHERE p.id = r.product_id
    ON CONFLICT (idempotency_key) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.inv_backfill_opening_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inv_reconcile_ledger(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_backfill_opening_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.inv_reconcile_ledger(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inv_ledger_drift() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inv_is_ledger_tracked_product(uuid) TO authenticated, service_role;