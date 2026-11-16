-- HRM removal, step 2 of 2: back up every hr_* row, then drop the old HRM.
-- Run only after the app build without /erp/hr is live.
-- Staff identity/access tables (user_roles, staff_permissions, user_brand_access,
-- profiles) are NOT touched.

-- 1) Backup (service_role only). Includes the earlier 2026-11-05 reset backup.
CREATE TABLE IF NOT EXISTS public._backup_hrm_removed_2026_11_16 (
  src text NOT NULL,
  row_data jsonb NOT NULL,
  backed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public._backup_hrm_removed_2026_11_16 FROM anon, authenticated;
GRANT ALL ON public._backup_hrm_removed_2026_11_16 TO service_role;
ALTER TABLE public._backup_hrm_removed_2026_11_16 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname LIKE 'hr\_%' OR c.relname = '_backup_hr_reset_2026_11_05')
  LOOP
    EXECUTE format(
      'INSERT INTO public._backup_hrm_removed_2026_11_16(src, row_data) SELECT %L, to_jsonb(x) FROM public.%I x',
      t, t);
  END LOOP;
END $$;

-- 2) Cron job
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hr-auto-close-sessions';

-- 3) Tables (triggers, policies and indexes go with them)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname LIKE 'hr\_%' OR c.relname = '_backup_hr_reset_2026_11_05')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END $$;

-- 4) Functions
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'hr\_%'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.has_hr_access(uuid);
