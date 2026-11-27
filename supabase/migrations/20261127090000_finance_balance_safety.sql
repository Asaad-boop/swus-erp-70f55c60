-- Finance safety:
-- 1. Editing an account's opening balance used to change opening_balance
--    without moving current_balance, so the account silently stopped adding
--    up. Now current_balance moves by the same difference.
-- 2. finance_balance_check(): accounts whose stored balance differs from
--    opening + all their transactions (runs with the caller's own RLS).

CREATE OR REPLACE FUNCTION public.erp_accounts_sync_opening()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
     AND NEW.current_balance IS NOT DISTINCT FROM OLD.current_balance THEN
    NEW.current_balance := coalesce(OLD.current_balance, 0)
      + coalesce(NEW.opening_balance, 0) - coalesce(OLD.opening_balance, 0);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER erp_accounts_sync_opening_trg
  BEFORE UPDATE OF opening_balance ON public.erp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.erp_accounts_sync_opening();

CREATE OR REPLACE FUNCTION public.finance_balance_check()
RETURNS TABLE(account_id uuid, stored numeric, computed numeric, difference numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH sums AS (
    SELECT a.id,
           a.current_balance AS stored,
           coalesce(a.opening_balance, 0) + coalesce(sum(CASE
             WHEN t.txn_type = 'income'     AND t.account_id = a.id    THEN t.amount
             WHEN t.txn_type = 'expense'    AND t.account_id = a.id    THEN -t.amount
             WHEN t.txn_type = 'transfer'   AND t.account_id = a.id
                  AND t.to_account_id IS NOT NULL                       THEN -t.amount
             WHEN t.txn_type = 'transfer'   AND t.to_account_id = a.id THEN t.amount
             WHEN t.txn_type = 'adjustment' AND t.account_id = a.id    THEN t.amount
           END), 0) AS computed
    FROM public.erp_accounts a
    LEFT JOIN public.erp_transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
    WHERE a.is_active
    GROUP BY a.id
  )
  SELECT id, stored, computed, round(stored - computed, 2)
  FROM sums
  WHERE abs(stored - computed) >= 0.01
$$;
REVOKE ALL ON FUNCTION public.finance_balance_check() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_balance_check() TO authenticated;
