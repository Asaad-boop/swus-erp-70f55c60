CREATE OR REPLACE FUNCTION public.imp_receive_quantity_bd(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_po uuid := (_payload->>'po_id')::uuid;
  v_w numeric := NULLIF(_payload->>'total_weight_kg','')::numeric;
  v_rate numeric := NULLIF(_payload->>'rate_per_kg_bdt','')::numeric;
  v_flat numeric := NULLIF(_payload->>'shipping_total_bdt','')::numeric;
  v_customs numeric := COALESCE(NULLIF(_payload->>'customs_duty_bdt','')::numeric, 0);
  v_other numeric := COALESCE(NULLIF(_payload->>'other_charges_bdt','')::numeric, 0);
  v_mode text := COALESCE(_payload->>'mode', 'replace');
  v_brand uuid; v_recv_mode text; v_ship_total numeric;
  v_idem text := _payload->>'idempotency_key';
  v_existing uuid; v_pay jsonb := _payload->'shipping_payment';
  v_payment_id uuid; v_dr uuid; v_cr uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  v_ship_total := COALESCE(v_flat, round(COALESCE(v_w,0) * COALESCE(v_rate,0), 4));
  IF v_ship_total IS NULL OR v_ship_total < 0 THEN RAISE EXCEPTION 'shipping amount invalid'; END IF;

  SELECT id INTO v_existing FROM imp_status_history
   WHERE entity_type='po' AND entity_id=v_po AND action='arrived_bd' AND notes = 'idem:' || v_idem LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('idempotent_replay', true);
  END IF;

  SELECT brand_id, receive_mode INTO v_brand, v_recv_mode
    FROM imp_purchase_orders WHERE id = v_po FOR UPDATE;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF COALESCE(v_recv_mode,'carton') <> 'quantity' THEN
    RAISE EXCEPTION 'PO is not in quantity mode';
  END IF;

  UPDATE imp_purchase_orders SET
    freight_cost_bdt = CASE WHEN v_mode = 'add' THEN COALESCE(freight_cost_bdt,0) + v_ship_total ELSE v_ship_total END,
    customs_duty_bdt = CASE WHEN v_mode = 'add' THEN COALESCE(customs_duty_bdt,0) + v_customs ELSE v_customs END,
    other_charges_bdt = CASE WHEN v_mode = 'add' THEN COALESCE(other_charges_bdt,0) + v_other ELSE v_other END,
    status = CASE WHEN status IN ('partially_received','completed','cancelled') THEN status ELSE 'arrived_bd'::imp_po_status END
  WHERE id = v_po;

  IF v_pay IS NOT NULL AND (v_pay ? 'amount') AND (v_pay->>'amount')::numeric > 0 THEN
    v_dr := public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit');
    v_cr := COALESCE(
      (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_pay->>'wallet_id')::uuid) LIMIT 1),
      public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
    );
    v_payment_id := public._imp_record_payment(
      v_brand, v_po, NULL, 'shipping',
      (v_pay->>'amount')::numeric, (v_pay->>'wallet_id')::uuid,
      COALESCE((v_pay->>'payment_date')::date, CURRENT_DATE),
      v_pay->>'reference', v_pay->>'notes', v_pay->>'idempotency_key',
      v_user, v_dr, v_cr
    );
  END IF;

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_log(v_brand, 'po', v_po, NULL, 'arrived_bd', 'arrived_bd', 'idem:' || v_idem, v_user, NULL,
    jsonb_build_object('weight_kg', v_w, 'rate', v_rate, 'shipping_total', v_ship_total,
                       'customs', v_customs, 'other', v_other, 'mode', v_mode));

  RETURN jsonb_build_object('shipping_total', v_ship_total, 'payment_id', v_payment_id);
END $function$;

REVOKE ALL ON FUNCTION public.imp_receive_quantity_bd(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.imp_receive_quantity_bd(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imp_receive_quantity_bd(jsonb) TO service_role;