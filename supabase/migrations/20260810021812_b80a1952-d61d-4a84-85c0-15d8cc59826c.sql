WITH ranked AS (
  SELECT r.id,row_number() OVER(PARTITION BY r.brand_id,COALESCE(NULLIF(btrim(r.consignment_id),''),NULLIF(btrim(r.merchant_order_id),''),'__missing__'),r.invoice_date,r.payout ORDER BY (r.applied_income_txn_id IS NOT NULL OR r.applied_expense_txn_id IS NOT NULL) DESC,r.created_at,r.id) rn
  FROM public.erp_reconciliation_rows r
)
DELETE FROM public.erp_reconciliation_rows r USING ranked x WHERE r.id=x.id AND x.rn>1;
DROP INDEX IF EXISTS public.erp_reconciliation_rows_event_uidx;
CREATE UNIQUE INDEX erp_reconciliation_rows_event_uidx ON public.erp_reconciliation_rows(brand_id,COALESCE(NULLIF(btrim(consignment_id),''),NULLIF(btrim(merchant_order_id),''),'__missing__'),invoice_date,payout);