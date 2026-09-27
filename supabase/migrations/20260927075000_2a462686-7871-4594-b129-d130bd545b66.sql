CREATE OR REPLACE FUNCTION public.transition_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_status public.order_status;
  _user uuid := auth.uid();
  _is_system boolean := (auth.role() = 'service_role') OR (_user IS NULL);
  _is_super boolean;
BEGIN
  _is_super := _is_system OR public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'owner'::public.app_role);
  IF NOT (
    _is_super
    OR public.has_role(_user, 'customer_service'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to change order status';
  END IF;

  -- Row lock: concurrent transitions on the same order are serialized
  SELECT status INTO _old_status FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _old_status IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', _order_id;
  END IF;

  IF _old_status = _new_status THEN
    RETURN;
  END IF;

  -- Guard: finished orders cannot jump back into the pre-dispatch pipeline (admin/owner may override)
  IF NOT _is_super
     AND _old_status IN ('delivered','completed','partial_delivered','returned','paid_return','unpaid_return','partial_return','exchanged','damaged')
     AND _new_status IN ('new','confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry','pre_order','incomplete','advance_payment_pending','on_hold')
  THEN
    RAISE EXCEPTION 'Illegal status change % -> % (admin only)', _old_status, _new_status;
  END IF;

  UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason, note)
  VALUES (_order_id, _old_status::text, _new_status::text, _user, _reason, _note);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_transition_order_status(_order_ids uuid[], _new_status order_status, _reason text DEFAULT NULL, _note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid; _ok int := 0; _failed jsonb := '[]'::jsonb;
BEGIN
  IF array_length(_order_ids,1) > 2000 THEN
    RAISE EXCEPTION 'Max 2000 orders per batch';
  END IF;
  FOREACH _id IN ARRAY _order_ids LOOP
    BEGIN
      PERFORM public.transition_order_status(_id, _new_status, _reason, _note);
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed || jsonb_build_object('id', _id, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', _ok, 'failed', _failed);
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_transition_order_status(uuid[], order_status, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_transition_order_status(uuid[], order_status, text, text) TO authenticated, service_role;