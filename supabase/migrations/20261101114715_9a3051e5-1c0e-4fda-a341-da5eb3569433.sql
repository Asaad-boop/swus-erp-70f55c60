ALTER TABLE public.hr_time_entries ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.hr_auto_close_stale_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record; close_at timestamptz;
BEGIN
  FOR r IN
    SELECT t.id, t.check_in, t.work_date, coalesce(e.shift_end, '19:00'::time) AS se
    FROM hr_time_entries t JOIN hr_employees e ON e.id = t.employee_id
    WHERE t.check_out IS NULL
      AND t.work_date < (now() AT TIME ZONE 'Asia/Dhaka')::date
  LOOP
    close_at := ((r.work_date + r.se) AT TIME ZONE 'Asia/Dhaka');
    IF close_at <= r.check_in THEN close_at := r.check_in + interval '1 minute'; END IF;
    UPDATE hr_breaks SET break_end = greatest(break_start, least(close_at, break_start + interval '1 hour'))
      WHERE time_entry_id = r.id AND break_end IS NULL;
    UPDATE hr_time_entries SET check_out = close_at, auto_closed = true,
      note = trim(coalesce(note,'') || ' [Auto-closed: missed checkout]')
      WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.hr_auto_close_stale_sessions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_auto_close_stale_sessions() TO authenticated, service_role;

SELECT public.hr_auto_close_stale_sessions();

CREATE UNIQUE INDEX IF NOT EXISTS hr_time_entries_one_open_per_employee
  ON public.hr_time_entries(employee_id) WHERE check_out IS NULL;

SELECT cron.schedule('hr-auto-close-sessions', '55 17 * * *', $$SELECT public.hr_auto_close_stale_sessions()$$);