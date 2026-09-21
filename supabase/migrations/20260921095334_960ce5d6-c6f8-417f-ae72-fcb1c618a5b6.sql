DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

GRANT SELECT ON public.products, public.product_variants, public.product_option_types,
  public.product_option_values, public.product_variant_values, public.product_combo_items,
  public.product_brand_listings, public.categories, public.brands, public.site_settings,
  public.marketing_reels, public.marketing_slides TO anon;
GRANT INSERT ON public.abandoned_carts, public.analytics_events, public.mkt_tracking_events,
  public.reviews, public.orders, public.order_items TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;