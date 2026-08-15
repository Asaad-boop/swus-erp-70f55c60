CREATE OR REPLACE FUNCTION public.hr_sync_attendance_from_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp public.hr_employees%ROWTYPE;
  v_first timestamptz;
  v_last timestamptz;
  v_start_local timestamp;
  v_end_local timestamp;
  v_grace int;
  v_late int := 0;
  v_ot int := 0;
  v_worked int := 0;
  v_break int := 0;
  v_shift int;
  v_off boolean := false;
  v_status text := 'present';
BEGIN
  SELECT * INTO emp FROM public.hr_employees WHERE id = NEW.employee_id;

  SELECT min(check_in), max(check_out) INTO v_first, v_last
  FROM public.hr_time_entries
  WHERE employee_id = NEW.employee_id AND work_date = NEW.work_date;

  -- worked minutes (closed sessions only) minus break minutes
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (check_out - check_in)) / 60), 0)::int INTO v_worked
  FROM public.hr_time_entries
  WHERE employee_id = NEW.employee_id AND work_date = NEW.work_date AND check_out IS NOT NULL;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (b.break_end - b.break_start)) / 60), 0)::int INTO v_break
  FROM public.hr_breaks b
  JOIN public.hr_time_entries e ON e.id = b.time_entry_id
  WHERE e.employee_id = NEW.employee_id AND e.work_date = NEW.work_date AND b.break_end IS NOT NULL;

  v_worked := GREATEST(0, v_worked - v_break);

  v_start_local := v_first AT TIME ZONE 'Asia/Dhaka';
  IF v_last IS NOT NULL THEN
    v_end_local := v_last AT TIME ZONE 'Asia/Dhaka';
  END IF;

  v_off := COALESCE(EXTRACT(DOW FROM NEW.work_date)::int = ANY (COALESCE(emp.week_offs, ARRAY[]::smallint[])::int[]), false);
  v_grace := COALESCE(emp.late_grace_min, 15);
  v_shift := COALESCE(
    (EXTRACT(EPOCH FROM (COALESCE(emp.shift_end, '19:00'::time) - COALESCE(emp.shift_start, '10:00'::time))) / 60)::int,
    540);
  IF v_shift <= 0 THEN v_shift := v_shift + 1440; END IF;

  IF v_off THEN
    v_status := 'week_off';
    IF COALESCE(emp.overtime_enabled, false) THEN v_ot := v_worked; END IF;
  ELSE
    v_late := GREATEST(0, (EXTRACT(EPOCH FROM (v_start_local::time - COALESCE(emp.shift_start, '10:00'::time))) / 60)::int - v_grace);
    IF v_late > 0 THEN v_status := 'late'; END IF;
    IF COALESCE(emp.overtime_enabled, false) AND v_worked > v_shift THEN
      v_ot := v_worked - v_shift;
      IF v_ot < COALESCE(emp.overtime_min_minutes, 0) THEN v_ot := 0; END IF;
    END IF;
  END IF;

  INSERT INTO public.hr_attendance (employee_id, work_date, status, check_in, check_out, late_minutes, overtime_minutes)
  VALUES (NEW.employee_id, NEW.work_date, v_status, v_first, v_last, v_late, v_ot)
  ON CONFLICT (employee_id, work_date) DO UPDATE
  SET status = CASE WHEN public.hr_attendance.status IN ('leave','holiday') THEN public.hr_attendance.status ELSE EXCLUDED.status END,
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      late_minutes = EXCLUDED.late_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes;
  RETURN NEW;
END;
$function$;

-- Breaks should also refresh the day's attendance summary.
CREATE OR REPLACE FUNCTION public.hr_sync_attendance_from_break()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.hr_time_entries%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.hr_time_entries WHERE id = COALESCE(NEW.time_entry_id, OLD.time_entry_id);
  IF FOUND THEN
    UPDATE public.hr_time_entries SET updated_at = now() WHERE id = e.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_breaks_sync_attendance ON public.hr_breaks;
CREATE TRIGGER trg_hr_breaks_sync_attendance
AFTER INSERT OR UPDATE OR DELETE ON public.hr_breaks
FOR EACH ROW EXECUTE FUNCTION public.hr_sync_attendance_from_break();