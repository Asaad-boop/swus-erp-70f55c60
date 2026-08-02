create or replace function public.recon_received_summary(_from date, _to date)
returns table(
  txn_date date,
  account_id uuid,
  account_name text,
  wallet_type text,
  brand_id uuid,
  brand_name text,
  income numeric,
  expense numeric,
  net numeric,
  txn_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.transaction_date::date as txn_date,
    t.account_id,
    a.name as account_name,
    a.wallet_type,
    t.brand_id,
    b.name as brand_name,
    sum(case when t.txn_type = 'income' then t.amount else 0 end) as income,
    sum(case when t.txn_type = 'expense' then t.amount else 0 end) as expense,
    sum(case when t.txn_type = 'income' then t.amount else -t.amount end) as net,
    count(*) as txn_count
  from public.erp_transactions t
  join public.erp_reconciliation_rows r
    on r.applied_income_txn_id = t.id or r.applied_expense_txn_id = t.id
  left join public.erp_accounts a on a.id = t.account_id
  left join public.brands b on b.id = t.brand_id
  where t.transaction_date >= _from and t.transaction_date <= _to
  group by 1,2,3,4,5,6
$$;

grant execute on function public.recon_received_summary(date, date) to authenticated;
grant execute on function public.recon_received_summary(date, date) to service_role;