ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS shift_start time NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS shift_end time NOT NULL DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS week_offs smallint[] NOT NULL DEFAULT ARRAY[5]::smallint[],
  ADD COLUMN IF NOT EXISTS late_grace_min smallint,
  ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_holiday_multiplier numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS overtime_min_minutes smallint NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.hr_employees.week_offs IS '0=Sunday .. 6=Saturday weekly off days';
COMMENT ON COLUMN public.hr_employees.overtime_rate IS 'BDT per overtime hour';