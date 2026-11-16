-- HRM v2 — part 1: schema, access helpers, RLS.
-- All writes to attendance/payroll go through SECURITY DEFINER RPCs (later parts),
-- so the client can only SELECT these tables. Times are Asia/Dhaka.

-- ───────────────────────── access helpers ─────────────────────────
-- Manager: sees and manages people + attendance + performance.
CREATE OR REPLACE FUNCTION public.hr_is_manager(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin','hr_admin','hr_manager')
  );
$$;

-- Payroll: salary figures, payroll runs, payouts.
CREATE OR REPLACE FUNCTION public.hr_can_pay(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin','hr_admin')
  );
$$;

-- ───────────────────────── employees ─────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.hr_employee_code_seq START 1;

CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,  -- cost brand; NULL = shared
  employee_code text NOT NULL UNIQUE
    DEFAULT ('EMP-' || lpad(nextval('public.hr_employee_code_seq')::text, 3, '0')),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone text,
  email text,
  photo_url text,
  designation text,
  department text,
  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','probation','resigned','terminated')),
  join_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  end_date date,
  -- schedule
  shift_start time NOT NULL DEFAULT '10:00',
  shift_end time NOT NULL DEFAULT '19:00',
  break_start time,
  break_end time,
  break_minutes int NOT NULL DEFAULT 60 CHECK (break_minutes BETWEEN 0 AND 600),
  work_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4,6}',   -- 0=Sun … 6=Sat (Fri off)
  late_grace_min int NOT NULL DEFAULT 10 CHECK (late_grace_min BETWEEN 0 AND 240),
  ot_min_minutes int NOT NULL DEFAULT 30 CHECK (ot_min_minutes BETWEEN 0 AND 600),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= join_date),
  CHECK (work_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
CREATE INDEX hr_employees_status_idx ON public.hr_employees(status);

-- Salary terms live apart so HR managers can run attendance without seeing pay.
CREATE TABLE public.hr_employee_pay (
  employee_id uuid PRIMARY KEY REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  ot_enabled boolean NOT NULL DEFAULT true,
  ot_rate_per_hour numeric(10,2) CHECK (ot_rate_per_hour IS NULL OR ot_rate_per_hour >= 0), -- NULL = auto
  ot_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (ot_multiplier > 0),
  absent_deduction boolean NOT NULL DEFAULT true,
  payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash','bkash','nagad','rocket','bank')),
  payment_account text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── calendar ─────────────────────────
CREATE TABLE public.hr_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_date)
);

CREATE TABLE public.hr_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_date - start_date <= 60)
);
CREATE INDEX hr_leaves_emp_idx ON public.hr_leaves(employee_id, start_date);

-- ───────────────────────── attendance ─────────────────────────
CREATE TABLE public.hr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  check_in timestamptz NOT NULL,
  check_out timestamptz,
  auto_closed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'self' CHECK (source IN ('self','admin')),
  note text,
  edited_by uuid,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out IS NULL OR check_out > check_in),
  CHECK (check_out IS NULL OR check_out - check_in <= interval '20 hours')
);
CREATE UNIQUE INDEX hr_sessions_one_open ON public.hr_sessions(employee_id) WHERE check_out IS NULL;
CREATE INDEX hr_sessions_emp_date ON public.hr_sessions(employee_id, work_date);
CREATE INDEX hr_sessions_date ON public.hr_sessions(work_date);

CREATE TABLE public.hr_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.hr_sessions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL,
  break_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (break_end IS NULL OR break_end >= break_start)
);
CREATE UNIQUE INDEX hr_breaks_one_open ON public.hr_breaks(employee_id) WHERE break_end IS NULL;
CREATE INDEX hr_breaks_session ON public.hr_breaks(session_id);

-- ───────────────────────── payroll ─────────────────────────
CREATE TABLE public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  period_from date NOT NULL,
  period_to date NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,  -- employee filter; NULL = all
  title text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','paid')),
  employee_count int NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  payout_account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  paid_on date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid,
  finalized_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  CHECK (period_to >= period_from),
  CHECK (period_to < (period_month + interval '1 month')::date)
);
CREATE INDEX hr_payroll_runs_month ON public.hr_payroll_runs(period_month);

