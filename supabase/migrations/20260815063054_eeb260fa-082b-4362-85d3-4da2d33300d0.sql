CREATE TABLE public.hr_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz,
  source text NOT NULL DEFAULT 'web',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_time_entries_emp_date ON public.hr_time_entries(employee_id, work_date);
CREATE INDEX idx_hr_time_entries_date ON public.hr_time_entries(work_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_time_entries TO authenticated;
GRANT ALL ON public.hr_time_entries TO service_role;
ALTER TABLE public.hr_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_time_entries_self_select" ON public.hr_time_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_time_entries_self_insert" ON public.hr_time_entries FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_time_entries_self_update" ON public.hr_time_entries FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_time_entries_hr_delete" ON public.hr_time_entries FOR DELETE TO authenticated
USING (public.has_hr_access(auth.uid()));

CREATE TABLE public.hr_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.hr_time_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL DEFAULT now(),
  break_end timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_breaks_entry ON public.hr_breaks(time_entry_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_breaks TO authenticated;
GRANT ALL ON public.hr_breaks TO service_role;
ALTER TABLE public.hr_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_breaks_self_select" ON public.hr_breaks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_breaks_self_insert" ON public.hr_breaks FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_breaks_self_update" ON public.hr_breaks FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()) OR public.has_hr_access(auth.uid()));
CREATE POLICY "hr_breaks_hr_delete" ON public.hr_breaks FOR DELETE TO authenticated
USING (public.has_hr_access(auth.uid()));

CREATE TRIGGER trg_hr_time_entries_updated_at BEFORE UPDATE ON public.hr_time_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_breaks_updated_at BEFORE UPDATE ON public.hr_breaks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep hr_attendance in sync with punches
CREATE OR REPLACE FUNCTION public.hr_sync_attendance_from_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_local timestamp;
  v_end_local timestamp;
  v_office_in time := '10:00';
  v_office_out time := '19:00';
  v_grace int := 15;
  v_late int := 0;
  v_ot int := 0;
  v_status text := 'present';
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  SELECT min(check_in), max(check_out) INTO v_first, v_last
  FROM public.hr_time_entries
  WHERE employee_id = NEW.employee_id AND work_date = NEW.work_date;

  v_start_local := v_first AT TIME ZONE 'Asia/Dhaka';
  IF v_last IS NOT NULL THEN
    v_end_local := v_last AT TIME ZONE 'Asia/Dhaka';
  END IF;

  v_late := GREATEST(0, (EXTRACT(EPOCH FROM (v_start_local::time - v_office_in)) / 60)::int - v_grace);
  IF v_late > 0 THEN v_status := 'late'; END IF;
  IF v_end_local IS NOT NULL THEN
    v_ot := GREATEST(0, (EXTRACT(EPOCH FROM (v_end_local::time - v_office_out)) / 60)::int);
  END IF;

  INSERT INTO public.hr_attendance (employee_id, work_date, status, check_in, check_out, late_minutes, overtime_minutes)
  VALUES (NEW.employee_id, NEW.work_date, v_status, v_first, v_last, v_late, v_ot)
  ON CONFLICT (employee_id, work_date) DO UPDATE
  SET status = CASE WHEN public.hr_attendance.status IN ('leave','holiday','week_off') THEN public.hr_attendance.status ELSE EXCLUDED.status END,
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      late_minutes = EXCLUDED.late_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_time_entry_sync_attendance
AFTER INSERT OR UPDATE ON public.hr_time_entries
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_attendance_from_entry();