CREATE OR REPLACE FUNCTION public.imp_reverse_payment(_payment_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_p record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_user,'admin') OR public.has_role(v_user,'accountant') OR public.has_role(v_user,'owner')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO v_p FROM public.imp_payments WHERE id = _payment_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF COALESCE(v_p.is_reversed,false) THEN
    RETURN jsonb_build_object('ok', true, 'already_reversed', true);
  END IF;

  DELETE FROM public.erp_transactions
   WHERE reference_type = 'imp_payment' AND reference_id = _payment_id;

  IF v_p.journal_entry_id IS NOT NULL THEN
    DELETE FROM public.erp_journal_lines WHERE journal_entry_id = v_p.journal_entry_id;
    DELETE FROM public.erp_journal_entries WHERE id = v_p.journal_entry_id;
  END IF;

  UPDATE public.imp_payments
     SET is_reversed = true,
         reversed_at = now(),
         notes = COALESCE(notes,'') || CASE WHEN _reason IS NOT NULL AND length(_reason) > 0
                   THEN ' | reversed: ' || _reason ELSE ' | reversed' END,
         idempotency_key = idempotency_key || ':rev:' || substr(md5(random()::text),1,6)
   WHERE id = _payment_id;

  IF v_p.carton_id IS NOT NULL THEN
    PERFORM public._imp_recompute_carton_paid(v_p.carton_id);
  END IF;
  IF v_p.po_id IS NOT NULL THEN
    PERFORM public._imp_refresh_po_totals(v_p.po_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id, 'amount_bdt', v_p.amount_bdt, 'wallet_id', v_p.wallet_id);
END $function$;