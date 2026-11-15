CREATE OR REPLACE FUNCTION public.staff_can_work_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.staff_has_explicit_page(auth.uid(),
    ARRAY['/erp/orders','/erp/orders/list','/erp/orders/web','/erp/orders/pre-orders','/erp/orders/new'],
    (SELECT brand_id FROM public.orders WHERE id = _order_id));
$$;
REVOKE ALL ON FUNCTION public.staff_can_work_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_work_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    OR public.staff_can_work_order(_order_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to change order status';
  END IF;

  SELECT status INTO _old_status FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _old_status IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', _order_id;
  END IF;
  IF _old_status = _new_status THEN RETURN; END IF;

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

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.acquire_order_lock(uuid,boolean)'::regprocedure);
  d := replace(d, 'OR has_role(_user,''operations''::app_role)) THEN', 'OR has_role(_user,''operations''::app_role) OR public.staff_can_work_order(_order_id)) THEN');
  EXECUTE d;
  d := pg_get_functiondef('public.add_order_note(uuid,text,boolean)'::regprocedure);
  d := replace(d, 'OR public.has_role(_user, ''operations''::public.app_role)
  ) THEN', 'OR public.has_role(_user, ''operations''::public.app_role)
    OR public.staff_can_work_order(_order_id)
  ) THEN');
  EXECUTE d;
END $$;