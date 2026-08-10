WITH ranked AS (
  SELECT
    r.id,
    row_number() OVER (
      PARTITION BY
        r.brand_id,
        COALESCE(NULLIF(btrim(r.consignment_id), ''), NULLIF(btrim(r.merchant_order_id), ''), r.id::text),
        r.invoice_date,
        r.payout
      ORDER BY
        (r.applied_income_txn_id IS NOT NULL OR r.applied_expense_txn_id IS NOT NULL) DESC,
        r.created_at ASC,
        r.id ASC
    ) AS rn
  FROM public.erp_reconciliation_rows r
  WHERE r.invoice_date BETWEEN DATE '2026-07-01' AND DATE '2026-08-10'
)
DELETE FROM public.erp_reconciliation_rows r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS erp_reconciliation_rows_event_uidx
ON public.erp_reconciliation_rows (
  brand_id,
  COALESCE(NULLIF(btrim(consignment_id), ''), NULLIF(btrim(merchant_order_id), ''), id::text),
  invoice_date,
  payout
);