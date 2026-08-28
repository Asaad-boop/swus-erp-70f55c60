
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_received_by uuid,
  ADD COLUMN IF NOT EXISTS return_condition text,
  ADD COLUMN IF NOT EXISTS return_received_note text;

-- Legacy: orders already sitting in a restore status had their stock restored already.
UPDATE public.orders
SET return_received_at = COALESCE(return_received_at, updated_at, now()),
    return_condition = COALESCE(return_condition, 'legacy')
WHERE status IN ('returned','paid_return','unpaid_return','partial_return')
  AND return_received_at IS NULL;

-- Restock only when the parcel was physically received in a restockable condition.
CREATE OR REPLACE FUNCTION public.order_return_is_restockable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND o.return_received_at IS NOT NULL
      AND COALESCE(o.return_condition, 'good') NOT IN ('damaged','lost','missing')
  );
$function$;

CREATE OR REPLACE FUNCTION public.apply_order_stock_ledger(p_order_id uuid, p_old_status order_status, p_new_status order_status)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  old_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_old_status), false);
  new_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_new_status), false);
  old_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_old_status), 0);
  new_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_new_status), 0);
  received boolean := public.order_return_is_restockable(p_order_id);
  delta_qty integer;
  made integer := 0;
  idem text;
BEGIN
  -- A return only restores stock after the parcel was physically received.
  IF new_restore > 0 AND NOT received THEN
    new_restore := 0;
  END IF;
  IF old_restore > 0 AND NOT received THEN
    old_restore := 0;
  END IF;

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
    IF delta_qty <> 0 THEN
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
$function$;

-- Confirm a physically received return parcel.
CREATE OR REPLACE FUNCTION public.confirm_return_received(
  _order_id uuid,
  _condition text,
  _note text DEFAULT NULL,
  _final_status order_status DEFAULT 'returned'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _is_system boolean := (auth.role() = 'service_role') OR (_user IS NULL);
  _old public.order_status;
  _moves integer := 0;
BEGIN
  IF NOT (
    _is_system
    OR public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
    OR public.has_role(_user, 'warehouse_staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm return receipt';
  END IF;

  IF _condition NOT IN ('good','damaged','lost') THEN
    RAISE EXCEPTION 'Invalid condition: %', _condition;
  END IF;

  SELECT status INTO _old FROM public.orders WHERE id = _order_id;
  IF _old IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', _order_id;
  END IF;

  UPDATE public.orders
  SET return_received_at = now(),
      return_received_by = _user,
      return_condition = _condition,
      return_received_note = _note,
      updated_at = now()
  WHERE id = _order_id;

  IF _old IS DISTINCT FROM _final_status THEN
    UPDATE public.orders SET status = _final_status, updated_at = now() WHERE id = _order_id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason, note)
    VALUES (_order_id, _old::text, _final_status::text, _user, 'return_received', _note);
  ELSE
    -- status unchanged: apply the pending restock explicitly
    _moves := public.apply_order_stock_ledger(_order_id, 'return_in_transit'::public.order_status, _final_status);
  END IF;

  RETURN jsonb_build_object('ok', true, 'condition', _condition, 'movements', _moves);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_return_received(uuid, text, text, order_status) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_return_received(uuid, text, text, order_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_return_is_restockable(uuid) TO authenticated, service_role;
