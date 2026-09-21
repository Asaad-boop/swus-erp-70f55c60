-- SECURITY DEFINER functions: strip PUBLIC execute; re-grant only where needed
DO $$
DECLARE r record; internal boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    internal := r.proname LIKE 'tg\_%' OR r.proname LIKE 'trg\_%' OR r.proname LIKE '\_%'
      OR r.proname IN ('fn_fire_purchase_capi','fn_post_order_advance_to_finance',
        'post_meta_ad_spend_daily_system','mkt_auto_attribute_order',
        'mkt_upsert_order_attribution','mkt_lock_order_attribution',
        'expand_combo_order_item','apply_order_stock_ledger','post_order_stock_movement');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
    IF r.proname IN (
        'get_public_coupon','track_order_public','lookup_order_by_id',
        'lookup_order_by_phone','resolve_login_email','is_recent_guest_order',
        'mkt_ingest_track','upsert_abandoned_cart','mark_abandoned_cart_converted',
        'auto_convert_abandoned_cart','has_role'
      ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.oid::regprocedure);
    ELSIF internal THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure);
    END IF;
  END LOOP;
END $$;