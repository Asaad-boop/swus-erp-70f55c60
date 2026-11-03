CREATE OR REPLACE FUNCTION public.fin_integrity_report(_brand uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _brand IS NOT NULL AND NOT public.can_access_brand(auth.uid(), _brand) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  WITH acc AS (
    SELECT a.id, a.name, a.brand_id, b.name brand, a.opening_balance ob, a.current_balance cb,
      COALESCE(SUM(CASE
        WHEN t.account_id=a.id AND t.txn_type IN ('income','adjustment') THEN t.amount
        WHEN t.account_id=a.id AND t.txn_type IN ('expense','transfer') THEN -t.amount
        WHEN t.to_account_id=a.id AND t.txn_type='transfer' THEN t.amount ELSE 0 END),0) mv,
      COUNT(t.id) n
    FROM erp_accounts a LEFT JOIN brands b ON b.id=a.brand_id
    LEFT JOIN erp_transactions t ON t.account_id=a.id OR t.to_account_id=a.id
    WHERE _brand IS NULL OR a.brand_id=_brand OR a.brand_id IS NULL
    GROUP BY a.id, b.name
  ),
  orph AS (
    SELECT t.id, t.reference_type, t.reference_id, t.amount, t.txn_type, t.transaction_date, t.description, t.created_at,
      b.name brand, a.name account
    FROM erp_transactions t LEFT JOIN brands b ON b.id=t.brand_id LEFT JOIN erp_accounts a ON a.id=t.account_id
    WHERE (_brand IS NULL OR t.brand_id=_brand)
      AND (_from IS NULL OR t.transaction_date>=_from) AND (_to IS NULL OR t.transaction_date<=_to)
      AND ((t.reference_type='imp_payment' AND NOT EXISTS(SELECT 1 FROM imp_payments p WHERE p.id=t.reference_id))
        OR (t.reference_type LIKE 'order%' AND t.reference_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=t.reference_id)))
  ),
  dup AS (
    SELECT t.reference_type, t.reference_id, t.txn_type, t.account_id, t.amount, COUNT(*) c, array_agg(t.id) ids, MIN(b.name) brand
    FROM erp_transactions t LEFT JOIN brands b ON b.id=t.brand_id
    WHERE t.reference_id IS NOT NULL AND (_brand IS NULL OR t.brand_id=_brand)
      AND (_from IS NULL OR t.transaction_date>=_from) AND (_to IS NULL OR t.transaction_date<=_to)
    GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1
  ),
  dupm AS (
    SELECT t.account_id, t.amount, t.transaction_date, t.txn_type, COALESCE(t.description,'') d, COUNT(*) c, array_agg(t.id) ids, MIN(b.name) brand
    FROM erp_transactions t LEFT JOIN brands b ON b.id=t.brand_id
    WHERE t.reference_id IS NULL AND (_brand IS NULL OR t.brand_id=_brand)
      AND (_from IS NULL OR t.transaction_date>=_from) AND (_to IS NULL OR t.transaction_date<=_to)
    GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1
  ),
  dlv AS (
    SELECT o.id, o.invoice_no, b.name brand, o.status::text status, o.total, COALESCE(o.advance_amount,0) adv, o.partial_amount, o.delivered_at,
      (SELECT SUM(amount) FROM erp_transactions t WHERE t.reference_id=o.id AND t.reference_type IN ('order_delivery','order_settlement')) posted,
      (SELECT SUM(amount) FROM erp_transactions t WHERE t.reference_id=o.id AND t.reference_type='order_advance') adv_posted,
      (SELECT string_agg(DISTINCT t.reference_type, ',') FROM erp_transactions t WHERE t.reference_id=o.id) refs,
      (SELECT COUNT(*) FROM erp_reconciliation_rows rr WHERE rr.matched_order_id=o.id) recon
    FROM orders o LEFT JOIN brands b ON b.id=o.brand_id
    WHERE o.status IN ('delivered','partial_delivered') AND (_brand IS NULL OR o.brand_id=_brand)
      AND (_from IS NULL OR o.delivered_at::date>=_from) AND (_to IS NULL OR o.delivered_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'wallets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'brand',COALESCE(brand,'Shared'),'opening',ob,'stored',cb,
        'derived',ob+mv,'drift',round(cb-(ob+mv),2),'txn_count',n) ORDER BY abs(cb-(ob+mv)) DESC),'[]') FROM acc),
    'orphans', (SELECT COALESCE(jsonb_agg(to_jsonb(orph) ORDER BY created_at),'[]') FROM orph),
    'duplicates', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind','same_reference','reference_type',reference_type,'reference_id',reference_id,'amount',amount,'count',c,'ids',ids,'brand',brand)),'[]') FROM dup),
    'possible_duplicates', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind','manual_same_day','date',transaction_date,'type',txn_type,'description',d,'amount',amount,'count',c,'ids',ids,'brand',brand)),'[]') FROM dupm),
    'delivered', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'invoice_no',invoice_no,'brand',brand,'status',status,'total',total,'advance',adv,
        'partial_amount',partial_amount,'delivered_at',delivered_at,'posted',posted,'advance_posted',adv_posted,'refs',refs,'recon_rows',recon) ORDER BY delivered_at),'[]')
        FROM dlv WHERE posted IS NULL OR (adv_posted IS NOT NULL AND posted + adv_posted > total + 0.5) OR status='partial_delivered'),
    'journals_unbalanced', (SELECT COUNT(*) FROM (SELECT l.journal_entry_id FROM erp_journal_lines l JOIN erp_journal_entries j ON j.id=l.journal_entry_id
        WHERE j.deleted_at IS NULL AND (_brand IS NULL OR j.brand_id=_brand) GROUP BY 1 HAVING abs(SUM(l.debit)-SUM(l.credit))>0.01) x),
    'txn_brand_mismatch', (SELECT COUNT(*) FROM erp_transactions t JOIN erp_accounts a ON a.id=t.account_id WHERE a.brand_id IS NOT NULL AND a.brand_id<>t.brand_id AND (_brand IS NULL OR t.brand_id=_brand))
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fin_integrity_report(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_integrity_report(uuid,date,date) TO authenticated;