CREATE SCHEMA IF NOT EXISTS hr_backup;
REVOKE ALL ON SCHEMA hr_backup FROM PUBLIC, anon, authenticated;
CREATE TABLE hr_backup.time_entries_20261101 AS SELECT *, now() AS backed_up_at FROM public.hr_time_entries;
CREATE TABLE hr_backup.breaks_20261101 AS SELECT *, now() AS backed_up_at FROM public.hr_breaks;
CREATE TABLE hr_backup.attendance_20261101 AS SELECT *, now() AS backed_up_at FROM public.hr_attendance;
REVOKE ALL ON ALL TABLES IN SCHEMA hr_backup FROM PUBLIC, anon, authenticated;

ALTER TABLE public.hr_leaves ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS half_day_part text;

CREATE OR REPLACE FUNCTION public.hr_can_decide_leave(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','owner','hr_admin'))
$$;

-- audit
CREATE TABLE public.hr_attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_attendance_events TO authenticated;
GRANT ALL ON public.hr_attendance_events TO service_role;
ALTER TABLE public.hr_attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR can read attendance events" ON public.hr_attendance_events FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR public.hr_can_decide_leave(auth.uid()));
CREATE INDEX ON public.hr_attendance_events(employee_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.hr_log_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO hr_attendance_events(employee_id, entity, entity_id, action, old_data, new_data, actor)
  VALUES ((r->>'employee_id')::uuid, TG_TABLE_NAME, (r->>'id')::uuid, lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END, auth.uid());
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER trg_hr_te_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_time_entries FOR EACH ROW EXECUTE FUNCTION public.hr_log_event();
CREATE TRIGGER trg_hr_br_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_breaks FOR EACH ROW EXECUTE FUNCTION public.hr_log_event();
CREATE TRIGGER trg_hr_lv_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_leaves FOR EACH ROW EXECUTE FUNCTION public.hr_log_event();

-- one open break per employee
CREATE UNIQUE INDEX IF NOT EXISTS hr_breaks_one_open_per_employee ON public.hr_breaks(employee_id) WHERE break_end IS NULL;

-- leave validation
CREATE OR REPLACE FUNCTION public.hr_validate_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE offs int[]; quota numeric; used numeric; yr int;
BEGIN
  IF NEW.status NOT IN ('pending','approved') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status = NEW.status AND OLD.start_date=NEW.start_date AND OLD.end_date=NEW.end_date
     AND OLD.half_day=NEW.half_day THEN RETURN NEW; END IF;
  IF NEW.end_date < NEW.start_date THEN RAISE EXCEPTION 'End date age start date'; END IF;
  IF NEW.half_day AND NEW.end_date <> NEW.start_date THEN RAISE EXCEPTION 'Half day shudhu ek diner jonno'; END IF;
  IF extract(year FROM NEW.start_date) <> extract(year FROM NEW.end_date) THEN RAISE EXCEPTION 'Leave ek bochorer moddhe hote hobe'; END IF;
  SELECT coalesce(week_offs,'{}')::int[] INTO offs FROM hr_employees WHERE id=NEW.employee_id;
  NEW.days := CASE WHEN NEW.half_day THEN 0.5 ELSE public.hr_count_working_days(NEW.start_date, NEW.end_date, offs) END;
  IF NEW.days <= 0 THEN RAISE EXCEPTION 'Ei date-gulo shob off day/holiday'; END IF;
  IF EXISTS (SELECT 1 FROM hr_leaves l WHERE l.employee_id=NEW.employee_id AND l.id<>NEW.id
     AND l.status IN ('pending','approved') AND daterange(l.start_date,l.end_date,'[]') && daterange(NEW.start_date,NEW.end_date,'[]')
     AND NOT (l.half_day AND NEW.half_day AND coalesce(l.half_day_part,'') <> coalesce(NEW.half_day_part,''))) THEN
    RAISE EXCEPTION 'Ei date-e already leave ache';
  END IF;
  SELECT days_per_year INTO quota FROM hr_leave_types WHERE id=NEW.leave_type_id;
  IF quota IS NOT NULL AND quota > 0 THEN
    yr := extract(year FROM NEW.start_date);
    SELECT coalesce(sum(days),0) INTO used FROM hr_leaves l WHERE l.employee_id=NEW.employee_id AND l.leave_type_id=NEW.leave_type_id
      AND l.id<>NEW.id AND l.status IN ('pending','approved') AND extract(year FROM l.start_date)=yr;
    IF used + NEW.days > quota THEN RAISE EXCEPTION 'Balance nei: baki % din', quota-used; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_leaves_validate BEFORE INSERT OR UPDATE ON public.hr_leaves FOR EACH ROW EXECUTE FUNCTION public.hr_validate_leave();

CREATE OR REPLACE FUNCTION public.hr_decide_leave(_leave_id uuid, _status text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; offs int[]; d date;
BEGIN
  IF NOT public.hr_can_decide_leave(auth.uid()) THEN RAISE EXCEPTION 'Shudhu HR admin/owner leave approve korte pare'; END IF;
  IF _status NOT IN ('approved','rejected','cancelled') THEN RAISE EXCEPTION 'Bad status'; END IF;
  SELECT * INTO l FROM hr_leaves WHERE id=_leave_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave not found'; END IF;
  IF l.status = _status THEN RETURN; END IF;
  IF _status IN ('approved','rejected') AND l.status <> 'pending' THEN RAISE EXCEPTION 'Shudhu pending leave decide kora jay'; END IF;
  IF _status='approved' AND NOT l.half_day AND EXISTS (SELECT 1 FROM hr_time_entries t WHERE t.employee_id=l.employee_id
       AND t.work_date BETWEEN l.start_date AND l.end_date) THEN
    RAISE EXCEPTION 'Oi date-e employee kaj korche (attendance ache)';
  END IF;
  UPDATE hr_leaves SET status=_status, decided_at=now(), decided_by=auth.uid(),
    decision_note=coalesce(_note, decision_note) WHERE id=_leave_id;
  IF _status='approved' AND NOT l.half_day THEN
    SELECT coalesce(week_offs,'{}')::int[] INTO offs FROM hr_employees WHERE id=l.employee_id;
    FOR d IN SELECT generate_series(l.start_date, l.end_date, interval '1 day')::date LOOP
      CONTINUE WHEN extract(dow FROM d)::int = ANY(offs) OR EXISTS (SELECT 1 FROM hr_holidays h WHERE h.date=d);
      UPDATE hr_attendance SET status='leave' WHERE employee_id=l.employee_id AND work_date=d;
      IF NOT FOUND THEN INSERT INTO hr_attendance(employee_id, work_date, status) VALUES (l.employee_id, d, 'leave'); END IF;
    END LOOP;
  ELSIF l.status='approved' THEN
    DELETE FROM hr_attendance WHERE employee_id=l.employee_id AND status='leave'
      AND work_date BETWEEN l.start_date AND l.end_date;
  END IF;
END $$;

-- cron run log + overnight-aware auto close
CREATE TABLE public.hr_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL, closed_count int NOT NULL DEFAULT 0, error text,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_job_runs TO authenticated;
GRANT ALL ON public.hr_job_runs TO service_role;
ALTER TABLE public.hr_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR can read job runs" ON public.hr_job_runs FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.hr_auto_close_stale_sessions() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r record; close_at timestamptz;
BEGIN
  FOR r IN
    SELECT t.id, t.check_in, t.work_date, coalesce(e.shift_start,'10:00'::time) ss, coalesce(e.shift_end,'19:00'::time) se
    FROM hr_time_entries t JOIN hr_employees e ON e.id=t.employee_id
    WHERE t.check_out IS NULL FOR UPDATE OF t SKIP LOCKED
  LOOP
    close_at := ((r.work_date + r.se) AT TIME ZONE 'Asia/Dhaka');
    IF r.se <= r.ss THEN close_at := close_at + interval '1 day'; END IF;
    CONTINUE WHEN close_at > now();
    IF close_at <= r.check_in THEN close_at := r.check_in + interval '1 minute'; END IF;
    UPDATE hr_breaks SET break_end = greatest(break_start, least(close_at, break_start + interval '1 hour'))
      WHERE time_entry_id=r.id AND break_end IS NULL;
    UPDATE hr_time_entries SET check_out=close_at, auto_closed=true,
      note=trim(coalesce(note,'') || ' [Auto-closed: missed checkout]')
      WHERE id=r.id AND check_out IS NULL;
    n := n + 1;
  END LOOP;
  INSERT INTO hr_job_runs(job, closed_count) VALUES ('auto_close', n);
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_auto_close_stale_sessions() FROM PUBLIC, anon, authenticated;