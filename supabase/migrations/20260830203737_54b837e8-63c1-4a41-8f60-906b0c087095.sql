-- P5: QC finalize → revalue original release movement at final unit cost, recompute WAC
CREATE OR REPLACE FUNCTION public.imp_qc_finalize_cost(
  _release_item_id uuid,
  _final_unit_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.imp_po_release_items%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_item FROM public.imp_po_release_items WHERE id = _release_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'release item not found'; END IF;
  IF v_item.product_id IS NULL THEN RETURN; END IF;

  -- Revalue the original release inbound movement at QC-final cost
  UPDATE public.stock_movements sm
     SET unit_cost_bdt = _final_unit_cost
   WHERE sm.reference_type = 'imp_po_release'
     AND sm.reference_id = v_item.release_id
     AND sm.product_id = v_item.product_id
     AND sm.variant_id IS NOT DISTINCT FROM v_item.variant_id
     AND sm.delta > 0
     AND COALESCE(sm.unit_cost_bdt, 0) IS DISTINCT FROM _final_unit_cost;

  -- Recompute WAC from ledger (P2 canonical)
  PERFORM public.inv_recompute_wac(v_item.product_id, v_item.variant_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.imp_qc_finalize_cost(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imp_qc_finalize_cost(uuid, numeric) TO authenticated;