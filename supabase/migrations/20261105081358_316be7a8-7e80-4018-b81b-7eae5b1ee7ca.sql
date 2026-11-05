CREATE TABLE IF NOT EXISTS public._backup_hr_reset_2026_11_05 (src text, row_data jsonb, backed_at timestamptz default now());
REVOKE ALL ON public._backup_hr_reset_2026_11_05 FROM anon, authenticated;
GRANT ALL ON public._backup_hr_reset_2026_11_05 TO service_role;
ALTER TABLE public._backup_hr_reset_2026_11_05 ENABLE ROW LEVEL SECURITY;
INSERT INTO public._backup_hr_reset_2026_11_05(src,row_data)
 SELECT 'hr_attendance_events', to_jsonb(t) FROM public.hr_attendance_events t
 UNION ALL SELECT 'hr_job_runs', to_jsonb(t) FROM public.hr_job_runs t
 UNION ALL SELECT 'hr_leave_types', to_jsonb(t) FROM public.hr_leave_types t;
DELETE FROM public.hr_attendance_events WHERE id IS NOT NULL;
DELETE FROM public.hr_job_runs WHERE id IS NOT NULL;
DELETE FROM public.hr_leave_types WHERE id IS NOT NULL;