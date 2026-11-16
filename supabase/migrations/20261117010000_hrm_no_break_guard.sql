-- Employees on continuous duty (break_minutes = 0) cannot start a break.
CREATE OR REPLACE FUNCTION public.hr_punch(_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.hr_employees;
  _open public.hr_sessions;
  _brk public.hr_breaks;
  _now timestamptz := now();
BEGIN
  SELECT * INTO e FROM public.hr_employees WHERE user_id = auth.uid() FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Your login is not linked to an employee profile. Ask HR.'; END IF;
  IF e.status NOT IN ('active','probation') THEN RAISE EXCEPTION 'Your employee profile is not active.'; END IF;

  SELECT * INTO _open FROM public.hr_sessions WHERE employee_id = e.id AND check_out IS NULL;
  IF _open.id IS NOT NULL THEN
    SELECT * INTO _brk FROM public.hr_breaks WHERE session_id = _open.id AND break_end IS NULL;
  END IF;

  IF _action = 'check_in' THEN
    IF _open.id IS NOT NULL THEN RETURN public.hr_my_status(); END IF;
    INSERT INTO public.hr_sessions(employee_id, work_date, check_in, source)
    VALUES (e.id, (_now AT TIME ZONE 'Asia/Dhaka')::date, _now, 'self');

  ELSIF _action = 'break_start' THEN
    IF _open.id IS NULL THEN RAISE EXCEPTION 'Check in first.'; END IF;
    IF e.break_minutes = 0 THEN RAISE EXCEPTION 'আপনার duty-তে কোনো break নেই (টানা ডিউটি)।'; END IF;
    IF _brk.id IS NOT NULL THEN RETURN public.hr_my_status(); END IF;
    INSERT INTO public.hr_breaks(session_id, employee_id, break_start) VALUES (_open.id, e.id, _now);

  ELSIF _action = 'break_end' THEN
    IF _brk.id IS NULL THEN RETURN public.hr_my_status(); END IF;
    UPDATE public.hr_breaks SET break_end = _now WHERE id = _brk.id;

  ELSIF _action = 'check_out' THEN
    IF _open.id IS NULL THEN RETURN public.hr_my_status(); END IF;
    IF _brk.id IS NOT NULL THEN UPDATE public.hr_breaks SET break_end = _now WHERE id = _brk.id; END IF;
    UPDATE public.hr_sessions SET check_out = greatest(_now, check_in + interval '1 second') WHERE id = _open.id;

  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  RETURN public.hr_my_status();
END $$;
