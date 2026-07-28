CREATE OR REPLACE FUNCTION public.order_stock_is_deducted_status(p_status public.order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status IN (
    'confirmed',
    'packaging',
    'ready_to_pack',
    'packed',
    'ready_to_ship',
    'courier_entry',
    'shipped',
    'in_transit',
    'delivered',
    'partial_delivered',
    'paid',
    'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_order_stock_ledger(p_order_id uuid, p_old_status public.order_status, p_new_status public.order_status)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  old_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_old_status), false);
  new_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_new_status), false);
  old_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_old_status), 0);
  new_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_new_status), 0);
  delta_qty integer;
  made integer := 0;
  idem text;
BEGIN
  FOR r IN
    SELECT oi.id AS item_id,
           oi.product_id,
           oi.variant_id,
           COALESCE(oi.quantity, 0)::integer AS qty,
           COALESCE(p.is_combo, false) AS is_combo
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    IF r.qty <= 0 OR r.product_id IS NULL OR r.is_combo THEN
      CONTINUE;
    END IF;

    IF NOT old_deducted AND new_deducted THEN
      idem := 'order-stock:sale:' || p_order_id::text || ':' || r.item_id::text;
      PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, -r.qty, 'order_sale', 'Auto stock deduction when order became ' || p_new_status::text, idem);
      made := made + 1;
    ELSIF old_deducted AND NOT new_deducted THEN
      idem := 'order-stock:sale-reversal:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
      PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, r.qty, 'order_sale_reversal', 'Auto stock restore when order left sellable flow to ' || p_new_status::text, idem);
      made := made + 1;
    END IF;

    delta_qty := round((new_restore - old_restore) * r.qty)::integer;
    IF delta_qty <> 0 AND (old_deducted OR new_deducted) THEN
      IF delta_qty > 0 THEN
        idem := 'order-stock:return:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
        PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, delta_qty, 'order_return', 'Auto stock restore for ' || p_new_status::text, idem);
      ELSE
        idem := 'order-stock:return-reversal:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
        PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, delta_qty, 'order_return_reversal', 'Auto stock re-deduction after leaving return/cancel state', idem);
      END IF;
      made := made + 1;
    END IF;
  END LOOP;

  RETURN made;
END;
$$;