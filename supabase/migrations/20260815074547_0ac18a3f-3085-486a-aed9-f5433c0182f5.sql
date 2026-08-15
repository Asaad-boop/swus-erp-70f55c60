CREATE OR REPLACE FUNCTION public.hr_recalc_attendance(p_employee uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp public.hr_employees%ROWTYPE;
  v_first timestamptz;
  v_last timestamptz;
  v_start_local timestamp;
  v_grace int;
  v_late int := 0;
  v_ot int := 0;
  v_raw int := 0;
  v_worked int := 0;
  v_break int := 0;
  v_allow int := 60;
  v_unpaid int := 0;
  v_shift int;
  v_off boolean := false;
  v_status text := 'present';
BEGIN
  SELECT * INTO emp FROM public.hr_employees WHERE id = p_employee;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT min(check_in), max(check_out) INTO v_first, v_last
  FROM public.hr_time_entries
  WHERE employee_id = p_employee AND work_date = p_date;

  IF v_first IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (check_out - check_in)) / 60), 0)::int INTO v_raw
  FROM public.hr_time_entries
  WHERE employee_id = p_employee AND work_date = p_date AND check_out IS NOT NULL;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (b.break_end - b.break_start)) / 60), 0)::int INTO v_break
  FROM public.hr_breaks b
  JOIN public.hr_time_entries e ON e.id = b.time_entry_id
  WHERE e.employee_id = p_employee AND e.work_date = p_date AND b.break_end IS NOT NULL;

  v_allow := public.hr_effective_break_allowance(emp);

  IF COALESCE(emp.unpaid_break, true) THEN
    v_unpaid := GREATEST(0, v_break - v_allow);
  END IF;
  v_worked := GREATEST(0, v_raw - v_unpaid);

  v_start_local := v_first AT TIME ZONE 'Asia/Dhaka';

  v_off := COALESCE(EXTRACT(DOW FROM p_date)::int = ANY (COALESCE(emp.week_offs, ARRAY[]::smallint[])::int[]), false);
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

  INSERT INTO public.hr_attendance (employee_id, work_date, status, check_in, check_out, late_minutes, overtime_minutes, work_minutes, break_minutes)
  VALUES (p_employee, p_date, v_status, v_first, v_last, v_late, v_ot, v_worked, v_break)
  ON CONFLICT (employee_id, work_date) DO UPDATE
  SET status = CASE WHEN public.hr_attendance.status IN ('leave','holiday') THEN public.hr_attendance.status ELSE EXCLUDED.status END,
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      late_minutes = EXCLUDED.late_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes,
      work_minutes = EXCLUDED.work_minutes,
      break_minutes = EXCLUDED.break_minutes;
END;
$function$;