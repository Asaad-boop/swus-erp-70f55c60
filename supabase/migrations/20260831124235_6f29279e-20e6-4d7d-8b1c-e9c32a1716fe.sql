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
  -- Reserved guard shudhu stock komanor shomoy. Oversold obosthay (reserved > stock)
  -- stock barano block kora uchit noy.
  IF _delta < 0 AND new_stock < cur_reserved AND new_stock < cur_stock THEN
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