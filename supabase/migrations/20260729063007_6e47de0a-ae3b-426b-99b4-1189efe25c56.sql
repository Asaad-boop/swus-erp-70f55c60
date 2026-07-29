DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%has_role%'
  LOOP
    new_qual := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'has_role\(\( SELECT auth\.uid\(\) AS uid\), (''[a-z_]+''::app_role)\)', '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
      new_qual := regexp_replace(new_qual, '(?<!SELECT )has_role\(auth\.uid\(\), (''[a-z_]+''::app_role)\)', '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'has_role\(\( SELECT auth\.uid\(\) AS uid\), (''[a-z_]+''::app_role)\)', '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
      new_check := regexp_replace(new_check, '(?<!SELECT )has_role\(auth\.uid\(\), (''[a-z_]+''::app_role)\)', '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
    END IF;

    IF new_qual IS DISTINCT FROM p.qual OR new_check IS DISTINCT FROM p.with_check THEN
      sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      IF new_qual IS NOT NULL THEN
        sql := sql || format(' USING (%s)', new_qual);
      END IF;
      IF new_check IS NOT NULL THEN
        sql := sql || format(' WITH CHECK (%s)', new_check);
      END IF;
      EXECUTE sql;
    END IF;
  END LOOP;
END $$;