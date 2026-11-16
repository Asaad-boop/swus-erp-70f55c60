-- HRM v2 — part 3: the one place that turns punches into daily attendance.
-- Every screen (team board, attendance log, payroll, performance) reads this.

CREATE OR REPLACE FUNCTION public.hr_attendance_days(_from date, _to date, _employee_id uuid DEFAULT NULL)
RETURNS TABLE(
  employee_id uuid, employee_name text, employee_code text, designation text, brand_id uuid,
  work_date date, day_type text, status text,
  first_in timestamptz, last_out timestamptz, is_open boolean, on_break boolean, session_count int,
  worked_min int, break_min int, sched_min int, late_min int, early_min int, ot_min int,
  auto_closed boolean, holiday_title text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _mgr boolean := public.hr_is_manager();
  _today date := public.hr_today();
BEGIN
  IF _to < _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF _to - _from > 92 THEN RAISE EXCEPTION 'Date range is limited to 93 days'; END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.* FROM public.hr_employees e
    WHERE (_employee_id IS NULL OR e.id = _employee_id)
      AND (_mgr OR e.user_id = auth.uid())
  ),
  grid AS (
    SELECT e.id AS eid, e.full_name, e.employee_code, e.designation, e.brand_id,
           e.join_date, e.end_date, e.shift_start, e.shift_end, e.break_minutes, e.work_days,
           e.late_grace_min, e.ot_min_minutes, d::date AS wd,
           h.title AS htitle,
           (SELECT l.paid FROM public.hr_leaves l
             WHERE l.employee_id = e.id AND l.status = 'approved' AND d::date BETWEEN l.start_date AND l.end_date
             ORDER BY l.paid DESC LIMIT 1) AS leave_paid
    FROM emp e
    CROSS JOIN generate_series(_from, _to, interval '1 day') d
    LEFT JOIN public.hr_holidays h ON h.holiday_date = d::date
  ),
  typed AS (
    SELECT g.*,
      CASE
        WHEN g.wd < g.join_date OR (g.end_date IS NOT NULL AND g.wd > g.end_date) THEN 'not_employed'
        WHEN g.htitle IS NOT NULL THEN 'holiday'
        WHEN NOT (extract(dow FROM g.wd)::smallint = ANY(g.work_days)) THEN 'weekly_off'
        WHEN g.leave_paid IS TRUE THEN 'leave_paid'
        WHEN g.leave_paid IS FALSE THEN 'leave_unpaid'
        ELSE 'workday'
      END AS dtype,
      public.hr_shift_start_ts(g.wd, g.shift_start) AS s_start,
      public.hr_shift_end_ts(g.wd, g.shift_start, g.shift_end) AS s_end,
      public.hr_sched_minutes(g.shift_start, g.shift_end, g.break_minutes) AS s_min
    FROM grid g
  ),
  agg AS (
    SELECT t.*, x.*
    FROM typed t
    LEFT JOIN LATERAL (
      SELECT
        min(s.check_in) AS f_in,
        CASE WHEN bool_or(s.check_out IS NULL) THEN NULL ELSE max(s.check_out) END AS l_out,
        coalesce(bool_or(s.check_out IS NULL), false) AS open_now,
        coalesce(bool_or(s.auto_closed), false) AS auto_c,
        count(s.id)::int AS n_sess,
        coalesce(sum(extract(epoch FROM coalesce(s.check_out, now()) - s.check_in)), 0) AS gross_s,
        coalesce(sum(br.b_s), 0) AS break_s,
        coalesce(bool_or(br.b_open), false) AS brk_open
      FROM public.hr_sessions s
      LEFT JOIN LATERAL (
        SELECT sum(extract(epoch FROM coalesce(b.break_end, s.check_out, now()) - b.break_start)) AS b_s,
               bool_or(b.break_end IS NULL) AS b_open
        FROM public.hr_breaks b WHERE b.session_id = s.id
      ) br ON true
      WHERE s.employee_id = t.eid AND s.work_date = t.wd
    ) x ON true
  ),
  calc AS (
    SELECT a.*,
      greatest(0, floor((a.gross_s - a.break_s) / 60))::int AS w_min,
      CASE WHEN a.dtype = 'workday' THEN a.s_min ELSE 0 END AS sch_min,
      CASE WHEN a.dtype = 'workday' AND a.f_in IS NOT NULL
                AND a.f_in > a.s_start + make_interval(mins => a.late_grace_min)
           THEN ceil(extract(epoch FROM a.f_in - a.s_start) / 60)::int ELSE 0 END AS lt_min,
      CASE WHEN a.dtype = 'workday' AND a.l_out IS NOT NULL AND a.l_out < a.s_end
           THEN floor(extract(epoch FROM a.s_end - a.l_out) / 60)::int ELSE 0 END AS el_min
    FROM agg a
  )
  SELECT
    c.eid, c.full_name, c.employee_code, c.designation, c.brand_id,
    c.wd, c.dtype,
    CASE
      WHEN c.dtype = 'not_employed' THEN 'not_employed'
      WHEN c.n_sess > 0 AND c.open_now AND c.brk_open THEN 'on_break'
      WHEN c.n_sess > 0 AND c.open_now THEN 'working'
      WHEN c.n_sess > 0 AND c.lt_min > 0 THEN 'late'
      WHEN c.n_sess > 0 THEN 'present'
      WHEN c.wd > _today THEN 'upcoming'
      WHEN c.dtype = 'holiday' THEN 'holiday'
      WHEN c.dtype = 'weekly_off' THEN 'off'
      WHEN c.dtype IN ('leave_paid','leave_unpaid') THEN 'leave'
      WHEN c.wd = _today AND now() < c.s_end THEN 'not_yet'
      ELSE 'absent'
    END,
    c.f_in, c.l_out, c.open_now, c.brk_open, coalesce(c.n_sess, 0),
    c.w_min, floor(c.break_s / 60)::int, c.sch_min, c.lt_min, c.el_min,
    CASE
      WHEN c.dtype = 'workday' AND c.w_min - c.sch_min >= greatest(c.ot_min_minutes, 1) THEN c.w_min - c.sch_min
      WHEN c.dtype IN ('holiday','weekly_off','leave_paid','leave_unpaid') AND c.w_min >= greatest(c.ot_min_minutes, 1) THEN c.w_min
      ELSE 0
    END,
    c.auto_c, c.htitle
  FROM calc c
  ORDER BY c.full_name, c.wd;
END $$;

REVOKE EXECUTE ON FUNCTION public.hr_attendance_days(date,date,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_days(date,date,uuid) TO authenticated, service_role;
