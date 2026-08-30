CREATE OR REPLACE FUNCTION public.adjust_product_stock(_product_id uuid, _delta integer, _reason text, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _before integer;
  _after integer;
  _brand uuid;
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to adjust stock';
  END IF;

  IF _delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;

  SELECT stock, brand_id INTO _before, _brand
  FROM public.products WHERE id = _product_id FOR UPDATE;

  IF _before IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  _after := GREATEST(_before + _delta, 0);

  PERFORM set_config('app.inv_ledger_write', 'on', true);
  UPDATE public.products SET stock = _after, updated_at = now() WHERE id = _product_id;
  PERFORM set_config('app.inv_ledger_write', 'off', true);

  INSERT INTO public.stock_movements
    (product_id, user_id, delta, stock_before, stock_after, reason, note, brand_id)
  VALUES
    (_product_id, _user, _after - _before, _before, _after, _reason, _note, _brand);

  RETURN jsonb_build_object('product_id', _product_id, 'stock_before', _before, 'stock_after', _after, 'delta', _after - _before);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_product_stock(_product_id uuid, _new_qty integer, _reason text DEFAULT 'opening_stock'::text, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _before integer;
  _brand uuid;
  _delta integer;
BEGIN
  IF NOT (public.has_role(_user, 'admin'::public.app_role) OR public.has_role(_user, 'operations'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to set stock';
  END IF;
  IF _new_qty < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  SELECT stock, brand_id INTO _before, _brand
  FROM public.products WHERE id = _product_id FOR UPDATE;
  IF _before IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  _delta := _new_qty - _before;
  IF _delta = 0 THEN
    RETURN jsonb_build_object('product_id', _product_id, 'stock_before', _before, 'stock_after', _new_qty, 'delta', 0, 'skipped', true);
  END IF;

  PERFORM set_config('app.inv_ledger_write', 'on', true);
  UPDATE public.products SET stock = _new_qty, updated_at = now() WHERE id = _product_id;
  PERFORM set_config('app.inv_ledger_write', 'off', true);

  INSERT INTO public.stock_movements
    (product_id, user_id, delta, stock_before, stock_after, reason, note, brand_id)
  VALUES
    (_product_id, _user, _delta, _before, _new_qty, _reason, _note, _brand);

  RETURN jsonb_build_object('product_id', _product_id, 'stock_before', _before, 'stock_after', _new_qty, 'delta', _delta);
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_order_stock_movement(p_order_id uuid, p_product_id uuid, p_variant_id uuid, p_delta integer, p_reason text, p_note text, p_idempotency_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_stock integer := 0;
  new_stock integer := 0;
  cur_reserved integer := 0;
  pid uuid := p_product_id;
  bid uuid;
  mv_id uuid;
  fallback_user uuid;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO mv_id FROM public.stock_movements WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF mv_id IS NOT NULL THEN RETURN mv_id; END IF;

  SELECT id INTO fallback_user FROM public.profiles ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1;

  IF p_variant_id IS NOT NULL THEN
    SELECT v.stock, v.reserved_stock, v.product_id INTO cur_stock, cur_reserved, pid
    FROM public.product_variants v WHERE v.id = p_variant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found for order stock movement: %', p_variant_id; END IF;
  ELSE
    SELECT p.stock, p.reserved_stock INTO cur_stock, cur_reserved
    FROM public.products p WHERE p.id = pid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found for order stock movement: %', pid; END IF;
  END IF;

  new_stock := cur_stock + p_delta;

  SELECT brand_id INTO bid FROM public.products WHERE id = pid;

  PERFORM set_config('app.inv_ledger_write', 'on', true);
  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = new_stock, updated_at = now() WHERE id = p_variant_id;
  ELSE
    UPDATE public.products SET stock = new_stock, updated_at = now() WHERE id = pid;
  END IF;
  PERFORM set_config('app.inv_ledger_write', 'off', true);

  INSERT INTO public.stock_movements (
    product_id, variant_id, brand_id, user_id, delta, stock_before, stock_after, running_stock,
    reason, note, movement_source, reference_type, reference_id, idempotency_key
  ) VALUES (
    pid, p_variant_id, bid, COALESCE(auth.uid(), fallback_user), p_delta, cur_stock, new_stock, new_stock,
    p_reason, p_note, 'order', 'order_stock', p_order_id, p_idempotency_key
  ) RETURNING id INTO mv_id;

  RETURN mv_id;
END;
$function$;