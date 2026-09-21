-- 1) Backup tables: not API-accessible, RLS off (data kept)
REVOKE ALL ON public._backup_instapay_dup_2026_08_02 FROM anon, authenticated;
REVOKE ALL ON public._backup_instapay_dup_exp_2026_08_02 FROM anon, authenticated;
REVOKE ALL ON public._backup_phase4b_brand_remap FROM anon, authenticated;
REVOKE ALL ON public._backup_status_migration_2026_07_12 FROM anon, authenticated;
REVOKE ALL ON public._backup_step3_categorize FROM anon, authenticated;
ALTER TABLE public._backup_instapay_dup_2026_08_02 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_instapay_dup_exp_2026_08_02 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_phase4b_brand_remap DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_status_migration_2026_07_12 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_step3_categorize DISABLE ROW LEVEL SECURITY;

-- 2) Revoke EXECUTE from anonymous callers on all SECURITY DEFINER functions,
--    except the ones the public storefront/auth pages genuinely call
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname NOT IN (
        'get_public_coupon','track_order_public','lookup_order_by_id',
        'lookup_order_by_phone','resolve_login_email','is_recent_guest_order',
        'mkt_ingest_track','upsert_abandoned_cart','mark_abandoned_cart_converted',
        'auto_convert_abandoned_cart','has_role'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.oid::regprocedure);
  END LOOP;
END $$;

-- 3) Trigger/system functions: never called directly by clients
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (p.proname LIKE 'tg\_%' OR p.proname LIKE 'trg\_%' OR p.proname LIKE '\_%'
           OR p.proname IN ('fn_fire_purchase_capi','fn_post_order_advance_to_finance',
              'post_meta_ad_spend_daily_system','mkt_auto_attribute_order',
              'mkt_upsert_order_attribution','mkt_lock_order_attribution',
              'expand_combo_order_item','apply_order_stock_ledger','post_order_stock_movement'))
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.oid::regprocedure);
  END LOOP;
END $$;

-- 4) Move pg_trgm out of the API-exposed public schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;