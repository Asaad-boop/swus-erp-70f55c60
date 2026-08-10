WITH missing AS (
  SELECT r.id AS row_id, r.brand_id, r.matched_order_id, r.consignment_id, r.invoice_date, ABS(r.payout) AS amt
  FROM public.erp_reconciliation_rows r
  WHERE r.invoice_date BETWEEN '2026-07-01' AND '2026-08-10'
    AND r.payout < 0
    AND r.applied_income_txn_id IS NULL
    AND r.applied_expense_txn_id IS NULL
), ins AS (
  INSERT INTO public.erp_transactions
    (brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date)
  SELECT m.brand_id, 'expense', 'e12369c8-7bb7-4254-9b49-5f5dd32bcc33'::uuid, m.amt,
         'order', m.matched_order_id,
         'Pathao reconciliation · ' || m.consignment_id || ' · courier deduction (return/fee) [backfill]',
         m.invoice_date
  FROM missing m
  RETURNING id, reference_id, amount, description
)
UPDATE public.erp_reconciliation_rows r
SET applied_expense_txn_id = i.id, updated_at = now()
FROM ins i, missing m
WHERE m.row_id = r.id
  AND i.description LIKE '%' || m.consignment_id || '%'
  AND i.amount = m.amt;