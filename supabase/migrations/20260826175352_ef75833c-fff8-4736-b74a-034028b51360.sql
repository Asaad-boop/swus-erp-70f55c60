CREATE OR REPLACE FUNCTION public.imp_save_cartons(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_po_id uuid := (_payload->>'po_id')::uuid;
  v_cartons jsonb := COALESCE(_payload->'cartons', '[]'::jsonb);
  v_po record;
  v_carton jsonb; v_alloc jsonb;
  v_carton_id uuid; v_cnum int; v_qty_total int;
  v_grand int := 0;
  v_locked int;
  v_bad int;
  v_kept uuid[] := ARRAY[]::uuid[];
  v_existing_id uuid;
  v_status public.imp_carton_status;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant') THEN
    RAISE EXCEPTION 'not authorized to edit cartons';
  END IF;

  SELECT * INTO v_po FROM imp_purchase_orders WHERE id = v_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO not found'; END IF;

  SELECT count(*) INTO v_locked FROM imp_cartons
   WHERE po_id = v_po_id AND status IN ('released','in_stock');
  IF v_locked > 0 THEN
    RAISE EXCEPTION 'Kichu carton already release/stock e — carton plan edit kora jabe na.';
  END IF;

  -- delete cartons not present in payload (by carton_number)
  DELETE FROM imp_carton_items ci USING imp_cartons c
   WHERE ci.carton_id = c.id AND c.po_id = v_po_id
     AND c.carton_number NOT IN (
       SELECT (x->>'carton_number')::int FROM jsonb_array_elements(v_cartons) x
     );
  DELETE FROM imp_cartons c
   WHERE c.po_id = v_po_id
     AND c.carton_number NOT IN (
       SELECT (x->>'carton_number')::int FROM jsonb_array_elements(v_cartons) x
     );

  FOR v_carton IN SELECT * FROM jsonb_array_elements(v_cartons) LOOP
    v_cnum := (v_carton->>'carton_number')::int;
    IF v_cnum IS NULL OR v_cnum <= 0 THEN RAISE EXCEPTION 'invalid carton_number'; END IF;
    v_qty_total := 0;

    SELECT id, status INTO v_existing_id, v_status FROM imp_cartons
      WHERE po_id = v_po_id AND carton_number = v_cnum;

    IF v_existing_id IS NULL THEN
      INSERT INTO imp_cartons (po_id, carton_number, barcode, weight_kg, status, expected_quantity)
      VALUES (v_po_id, v_cnum, v_po.po_number || '-C' || v_cnum,
              NULLIF(v_carton->>'weight_kg','')::numeric, 'ordered', 0)
      RETURNING id INTO v_carton_id;
    ELSE
      v_carton_id := v_existing_id;
      UPDATE imp_cartons
         SET weight_kg = NULLIF(v_carton->>'weight_kg','')::numeric,
             notes = COALESCE(NULLIF(v_carton->>'notes',''), notes),
             updated_at = now()
       WHERE id = v_carton_id;
      DELETE FROM imp_carton_items WHERE carton_id = v_carton_id;
    END IF;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_carton->'allocations') LOOP
      DECLARE
        v_item_id uuid := NULLIF(v_alloc->>'po_item_id','')::uuid;
        v_aq int := COALESCE((v_alloc->>'quantity')::int, 0);
      BEGIN
        IF v_aq <= 0 THEN CONTINUE; END IF;
        PERFORM 1 FROM imp_po_items WHERE id = v_item_id AND po_id = v_po_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'invalid po_item_id in carton %', v_cnum; END IF;
        v_qty_total := v_qty_total + v_aq;
        INSERT INTO imp_carton_items (carton_id, po_item_id, product_id, variant_id, sku_snapshot, quantity_expected)
        SELECT v_carton_id, id, product_id, variant_id, sku_snapshot, v_aq
        FROM imp_po_items WHERE id = v_item_id;
      END;
    END LOOP;

    UPDATE imp_cartons SET expected_quantity = v_qty_total WHERE id = v_carton_id;
    v_grand := v_grand + v_qty_total;
    v_kept := array_append(v_kept, v_carton_id);
  END LOOP;

  -- per item totals must match
  SELECT count(*) INTO v_bad
  FROM imp_po_items pi
  LEFT JOIN (
    SELECT ci.po_item_id, SUM(ci.quantity_expected) AS q
    FROM imp_carton_items ci JOIN imp_cartons c ON c.id = ci.carton_id
    WHERE c.po_id = v_po_id GROUP BY ci.po_item_id
  ) s ON s.po_item_id = pi.id
  WHERE pi.po_id = v_po_id AND COALESCE(s.q,0) <> pi.quantity;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Carton allocation PO item quantity er sathe mile na (% ta item)', v_bad;
  END IF;

  UPDATE imp_cartons c SET supplier_cost_bdt = round(COALESCE(s.cost,0), 4)
  FROM (
    SELECT ci.carton_id AS cid, SUM(ci.quantity_expected * pi.unit_cost_bdt) AS cost
    FROM imp_carton_items ci JOIN imp_po_items pi ON pi.id = ci.po_item_id
    GROUP BY ci.carton_id
  ) s WHERE s.cid = c.id AND c.po_id = v_po_id;

  UPDATE imp_cartons
     SET total_landed_bdt = supplier_cost_bdt + shipping_charge_bdt + local_courier_bdt
   WHERE po_id = v_po_id;

  PERFORM public._imp_refresh_po_totals(v_po_id);
  PERFORM public._imp_log(v_po.brand_id, 'po', v_po_id, NULL, NULL, 'cartons_saved', NULL, v_user, NULL,
    jsonb_build_object('cartons', jsonb_array_length(v_cartons), 'total_qty', v_grand));

  RETURN jsonb_build_object('ok', true, 'cartons', jsonb_array_length(v_cartons), 'total_qty', v_grand);
END $function$;

REVOKE ALL ON FUNCTION public.imp_save_cartons(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.imp_save_cartons(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imp_save_cartons(jsonb) TO service_role;