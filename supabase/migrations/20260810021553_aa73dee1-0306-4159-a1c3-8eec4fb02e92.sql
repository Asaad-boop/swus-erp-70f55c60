DO $$
DECLARE
  rec record;
  txn_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (r.brand_id, r.consignment_id, r.invoice_date, r.payout)
      r.id, r.brand_id, r.matched_order_id, r.invoice_date, r.consignment_id, r.merchant_order_id
    FROM public.erp_reconciliation_rows r
    WHERE r.invoice_date BETWEEN DATE '2026-07-01' AND DATE '2026-08-10'
      AND r.payout = -95.00
      AND r.applied_expense_txn_id IS NULL
      AND r.matched_order_id IS NOT NULL
    ORDER BY r.brand_id, r.consignment_id, r.invoice_date, r.payout, r.created_at ASC
    LIMIT 2
  LOOP
    INSERT INTO public.erp_transactions (
      brand_id, transaction_date, txn_type, amount, description,
      reference_type, reference_id, created_at
    ) VALUES (
      rec.brand_id, rec.invoice_date, 'expense', 95.00,
      'Pathao return deduction — ' || COALESCE(rec.consignment_id, rec.merchant_order_id, 'invoice'),
      'order_courier_return', rec.matched_order_id, now()
    ) RETURNING id INTO txn_id;

    UPDATE public.erp_reconciliation_rows
    SET applied_expense_txn_id = txn_id,
        match_status = 'matched'
    WHERE id = rec.id;
  END LOOP;
END $$;