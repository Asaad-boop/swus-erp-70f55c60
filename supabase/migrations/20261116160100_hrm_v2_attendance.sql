-- HRM v2 — part 2: employees RPCs, punch engine, admin corrections, auto-close, leaves.

-- ───────────────────────── time helpers ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date $$;

-- Shift start/end instants for an employee on a given date (overnight shifts end next day).
CREATE OR REPLACE FUNCTION public.hr_shift_start_ts(_d date, _start time)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT (_d + _start) AT TIME ZONE 'Asia/Dhaka' $$;

CREATE OR REPLACE FUNCTION public.hr_shift_end_ts(_d date, _start time, _end time)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ((_d + CASE WHEN _end <= _start THEN 1 ELSE 0 END) + _end) AT TIME ZONE 'Asia/Dhaka'
$$;

-- Net scheduled minutes per working day (shift length minus break allowance).
CREATE OR REPLACE FUNCTION public.hr_sched_minutes(_start time, _end time, _break int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT greatest(0,
    (extract(epoch FROM (CASE WHEN _end <= _start THEN _end - _start + interval '24 hours' ELSE _end - _start END)) / 60)::int
    - coalesce(_break, 0))
$$;

CREATE OR REPLACE FUNCTION public.hr_audit(_entity text, _id text, _action text, _before jsonb, _after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_audit_log(user_id, entity_type, entity_id, action, before_data, after_data, metadata)
  VALUES (auth.uid(), _entity, _id, _action, _before, _after, jsonb_build_object('source','hrm'));
$$;

-- ───────────────────────── employees ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_list_staff_logins()
RETURNS TABLE(user_id uuid, display_name text, email text, roles text[], employee_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  RETURN QUERY
  SELECT u.id, p.display_name, u.email::text,
         array_agg(DISTINCT r.role::text ORDER BY r.role::text),
         (SELECT e.id FROM public.hr_employees e WHERE e.user_id = u.id)
  FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id AND r.role <> 'customer'
  LEFT JOIN public.profiles p ON p.id = u.id
  GROUP BY u.id, p.display_name, u.email
  ORDER BY coalesce(p.display_name, u.email::text);
END $$;

-- Create or update an employee. Salary terms (_pay) are applied only for payroll admins.
CREATE OR REPLACE FUNCTION public.hr_save_employee(_id uuid, _data jsonb, _pay jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _emp_id uuid := _id;
  _uid uuid := nullif(_data->>'user_id','')::uuid;
  _before jsonb;
  _days smallint[];
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  IF coalesce(btrim(_data->>'full_name'),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  IF _uid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role <> 'customer') THEN
      RAISE EXCEPTION 'Selected login is not a staff account';
    END IF;
    IF EXISTS (SELECT 1 FROM public.hr_employees WHERE user_id = _uid AND id IS DISTINCT FROM _id) THEN
      RAISE EXCEPTION 'This login is already linked to another employee';
    END IF;
  END IF;

  SELECT coalesce(array_agg(DISTINCT x::smallint ORDER BY x::smallint), '{}')
    INTO _days FROM jsonb_array_elements_text(coalesce(_data->'work_days','[0,1,2,3,4,6]'::jsonb)) x;

  IF _id IS NULL THEN
    INSERT INTO public.hr_employees(
      user_id, brand_id, full_name, phone, email, photo_url, designation, department,
      employment_type, status, join_date, end_date, shift_start, shift_end, break_start, break_end,
      break_minutes, work_days, late_grace_min, ot_min_minutes, notes, created_by)
    VALUES (
      _uid, nullif(_data->>'brand_id','')::uuid, btrim(_data->>'full_name'),
      nullif(_data->>'phone',''), nullif(_data->>'email',''), nullif(_data->>'photo_url',''),
      nullif(_data->>'designation',''), nullif(_data->>'department',''),
      coalesce(nullif(_data->>'employment_type',''),'full_time'), coalesce(nullif(_data->>'status',''),'active'),
      coalesce(nullif(_data->>'join_date','')::date, public.hr_today()), nullif(_data->>'end_date','')::date,
      coalesce(nullif(_data->>'shift_start','')::time,'10:00'), coalesce(nullif(_data->>'shift_end','')::time,'19:00'),
      nullif(_data->>'break_start','')::time, nullif(_data->>'break_end','')::time,
      coalesce(nullif(_data->>'break_minutes','')::int, 60), _days,
      coalesce(nullif(_data->>'late_grace_min','')::int, 10), coalesce(nullif(_data->>'ot_min_minutes','')::int, 30),
      nullif(_data->>'notes',''), auth.uid())
    RETURNING id INTO _emp_id;
    INSERT INTO public.hr_employee_pay(employee_id) VALUES (_emp_id);
    PERFORM public.hr_audit('hr_employee', _emp_id::text, 'create', NULL, _data);
  ELSE
    SELECT to_jsonb(e) INTO _before FROM public.hr_employees e WHERE id = _id;
    IF _before IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;
    UPDATE public.hr_employees SET
      user_id = _uid,
      brand_id = nullif(_data->>'brand_id','')::uuid,
      full_name = btrim(_data->>'full_name'),
      phone = nullif(_data->>'phone',''),
      email = nullif(_data->>'email',''),
      photo_url = nullif(_data->>'photo_url',''),
      designation = nullif(_data->>'designation',''),
      department = nullif(_data->>'department',''),
      employment_type = coalesce(nullif(_data->>'employment_type',''), employment_type),
      status = coalesce(nullif(_data->>'status',''), status),
      join_date = coalesce(nullif(_data->>'join_date','')::date, join_date),
      end_date = nullif(_data->>'end_date','')::date,
      shift_start = coalesce(nullif(_data->>'shift_start','')::time, shift_start),
      shift_end = coalesce(nullif(_data->>'shift_end','')::time, shift_end),
      break_start = nullif(_data->>'break_start','')::time,
      break_end = nullif(_data->>'break_end','')::time,
      break_minutes = coalesce(nullif(_data->>'break_minutes','')::int, break_minutes),
      work_days = _days,
      late_grace_min = coalesce(nullif(_data->>'late_grace_min','')::int, late_grace_min),
      ot_min_minutes = coalesce(nullif(_data->>'ot_min_minutes','')::int, ot_min_minutes),
      notes = nullif(_data->>'notes','')
    WHERE id = _id;
    INSERT INTO public.hr_employee_pay(employee_id) VALUES (_id) ON CONFLICT DO NOTHING;
    PERFORM public.hr_audit('hr_employee', _id::text, 'update', _before, _data);
  END IF;

  IF _pay IS NOT NULL AND public.hr_can_pay() THEN
    UPDATE public.hr_employee_pay SET
      monthly_salary = coalesce(nullif(_pay->>'monthly_salary','')::numeric, monthly_salary),
      ot_enabled = coalesce((_pay->>'ot_enabled')::boolean, ot_enabled),
      ot_rate_per_hour = CASE WHEN _pay ? 'ot_rate_per_hour' THEN nullif(_pay->>'ot_rate_per_hour','')::numeric ELSE ot_rate_per_hour END,
      ot_multiplier = coalesce(nullif(_pay->>'ot_multiplier','')::numeric, ot_multiplier),
      absent_deduction = coalesce((_pay->>'absent_deduction')::boolean, absent_deduction),
      payment_method = coalesce(nullif(_pay->>'payment_method',''), payment_method),
      payment_account = CASE WHEN _pay ? 'payment_account' THEN nullif(_pay->>'payment_account','') ELSE payment_account END
    WHERE employee_id = _emp_id;
    PERFORM public.hr_audit('hr_employee_pay', _emp_id::text, 'update', NULL, _pay);
  END IF;

  RETURN _emp_id;
END $$;

-- ───────────────────────── punch engine ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_my_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.hr_employees;
  _today date := public.hr_today();
  _sessions jsonb;
  _open public.hr_sessions;
  _on_break boolean := false;
  _worked numeric := 0;
  _break numeric := 0;
  _holiday text;
  _leave boolean;
BEGIN
  SELECT * INTO e FROM public.hr_employees WHERE user_id = auth.uid();
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'server_now', now());
  END IF;

  SELECT * INTO _open FROM public.hr_sessions WHERE employee_id = e.id AND check_out IS NULL;
  IF _open.id IS NOT NULL THEN
    _on_break := EXISTS (SELECT 1 FROM public.hr_breaks WHERE session_id = _open.id AND break_end IS NULL);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'work_date', s.work_date, 'check_in', s.check_in, 'check_out', s.check_out,
           'auto_closed', s.auto_closed,
           'breaks', coalesce((SELECT jsonb_agg(jsonb_build_object('start', b.break_start, 'end', b.break_end) ORDER BY b.break_start)
                               FROM public.hr_breaks b WHERE b.session_id = s.id), '[]'::jsonb))
           ORDER BY s.check_in), '[]'::jsonb),
         coalesce(sum(extract(epoch FROM coalesce(s.check_out, now()) - s.check_in)), 0),
         coalesce(sum((SELECT coalesce(sum(extract(epoch FROM coalesce(b.break_end, s.check_out, now()) - b.break_start)), 0)
                       FROM public.hr_breaks b WHERE b.session_id = s.id)), 0)
    INTO _sessions, _worked, _break
  FROM public.hr_sessions s
  WHERE s.employee_id = e.id AND (s.work_date = _today OR s.check_out IS NULL);

  SELECT title INTO _holiday FROM public.hr_holidays WHERE holiday_date = _today;
  _leave := EXISTS (SELECT 1 FROM public.hr_leaves WHERE employee_id = e.id AND status = 'approved'
                    AND _today BETWEEN start_date AND end_date);

  RETURN jsonb_build_object(
    'linked', true,
    'server_now', now(),
    'employee', jsonb_build_object(
      'id', e.id, 'full_name', e.full_name, 'employee_code', e.employee_code, 'designation', e.designation,
      'status', e.status, 'shift_start', to_char(e.shift_start,'HH24:MI'), 'shift_end', to_char(e.shift_end,'HH24:MI'),
      'break_start', to_char(e.break_start,'HH24:MI'), 'break_end', to_char(e.break_end,'HH24:MI'),
      'break_minutes', e.break_minutes, 'work_days', to_jsonb(e.work_days),
      'sched_minutes', public.hr_sched_minutes(e.shift_start, e.shift_end, e.break_minutes)),
    'today', jsonb_build_object(
      'date', _today,
      'is_workday', extract(dow FROM _today)::smallint = ANY(e.work_days) AND _holiday IS NULL AND NOT _leave,
      'holiday', _holiday, 'on_leave', _leave,
      'shift_start_at', public.hr_shift_start_ts(_today, e.shift_start),
      'shift_end_at', public.hr_shift_end_ts(_today, e.shift_start, e.shift_end)),
    'state', CASE WHEN _open.id IS NULL THEN 'off' WHEN _on_break THEN 'on_break' ELSE 'working' END,
    'open_session_id', _open.id,
    'sessions', _sessions,
    'worked_seconds', greatest(0, round(_worked - _break)),
    'break_seconds', round(_break)
  );
