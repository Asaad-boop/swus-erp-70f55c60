CREATE OR REPLACE FUNCTION public.imp_update_po(_po_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po public.imp_purchase_orders%ROWTYPE;
  v_locked boolean := false;
  v_fx numeric;
  v_item jsonb;
  v_keep uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_qty int;
  v_unit numeric;
  v_del record;
BEGIN
  SELECT * INTO v_po FROM public.imp_purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled PO edit kora jabe na'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.imp_cartons c WHERE c.po_id = _po_id AND c.status IN ('released','in_stock')
  ) OR EXISTS (
    SELECT 1 FROM public.imp_po_releases r WHERE r.po_id = _po_id
  ) INTO v_locked;

  v_fx := COALESCE((_payload->>'fx_rate')::numeric, v_po.fx_rate);
  IF v_fx IS NULL OR v_fx <= 0 THEN RAISE EXCEPTION 'FX rate must be positive'; END IF;

  UPDATE public.imp_purchase_orders SET
    order_date  = COALESCE((_payload->>'order_date')::date, order_date),
    supplier_id = COALESCE((_payload->>'supplier_id')::uuid, supplier_id),
    currency    = COALESCE(NULLIF(_payload->>'currency',''), currency),
    fx_rate     = CASE WHEN v_locked THEN fx_rate ELSE v_fx END,
    notes       = CASE WHEN _payload ? 'notes' THEN NULLIF(_payload->>'notes','') ELSE notes END
  WHERE id = _po_id;

  IF v_locked OR NOT (_payload ? 'items') THEN
    PERFORM public._imp_refresh_po_totals(_po_id);
    RETURN jsonb_build_object('ok', true, 'items_updated', false, 'locked', v_locked);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'items')
  LOOP
    v_qty  := GREATEST(COALESCE((v_item->>'quantity')::int, 0), 0);
    v_unit := GREATEST(COALESCE((v_item->>'unit_cost_foreign')::numeric, 0), 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0'; END IF;

    IF NULLIF(v_item->>'id','') IS NOT NULL THEN
      v_id := (v_item->>'id')::uuid;
      UPDATE public.imp_po_items SET
        quantity          = v_qty,
        unit_cost_foreign = v_unit,
        unit_cost_cny     = v_unit,
        unit_cost_bdt     = round(v_unit * v_fx, 4),
        subtotal_bdt      = round(v_unit * v_fx * v_qty, 4),
        name_snapshot     = COALESCE(NULLIF(v_item->>'name_snapshot',''), name_snapshot),
        sku_snapshot      = COALESCE(NULLIF(v_item->>'sku_snapshot',''), sku_snapshot)
      WHERE id = v_id AND po_id = _po_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Item not found in this PO'; END IF;
    ELSE
      INSERT INTO public.imp_po_items (
        po_id, product_id, variant_id, sku_snapshot, name_snapshot, image_snapshot,
        quantity, unit_cost_foreign, unit_cost_cny, unit_cost_bdt, subtotal_bdt
      ) VALUES (
        _po_id,
        NULLIF(v_item->>'product_id','')::uuid,
        NULLIF(v_item->>'variant_id','')::uuid,
        NULLIF(v_item->>'sku_snapshot',''),
        COALESCE(NULLIF(v_item->>'name_snapshot',''), 'Item'),
        NULLIF(v_item->>'image_snapshot',''),
        v_qty, v_unit, v_unit,
        round(v_unit * v_fx, 4),
        round(v_unit * v_fx * v_qty, 4)
      ) RETURNING id INTO v_id;
    END IF;
    v_keep := array_append(v_keep, v_id);
  END LOOP;

  FOR v_del IN
    SELECT i.id, i.name_snapshot FROM public.imp_po_items i
    WHERE i.po_id = _po_id AND NOT (i.id = ANY (v_keep))
  LOOP
    IF EXISTS (SELECT 1 FROM public.imp_carton_items ci WHERE ci.po_item_id = v_del.id)
       OR EXISTS (SELECT 1 FROM public.imp_po_release_items ri WHERE ri.po_item_id = v_del.id) THEN
      RAISE EXCEPTION 'Item "%" carton/release e allocated — remove kora jabe na', v_del.name_snapshot;
    END IF;
    DELETE FROM public.imp_po_items WHERE id = v_del.id;
  END LOOP;

  -- re-price untouched rows if FX changed
  UPDATE public.imp_po_items SET
    unit_cost_bdt = round(unit_cost_foreign * v_fx, 4),
    subtotal_bdt  = round(unit_cost_foreign * v_fx * quantity, 4)
  WHERE po_id = _po_id;

  PERFORM public._imp_refresh_po_totals(_po_id);
  RETURN jsonb_build_object('ok', true, 'items_updated', true, 'locked', false);
END
$function$;

GRANT EXECUTE ON FUNCTION public.imp_update_po(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imp_update_po(uuid, jsonb) TO service_role;