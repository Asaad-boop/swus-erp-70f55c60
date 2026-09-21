DO $$
DECLARE t text; p text;
BEGIN
  FOR t IN
    SELECT cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND cl.relkind='r' AND cl.relname NOT LIKE '\_backup%'
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    FOR p IN
      SELECT DISTINCT pol.cmd FROM pg_policies pol
      WHERE pol.schemaname='public' AND pol.tablename=t
        AND ('anon' = ANY(pol.roles) OR 'public' = ANY(pol.roles))
    LOOP
      IF p = 'ALL' THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
      ELSE
        EXECUTE format('GRANT %s ON public.%I TO anon', p, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE v text;
BEGIN
  FOR v IN
    SELECT cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND cl.relkind IN ('v','m')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', v);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;