END $$;

-- One tap: check_in | break_start | break_end | check_out. Server clock only.
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
    IF _open.id IS NOT NULL THEN RETURN public.hr_my_status(); END IF;   -- double tap: no-op
    INSERT INTO public.hr_sessions(employee_id, work_date, check_in, source)
    VALUES (e.id, (_now AT TIME ZONE 'Asia/Dhaka')::date, _now, 'self');

  ELSIF _action = 'break_start' THEN
    IF _open.id IS NULL THEN RAISE EXCEPTION 'Check in first.'; END IF;
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

-- ───────────────────────── admin corrections ─────────────────────────
-- Create/replace a session with its breaks. _breaks = [{"start": ts, "end": ts|null}, …]
CREATE OR REPLACE FUNCTION public.hr_admin_save_session(
  _id uuid, _employee_id uuid, _check_in timestamptz, _check_out timestamptz,
  _breaks jsonb DEFAULT '[]'::jsonb, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sid uuid := _id;
  _before jsonb;
  _b jsonb;
  _bs timestamptz;
  _be timestamptz;
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  IF _check_in IS NULL THEN RAISE EXCEPTION 'Check-in time is required'; END IF;
  IF _check_in > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Check-in cannot be in the future'; END IF;
  IF _check_out IS NOT NULL AND _check_out <= _check_in THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
  IF _check_out IS NOT NULL AND _check_out > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Check-out cannot be in the future'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_sessions s
    WHERE s.employee_id = _employee_id AND s.id IS DISTINCT FROM _id
      AND tstzrange(s.check_in, coalesce(s.check_out, 'infinity')) && tstzrange(_check_in, coalesce(_check_out, 'infinity'))
  ) THEN
    RAISE EXCEPTION 'This time overlaps another session of the same employee';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.hr_sessions(employee_id, work_date, check_in, check_out, source, note, edited_by, edited_at)
    VALUES (_employee_id, (_check_in AT TIME ZONE 'Asia/Dhaka')::date, _check_in, _check_out, 'admin', _note, auth.uid(), now())
    RETURNING id INTO _sid;
  ELSE
    SELECT to_jsonb(s) || jsonb_build_object('breaks', (SELECT jsonb_agg(to_jsonb(b)) FROM public.hr_breaks b WHERE b.session_id = s.id))
      INTO _before FROM public.hr_sessions s WHERE s.id = _id AND s.employee_id = _employee_id;
    IF _before IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
    UPDATE public.hr_sessions SET
      work_date = (_check_in AT TIME ZONE 'Asia/Dhaka')::date,
      check_in = _check_in, check_out = _check_out,
      auto_closed = false, note = _note, edited_by = auth.uid(), edited_at = now()
    WHERE id = _id;
  END IF;

  DELETE FROM public.hr_breaks WHERE session_id = _sid;
  FOR _b IN SELECT * FROM jsonb_array_elements(coalesce(_breaks, '[]'::jsonb)) LOOP
    _bs := nullif(_b->>'start','')::timestamptz;
    _be := nullif(_b->>'end','')::timestamptz;
    IF _bs IS NULL THEN CONTINUE; END IF;
    IF _bs < _check_in OR (_check_out IS NOT NULL AND (_be IS NULL OR _be > _check_out)) OR (_be IS NOT NULL AND _be < _bs) THEN
      RAISE EXCEPTION 'Each break must sit inside the session';
    END IF;
    INSERT INTO public.hr_breaks(session_id, employee_id, break_start, break_end) VALUES (_sid, _employee_id, _bs, _be);
  END LOOP;

  PERFORM public.hr_audit('hr_session', _sid::text, CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END, _before,
    jsonb_build_object('check_in', _check_in, 'check_out', _check_out, 'breaks', _breaks, 'note', _note));
  RETURN _sid;
