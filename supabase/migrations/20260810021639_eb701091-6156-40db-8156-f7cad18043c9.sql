WITH target AS (
  SELECT DISTINCT rr.applied_expense_txn_id AS txn_id
  FROM public.erp_reconciliation_rows rr
  JOIN public.erp_transactions t ON t.id = rr.applied_expense_txn_id
  WHERE t.reference_type = 'order_courier_return'
    AND t.amount = 95.00
    AND t.created_at >= now() - interval '10 minutes'
)
UPDATE public.erp_reconciliation_rows r
SET applied_expense_txn_id = NULL,
    match_status = 'duplicate'
WHERE r.applied_expense_txn_id IN (SELECT txn_id FROM target);

WITH target AS (
  SELECT t.id
  FROM public.erp_transactions t
  WHERE t.reference_type = 'order_courier_return'
    AND t.amount = 95.00
    AND t.created_at >= now() - interval '10 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.erp_reconciliation_rows r
      WHERE r.applied_expense_txn_id = t.id
    )
)
DELETE FROM public.erp_transactions t
USING target x
WHERE t.id = x.id;