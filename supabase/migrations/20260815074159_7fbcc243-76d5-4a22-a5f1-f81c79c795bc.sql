ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS break_start time,
  ADD COLUMN IF NOT EXISTS break_end time;

CREATE OR REPLACE FUNCTION public.hr_effective_break_allowance(_emp public.hr_employees)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _emp.break_start IS NOT NULL AND _emp.break_end IS NOT NULL THEN
      GREATEST(
        0,
        (EXTRACT(EPOCH FROM (
          CASE WHEN _emp.break_end >= _emp.break_start
            THEN _emp.break_end - _emp.break_start
            ELSE (_emp.break_end + interval '24 hour') - _emp.break_start
          END
        )) / 60)::int
      )
    ELSE COALESCE(_emp.break_allowance_min, 60)
  END
$$;