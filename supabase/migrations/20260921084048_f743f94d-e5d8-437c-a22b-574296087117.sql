-- 1) sms_logs: restrict SELECT to staff roles
DROP POLICY IF EXISTS sms_logs_select_auth ON public.sms_logs;
CREATE POLICY sms_logs_select_staff ON public.sms_logs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
);

-- 2) active_sessions: remove blanket anon ALL policy (anon keeps insert/update own-presence via existing policies; staff SELECT/UPDATE/INSERT policies already exist)
DROP POLICY IF EXISTS anon_session_upsert ON public.active_sessions;
-- anon must not read sessions at all
REVOKE SELECT ON public.active_sessions FROM anon;

-- 3) backup tables: enable RLS with no policies = deny all API access; revoke grants
ALTER TABLE public._backup_instapay_dup_2026_08_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_instapay_dup_exp_2026_08_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_phase4b_brand_remap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_status_migration_2026_07_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_step3_categorize ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._backup_instapay_dup_2026_08_02 FROM anon, authenticated;
REVOKE ALL ON public._backup_instapay_dup_exp_2026_08_02 FROM anon, authenticated;
REVOKE ALL ON public._backup_phase4b_brand_remap FROM anon, authenticated;
REVOKE ALL ON public._backup_status_migration_2026_07_12 FROM anon, authenticated;
REVOKE ALL ON public._backup_step3_categorize FROM anon, authenticated;