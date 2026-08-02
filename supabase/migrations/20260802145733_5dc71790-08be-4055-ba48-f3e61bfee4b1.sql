CREATE TABLE IF NOT EXISTS public._backup_instapay_dup_2026_08_02 AS
WITH t AS (
  SELECT tr.*, ROW_NUMBER() OVER (PARTITION BY tr.reference_id ORDER BY (rr.id IS NOT NULL) DESC, tr.created_at DESC) rn
  FROM public.erp_transactions tr
  LEFT JOIN public.erp_reconciliation_rows rr ON rr.applied_income_txn_id = tr.id
  WHERE tr.account_id = 'e12369c8-7bb7-4254-9b49-5f5dd32bcc33'
    AND tr.txn_type = 'income' AND tr.reference_id IS NOT NULL
)
SELECT * FROM t WHERE rn > 1;
ALTER TABLE public._backup_instapay_dup_2026_08_02 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public._backup_instapay_dup_2026_08_02 TO service_role;