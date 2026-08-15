CREATE OR REPLACE FUNCTION public.imp_delete_po(_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_brand uuid;
  v_mov record;
  v_payment record;
  v_carton_ids uuid[] := ARRAY[]::uuid[];
  v_payment_ids uuid[] := ARRAY[]::uuid[];
  v_je_ids uuid[] := ARRAY[]::uuid[];
  v_cargo_bill_ids uuid[] := ARRAY[]::uuid[];
  v_fin_txn_ids uuid[] := ARRAY[]::uuid[];
  v_refunded_wallet_bdt numeric := 0;
  v_reversed_finance_bdt numeric := 0;
  v_cargo_ledger_bdt numeric := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT brand_id INTO v_brand FROM public.imp_purchase_orders WHERE id = _po_id FOR UPDATE;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'PO not found';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_carton_ids FROM public.imp_cartons WHERE po_id = _po_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_payment_ids FROM public.imp_payments WHERE po_id = _po_id;
  SELECT COALESCE(array_agg(journal_entry_id) FILTER (WHERE journal_entry_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_je_ids FROM public.imp_payments WHERE po_id = _po_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_cargo_bill_ids FROM public.imp_cargo_bills WHERE po_id = _po_id;

  FOR v_mov IN
    SELECT id, product_id, variant_id, delta
      FROM public.stock_movements
     WHERE (reference_id = ANY(v_carton_ids))
        OR (reference_type = 'imp_po' AND reference_id = _po_id)
  LOOP
    IF v_mov.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = GREATEST(0, COALESCE(stock, 0) - v_mov.delta) WHERE id = v_mov.variant_id;
    ELSIF v_mov.product_id IS NOT NULL THEN
      UPDATE public.products SET stock = GREATEST(0, COALESCE(stock, 0) - v_mov.delta) WHERE id = v_mov.product_id;
    END IF;
    DELETE FROM public.stock_movements WHERE id = v_mov.id;
  END LOOP;

  FOR v_payment IN
    SELECT id, wallet_id, amount_bdt
      FROM public.imp_payments
     WHERE po_id = _po_id AND COALESCE(is_reversed, false) = false AND amount_bdt > 0
     FOR UPDATE
  LOOP
    UPDATE public.erp_accounts
       SET current_balance = current_balance + v_payment.amount_bdt, updated_at = now()
     WHERE id = v_payment.wallet_id;
    v_refunded_wallet_bdt := v_refunded_wallet_bdt + v_payment.amount_bdt;
  END LOOP;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), COALESCE(sum(amount), 0)
    INTO v_fin_txn_ids, v_reversed_finance_bdt
    FROM public.erp_transactions
   WHERE (reference_type = 'imp_po' AND reference_id = _po_id)
      OR (reference_type = 'cargo_bill' AND reference_id = ANY(v_cargo_bill_ids));

  DELETE FROM public.erp_finance_attachments WHERE transaction_id = ANY(v_fin_txn_ids);
  DELETE FROM public.erp_transactions WHERE id = ANY(v_fin_txn_ids);

  SELECT COALESCE(sum(debit_bdt), 0) - COALESCE(sum(credit_bdt), 0)
    INTO v_cargo_ledger_bdt
    FROM public.imp_cargo_ledger
   WHERE (ref_type = 'imp_po' AND ref_id = _po_id)
      OR (ref_type = 'cargo_bill' AND ref_id = ANY(v_cargo_bill_ids));

  DELETE FROM public.imp_cargo_ledger
   WHERE (ref_type = 'imp_po' AND ref_id = _po_id)
      OR (ref_type = 'cargo_bill' AND ref_id = ANY(v_cargo_bill_ids));

  DELETE FROM public.imp_cargo_bills WHERE id = ANY(v_cargo_bill_ids);
  DELETE FROM public.imp_payments WHERE po_id = _po_id;

  IF array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.erp_journal_lines WHERE journal_entry_id = ANY(v_je_ids);
    DELETE FROM public.erp_journal_entries WHERE id = ANY(v_je_ids);
  END IF;

  DELETE FROM public.erp_journal_lines
   WHERE journal_entry_id IN (
     SELECT id FROM public.erp_journal_entries
      WHERE (source_type = 'imp_payment' AND source_id = ANY(v_payment_ids))
         OR (source_type = 'imp_po' AND source_id = _po_id)
         OR (source_type = 'imp_carton' AND source_id = ANY(v_carton_ids))
   );

  DELETE FROM public.erp_journal_entries
   WHERE (source_type = 'imp_payment' AND source_id = ANY(v_payment_ids))
      OR (source_type = 'imp_po' AND source_id = _po_id)
      OR (source_type = 'imp_carton' AND source_id = ANY(v_carton_ids));

  DELETE FROM public.imp_status_history
   WHERE (entity_type IN ('imp_po', 'po') AND entity_id = _po_id)
      OR (entity_type IN ('imp_carton', 'carton') AND entity_id = ANY(v_carton_ids));

  DELETE FROM public.imp_carton_items WHERE carton_id = ANY(v_carton_ids);
  DELETE FROM public.imp_cartons WHERE id = ANY(v_carton_ids);
  DELETE FROM public.imp_po_items WHERE po_id = _po_id;
  DELETE FROM public.imp_purchase_orders WHERE id = _po_id;

  RETURN jsonb_build_object(
    'ok', true,
    'po_id', _po_id,
    'refunded_wallet_bdt', round(v_refunded_wallet_bdt, 2),
    'reversed_finance_bdt', round(v_reversed_finance_bdt, 2),
    'removed_cargo_ledger_net_bdt', round(v_cargo_ledger_bdt, 2),
    'deleted_payments', COALESCE(array_length(v_payment_ids, 1), 0),
    'deleted_cartons', COALESCE(array_length(v_carton_ids, 1), 0),
    'deleted_cargo_bills', COALESCE(array_length(v_cargo_bill_ids, 1), 0)
  );
END;
$function$;