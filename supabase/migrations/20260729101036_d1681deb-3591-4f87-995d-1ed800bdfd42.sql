ALTER TABLE public.orders DISABLE TRIGGER validate_order_totals_trigger;

WITH parsed AS (
  SELECT
    o.id,
    o.subtotal,
    o.shipping_fee,
    o.discount_amount,
    o.advance_amount AS old_advance,
    o.total AS old_total,
    COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, '') AS note_text,
    (regexp_match(COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, ''), 'Advance paid:\s*৳?\s*([0-9,]+(?:\.[0-9]+)?)', 'i'))[1] AS advance_txt,
    (regexp_match(COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, ''), 'Due on delivery:\s*৳?\s*([0-9,]+(?:\.[0-9]+)?)', 'i'))[1] AS due_txt,
    (regexp_match(COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, ''), 'Payment:\s*([A-Za-z]+)', 'i'))[1] AS method_txt,
    (regexp_match(COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, ''), 'From:\s*([+0-9][+0-9\s-]{5,24})', 'i'))[1] AS from_txt,
    (regexp_match(COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, ''), 'TrxID:\s*([A-Za-z0-9_-]+)', 'i'))[1] AS trx_txt
  FROM public.orders o
  WHERE COALESCE(o.notes, '') || E'\n' || COALESCE(o.customer_note, '') || E'\n' || COALESCE(o.latest_note, '') ~* 'Advance paid:'
), normalized AS (
  SELECT
    id,
    old_advance,
    old_total,
    NULLIF(replace(advance_txt, ',', ''), '')::numeric AS parsed_advance,
    NULLIF(replace(due_txt, ',', ''), '')::numeric AS parsed_due,
    NULLIF(initcap(method_txt), '') AS parsed_method,
    NULLIF(regexp_replace(COALESCE(from_txt, ''), '[^0-9+]', '', 'g'), '') AS parsed_from,
    NULLIF(trx_txt, '') AS parsed_trx
  FROM parsed
  WHERE advance_txt IS NOT NULL
)
UPDATE public.orders o
SET
  advance_amount = n.parsed_advance,
  advance_source = COALESCE(NULLIF(o.advance_source, ''), n.parsed_method, o.payment_method, 'bKash'),
  advance_payment_number = COALESCE(NULLIF(o.advance_payment_number, ''), n.parsed_from),
  advance_txn_id = COALESCE(NULLIF(o.advance_txn_id, ''), n.parsed_trx),
  total = COALESCE(n.parsed_due, GREATEST(COALESCE(o.subtotal, 0) + COALESCE(o.shipping_fee, 0) - COALESCE(o.discount_amount, 0) - n.parsed_advance, 0)),
  payment_status = CASE
    WHEN COALESCE(n.parsed_due, GREATEST(COALESCE(o.subtotal, 0) + COALESCE(o.shipping_fee, 0) - COALESCE(o.discount_amount, 0) - n.parsed_advance, 0)) <= 0 THEN 'paid'::public.payment_status
    ELSE 'partial'::public.payment_status
  END
FROM normalized n
WHERE o.id = n.id
  AND n.parsed_advance IS NOT NULL
  AND n.parsed_advance >= 0
  AND (
    COALESCE(o.advance_amount, 0) IS DISTINCT FROM n.parsed_advance
    OR COALESCE(o.total, 0) IS DISTINCT FROM COALESCE(n.parsed_due, GREATEST(COALESCE(o.subtotal, 0) + COALESCE(o.shipping_fee, 0) - COALESCE(o.discount_amount, 0) - n.parsed_advance, 0))
    OR (NULLIF(o.advance_payment_number, '') IS NULL AND n.parsed_from IS NOT NULL)
    OR (NULLIF(o.advance_txn_id, '') IS NULL AND n.parsed_trx IS NOT NULL)
  );

ALTER TABLE public.orders ENABLE TRIGGER validate_order_totals_trigger;