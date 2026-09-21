DO $$
DECLARE r record;
BEGIN
  -- service_role: full access everywhere
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.relname);
  END LOOP;

  -- authenticated: full DML on non-backup tables, read on views
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
             AND c.relname NOT LIKE '\_backup%' AND c.relname NOT LIKE 'crm_customers_mv' LOOP
    IF r.relkind IN ('r','p') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.relname);
    ELSE
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.relname);
    END IF;
  END LOOP;

  -- sequences
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='S' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated, service_role', r.relname);
  END LOOP;
END $$;

-- storefront anon access
GRANT SELECT ON public.products, public.product_variants, public.product_option_types,
  public.product_option_values, public.product_variant_values, public.product_combo_items,
  public.product_brand_listings, public.categories, public.brands, public.site_settings,
  public.marketing_reels, public.marketing_slides, public.coupons, public.reviews TO anon;
GRANT INSERT ON public.abandoned_carts, public.analytics_events, public.mkt_tracking_events,
  public.reviews, public.order_items, public.orders TO anon;
GRANT SELECT ON public.orders, public.order_items TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;