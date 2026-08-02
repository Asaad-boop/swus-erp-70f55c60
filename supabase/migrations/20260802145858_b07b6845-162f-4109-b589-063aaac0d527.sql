CREATE TABLE IF NOT EXISTS public._backup_instapay_dup_exp_2026_08_02 AS
SELECT t.* FROM public.erp_transactions t
WHERE t.account_id = 'e12369c8-7bb7-4254-9b49-5f5dd32bcc33'
  AND t.txn_type = 'expense'
  AND NOT EXISTS (SELECT 1 FROM public.erp_reconciliation_rows rr WHERE rr.applied_expense_txn_id = t.id);
ALTER TABLE public._backup_instapay_dup_exp_2026_08_02 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public._backup_instapay_dup_exp_2026_08_02 TO service_role;