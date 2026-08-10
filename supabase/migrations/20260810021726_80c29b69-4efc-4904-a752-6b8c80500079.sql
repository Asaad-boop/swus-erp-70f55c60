DROP INDEX IF EXISTS public.erp_reconciliation_rows_event_uidx;
CREATE UNIQUE INDEX erp_reconciliation_rows_event_uidx
ON public.erp_reconciliation_rows (
  brand_id,
  COALESCE(NULLIF(btrim(consignment_id), ''), NULLIF(btrim(merchant_order_id), ''), '__missing__'),
  invoice_date,
  payout
);