CREATE TABLE public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE RESTRICT,
  employee_name text NOT NULL,
  employee_code text NOT NULL,
  brand_id uuid,
  designation text,
  monthly_salary numeric(12,2) NOT NULL,
  month_workdays int NOT NULL,
  per_day_rate numeric(12,2) NOT NULL,
  ot_rate numeric(10,2) NOT NULL,
  period_workdays int NOT NULL,
  present_days int NOT NULL,
  late_days int NOT NULL,
  absent_days int NOT NULL,
  paid_leave_days int NOT NULL,
  unpaid_leave_days int NOT NULL,
  holiday_days int NOT NULL,
  worked_minutes int NOT NULL,
  ot_minutes int NOT NULL,
  earned_basic numeric(12,2) NOT NULL,
  absent_amount numeric(12,2) NOT NULL,
  ot_amount numeric(12,2) NOT NULL,
  bonus numeric(12,2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  allowance numeric(12,2) NOT NULL DEFAULT 0 CHECK (allowance >= 0),
  deduction numeric(12,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  advance numeric(12,2) NOT NULL DEFAULT 0 CHECK (advance >= 0),
  previously_paid numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL,
  payment_method text,
  payment_account text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
CREATE INDEX hr_payslips_emp ON public.hr_payslips(employee_id);

-- ───────────────────────── updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER hr_employees_touch BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.hr_touch();
CREATE TRIGGER hr_employee_pay_touch BEFORE UPDATE ON public.hr_employee_pay FOR EACH ROW EXECUTE FUNCTION public.hr_touch();
CREATE TRIGGER hr_payslips_touch BEFORE UPDATE ON public.hr_payslips FOR EACH ROW EXECUTE FUNCTION public.hr_touch();

-- ───────────────────────── RLS ─────────────────────────
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_employees, public.hr_employee_pay, public.hr_holidays, public.hr_leaves,
  public.hr_sessions, public.hr_breaks, public.hr_payroll_runs, public.hr_payslips FROM anon;
REVOKE ALL ON public.hr_employees, public.hr_employee_pay, public.hr_holidays, public.hr_leaves,
  public.hr_sessions, public.hr_breaks, public.hr_payroll_runs, public.hr_payslips FROM authenticated;
GRANT SELECT ON public.hr_employees, public.hr_employee_pay, public.hr_holidays, public.hr_leaves,
  public.hr_sessions, public.hr_breaks, public.hr_payroll_runs, public.hr_payslips TO authenticated;
GRANT ALL ON public.hr_employees, public.hr_employee_pay, public.hr_holidays, public.hr_leaves,
  public.hr_sessions, public.hr_breaks, public.hr_payroll_runs, public.hr_payslips TO service_role;

CREATE POLICY hr_employees_read ON public.hr_employees FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_manager()) OR user_id = (SELECT auth.uid()));

CREATE POLICY hr_employee_pay_read ON public.hr_employee_pay FOR SELECT TO authenticated
  USING ((SELECT public.hr_can_pay())
         OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = (SELECT auth.uid())));

CREATE POLICY hr_holidays_read ON public.hr_holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY hr_leaves_read ON public.hr_leaves FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_manager())
         OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = (SELECT auth.uid())));

CREATE POLICY hr_sessions_read ON public.hr_sessions FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_manager())
         OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = (SELECT auth.uid())));

CREATE POLICY hr_breaks_read ON public.hr_breaks FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_manager())
         OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = (SELECT auth.uid())));

CREATE POLICY hr_payroll_runs_read ON public.hr_payroll_runs FOR SELECT TO authenticated
  USING ((SELECT public.hr_can_pay()));

-- Employees may read their own payslip once the run is finalized/paid.
CREATE OR REPLACE FUNCTION public.hr_run_released(_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hr_payroll_runs WHERE id = _run_id AND status IN ('finalized','paid'));
$$;

CREATE POLICY hr_payslips_read ON public.hr_payslips FOR SELECT TO authenticated
  USING ((SELECT public.hr_can_pay())
         OR (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = (SELECT auth.uid()))
             AND public.hr_run_released(run_id)));

-- Holidays: managers maintain them directly.
CREATE POLICY hr_holidays_write ON public.hr_holidays FOR ALL TO authenticated
  USING ((SELECT public.hr_is_manager())) WITH CHECK ((SELECT public.hr_is_manager()));
GRANT INSERT, UPDATE, DELETE ON public.hr_holidays TO authenticated;

REVOKE EXECUTE ON FUNCTION public.hr_is_manager(uuid), public.hr_can_pay(uuid), public.hr_run_released(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.hr_is_manager(uuid), public.hr_can_pay(uuid), public.hr_run_released(uuid) TO authenticated, service_role;
