CREATE OR REPLACE FUNCTION public.backfill_order_stock_item_insert(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_status public.order_status;
  v_net integer;
  v_made integer := 0;
  v_idem text;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  v_net := public.order_stock_net_multiplier(v_status);
  IF v_net = 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT oi.id AS item_id,
           oi.product_id,
           oi.variant_id,
           COALESCE(oi.quantity,0)::integer AS qty,
           COALESCE(p.is_combo,false) AS is_combo
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
      AND COALESCE(oi.quantity,0) > 0
  LOOP
    IF r.is_combo THEN CONTINUE; END IF;
    v_idem := 'order-stock:item-insert:' || p_order_id::text || ':' || r.item_id::text;
    IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = v_idem) THEN
      PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, v_net * r.qty, 'order_item_insert', 'Backfill post-create item stock correction', v_idem);
      v_made := v_made + 1;
    END IF;
  END LOOP;

  RETURN v_made;
END;
$$;