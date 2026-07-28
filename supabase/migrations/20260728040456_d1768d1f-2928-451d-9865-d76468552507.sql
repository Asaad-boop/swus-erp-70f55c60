CREATE OR REPLACE FUNCTION public.post_order_stock_movement(
  p_order_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_note text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT id INTO mv_id
  FROM public.stock_movements
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;
  IF mv_id IS NOT NULL THEN
    RETURN mv_id;
  END IF;

  SELECT id INTO fallback_user
  FROM public.profiles
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF p_variant_id IS NOT NULL THEN
    SELECT v.stock, v.reserved_stock, v.product_id
      INTO cur_stock, cur_reserved, pid
    FROM public.product_variants v
    WHERE v.id = p_variant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant not found for order stock movement: %', p_variant_id;
    END IF;
  ELSE
    SELECT p.stock, p.reserved_stock
      INTO cur_stock, cur_reserved
    FROM public.products p
    WHERE p.id = pid
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found for order stock movement: %', pid;
    END IF;
  END IF;

  new_stock := cur_stock + p_delta;

  IF new_stock < 0
     AND p_reason NOT IN ('order_sale_backfill', 'order_return_reversal', 'order_item_insert', 'order_item_update') THEN
    RAISE EXCEPTION 'Stock cannot go below 0 for product % variant % (current %, delta %, order %)', pid, p_variant_id, cur_stock, p_delta, p_order_id;
  END IF;

  SELECT brand_id INTO bid FROM public.products WHERE id = pid;

  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
       SET stock = new_stock,
           updated_at = now()
     WHERE id = p_variant_id;
  ELSE
    UPDATE public.products
       SET stock = new_stock,
           updated_at = now()
     WHERE id = pid;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, brand_id, user_id, delta, stock_before, stock_after, running_stock,
    reason, note, movement_source, reference_type, reference_id, idempotency_key
  ) VALUES (
    pid, p_variant_id, bid, COALESCE(auth.uid(), fallback_user), p_delta, cur_stock, new_stock, new_stock,
    p_reason, p_note, 'order', 'order_stock', p_order_id, p_idempotency_key
  )
  RETURNING id INTO mv_id;

  RETURN mv_id;
END;
$$;