CREATE OR REPLACE FUNCTION public.imp_update_carton_stage(_carton uuid, _new_stage text, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cur public.imp_carton_status; v_po uuid; v_brand uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _new_stage NOT IN ('ordered','at_china_warehouse','in_transit','arrived_bd','cancelled') THEN
    RAISE EXCEPTION 'only pre-arrival, arrived_bd or cancel stage allowed via this RPC';
  END IF;

  SELECT c.status, c.po_id, p.brand_id INTO v_cur, v_po, v_brand
  FROM imp_cartons c JOIN imp_purchase_orders p ON p.id = c.po_id
  WHERE c.id = _carton FOR UPDATE;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'carton not found'; END IF;

  -- idempotent: same stage requested again -> no-op
  IF v_cur::text = _new_stage THEN RETURN; END IF;

  -- only released / in_stock cartons are locked
  IF v_cur IN ('released','in_stock') THEN
    RAISE EXCEPTION 'carton already released, stage cannot be changed';
  END IF;

  -- no backward move from arrived_bd (except cancel)
  IF v_cur = 'arrived_bd' AND _new_stage <> 'cancelled' THEN
    RAISE EXCEPTION 'carton already arrived in BD';
  END IF;

  UPDATE imp_cartons SET status = _new_stage::public.imp_carton_status WHERE id = _carton;
  PERFORM public._imp_log(v_brand, 'carton', _carton, v_cur::text, _new_stage, 'stage_change', _notes, v_user, NULL, NULL);
  PERFORM public._imp_refresh_po_status(v_po);
END $function$;