END $$;

CREATE OR REPLACE FUNCTION public.hr_admin_delete_session(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _before jsonb;
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  SELECT to_jsonb(s) INTO _before FROM public.hr_sessions s WHERE id = _id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  DELETE FROM public.hr_sessions WHERE id = _id;
  PERFORM public.hr_audit('hr_session', _id::text, 'delete', _before, NULL);
END $$;

-- Close sessions people forgot to check out of: at shift end (or check-in if later),
-- once shift end is 3 hours past. Flagged auto_closed so HR can review.
CREATE OR REPLACE FUNCTION public.hr_auto_close_sessions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _n int := 0; _close timestamptz;
BEGIN
  FOR r IN
    SELECT s.id, s.check_in, e.shift_start, e.shift_end, s.work_date
    FROM public.hr_sessions s JOIN public.hr_employees e ON e.id = s.employee_id
    WHERE s.check_out IS NULL
      AND (now() > public.hr_shift_end_ts(s.work_date, e.shift_start, e.shift_end) + interval '3 hours'
           OR now() > s.check_in + interval '16 hours')
  LOOP
    _close := public.hr_shift_end_ts(r.work_date, r.shift_start, r.shift_end);
    IF _close <= r.check_in THEN _close := r.check_in + interval '1 minute'; END IF;
    IF _close > r.check_in + interval '16 hours' THEN _close := r.check_in + interval '16 hours'; END IF;
    UPDATE public.hr_breaks SET break_end = greatest(break_start, least(_close, now()))
      WHERE session_id = r.id AND break_end IS NULL;
    UPDATE public.hr_breaks SET break_end = _close WHERE session_id = r.id AND break_end > _close;
    DELETE FROM public.hr_breaks WHERE session_id = r.id AND break_start >= _close;
    UPDATE public.hr_sessions SET check_out = _close, auto_closed = true WHERE id = r.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- ───────────────────────── leaves ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_request_leave(_start date, _end date, _paid boolean, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid; _id uuid;
BEGIN
  SELECT id INTO _emp FROM public.hr_employees WHERE user_id = auth.uid();
  IF _emp IS NULL THEN RAISE EXCEPTION 'Your login is not linked to an employee profile.'; END IF;
  IF _end < _start THEN RAISE EXCEPTION 'End date is before start date'; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_leaves WHERE employee_id = _emp AND status IN ('pending','approved')
             AND daterange(start_date, end_date, '[]') && daterange(_start, _end, '[]')) THEN
    RAISE EXCEPTION 'You already have leave on these dates';
  END IF;
  INSERT INTO public.hr_leaves(employee_id, start_date, end_date, paid, reason, status, requested_by)
  VALUES (_emp, _start, _end, coalesce(_paid, true), nullif(btrim(_reason),''), 'pending', auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.hr_cancel_my_leave(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hr_leaves l SET status = 'cancelled'
  WHERE l.id = _id AND l.status = 'pending'
    AND l.employee_id = (SELECT id FROM public.hr_employees WHERE user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your own pending leave can be cancelled'; END IF;
END $$;

-- HR: add leave directly (approved) or edit an existing one.
CREATE OR REPLACE FUNCTION public.hr_save_leave(_id uuid, _employee_id uuid, _start date, _end date, _paid boolean, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lid uuid := _id;
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  IF _end < _start THEN RAISE EXCEPTION 'End date is before start date'; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_leaves WHERE employee_id = _employee_id AND id IS DISTINCT FROM _id
             AND status IN ('pending','approved')
             AND daterange(start_date, end_date, '[]') && daterange(_start, _end, '[]')) THEN
    RAISE EXCEPTION 'Overlaps another leave of this employee';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.hr_leaves(employee_id, start_date, end_date, paid, reason, status, requested_by, decided_by, decided_at)
    VALUES (_employee_id, _start, _end, coalesce(_paid,true), nullif(btrim(_reason),''), 'approved', auth.uid(), auth.uid(), now())
    RETURNING id INTO _lid;
  ELSE
    UPDATE public.hr_leaves SET employee_id = _employee_id, start_date = _start, end_date = _end,
      paid = coalesce(_paid,true), reason = nullif(btrim(_reason),'')
    WHERE id = _id;
  END IF;
  PERFORM public.hr_audit('hr_leave', _lid::text, CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END, NULL,
    jsonb_build_object('employee_id', _employee_id, 'start', _start, 'end', _end, 'paid', _paid));
  RETURN _lid;
END $$;

CREATE OR REPLACE FUNCTION public.hr_decide_leave(_id uuid, _approve boolean, _paid boolean DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  UPDATE public.hr_leaves SET
    status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    paid = coalesce(_paid, paid),
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(_note),'')
  WHERE id = _id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave is not pending'; END IF;
  PERFORM public.hr_audit('hr_leave', _id::text, CASE WHEN _approve THEN 'approve' ELSE 'reject' END, NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.hr_delete_leave(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.hr_is_manager() THEN RAISE EXCEPTION 'HR access required'; END IF;
  DELETE FROM public.hr_leaves WHERE id = _id;
  PERFORM public.hr_audit('hr_leave', _id::text, 'delete', NULL, NULL);
END $$;

-- ───────────────────────── grants ─────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.hr_list_staff_logins()',
    'public.hr_save_employee(uuid,jsonb,jsonb)',
    'public.hr_my_status()',
    'public.hr_punch(text)',
    'public.hr_admin_save_session(uuid,uuid,timestamptz,timestamptz,jsonb,text)',
    'public.hr_admin_delete_session(uuid)',
    'public.hr_request_leave(date,date,boolean,text)',
    'public.hr_cancel_my_leave(uuid)',
    'public.hr_save_leave(uuid,uuid,date,date,boolean,text)',
    'public.hr_decide_leave(uuid,boolean,boolean,text)',
    'public.hr_delete_leave(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_auto_close_sessions() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_audit(text,text,text,jsonb,jsonb) FROM public, anon, authenticated;

SELECT cron.schedule('hr-auto-close-sessions', '*/15 * * * *', $$SELECT public.hr_auto_close_sessions()$$);
