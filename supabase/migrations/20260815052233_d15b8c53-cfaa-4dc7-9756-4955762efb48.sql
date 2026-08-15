-- helper
CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','hr_admin','hr_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.hr_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- departments
CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_departments TO authenticated;
GRANT ALL ON public.hr_departments TO service_role;
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_departments_read ON public.hr_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY hr_departments_write ON public.hr_departments FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_departments_touch BEFORE UPDATE ON public.hr_departments
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- designations
CREATE TABLE public.hr_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_designations TO authenticated;
GRANT ALL ON public.hr_designations TO service_role;
ALTER TABLE public.hr_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_designations_read ON public.hr_designations FOR SELECT TO authenticated USING (true);
CREATE POLICY hr_designations_write ON public.hr_designations FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_designations_touch BEFORE UPDATE ON public.hr_designations
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- employees
CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  employee_code text UNIQUE,
  full_name text NOT NULL,
  phone text,
  email text,
  photo_url text,
  department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  designation_id uuid REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  join_date date,
  employment_type text NOT NULL DEFAULT 'full_time',
  status text NOT NULL DEFAULT 'active',
  monthly_salary numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_number text,
  nid text,
  date_of_birth date,
  blood_group text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  resign_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_employees_user ON public.hr_employees(user_id);
CREATE INDEX idx_hr_employees_status ON public.hr_employees(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employees TO authenticated;
GRANT ALL ON public.hr_employees TO service_role;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_employees_read ON public.hr_employees FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR user_id = auth.uid());
CREATE POLICY hr_employees_write ON public.hr_employees FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_employees_touch BEFORE UPDATE ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- documents
CREATE TABLE public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text,
  file_url text,
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_documents TO authenticated;
GRANT ALL ON public.hr_documents TO service_role;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_documents_read ON public.hr_documents FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_documents_write ON public.hr_documents FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_documents_touch BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- attendance
CREATE TABLE public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  status text NOT NULL DEFAULT 'present',
  check_in timestamptz,
  check_out timestamptz,
  work_minutes integer,
  late_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  note text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX idx_hr_attendance_date ON public.hr_attendance(work_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_attendance TO authenticated;
GRANT ALL ON public.hr_attendance TO service_role;
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_attendance_read ON public.hr_attendance FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_attendance_write ON public.hr_attendance FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_attendance_touch BEFORE UPDATE ON public.hr_attendance
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- leave types
CREATE TABLE public.hr_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days_per_year numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_types TO authenticated;
GRANT ALL ON public.hr_leave_types TO service_role;
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_leave_types_read ON public.hr_leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY hr_leave_types_write ON public.hr_leave_types FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_leave_types_touch BEFORE UPDATE ON public.hr_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- leaves
CREATE TABLE public.hr_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.hr_leave_types(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leaves TO authenticated;
GRANT ALL ON public.hr_leaves TO service_role;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_leaves_read ON public.hr_leaves FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_leaves_self_insert ON public.hr_leaves FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_leaves_write ON public.hr_leaves FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_leaves_touch BEFORE UPDATE ON public.hr_leaves
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- holidays
CREATE TABLE public.hr_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  title text NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_holidays TO authenticated;
GRANT ALL ON public.hr_holidays TO service_role;
ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_holidays_read ON public.hr_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY hr_holidays_write ON public.hr_holidays FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_holidays_touch BEFORE UPDATE ON public.hr_holidays
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- payroll runs
CREATE TABLE public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_gross numeric NOT NULL DEFAULT 0,
  total_deduction numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  paid_at timestamptz,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_runs TO authenticated;
GRANT ALL ON public.hr_payroll_runs TO service_role;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_runs_all ON public.hr_payroll_runs FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_payroll_runs_touch BEFORE UPDATE ON public.hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- payslips
CREATE TABLE public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  base_salary numeric NOT NULL DEFAULT 0,
  present_days numeric NOT NULL DEFAULT 0,
  absent_days numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  overtime_amount numeric NOT NULL DEFAULT 0,
  allowance numeric NOT NULL DEFAULT 0,
  deduction numeric NOT NULL DEFAULT 0,
  advance_deduction numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  paid_at timestamptz,
  txn_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payslips TO authenticated;
GRANT ALL ON public.hr_payslips TO service_role;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_payslips_read ON public.hr_payslips FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_payslips_write ON public.hr_payslips FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_payslips_touch BEFORE UPDATE ON public.hr_payslips
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- reviews
CREATE TABLE public.hr_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  rating numeric,
  strengths text,
  improvements text,
  goals text,
  incentive_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  reviewer_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_reviews TO authenticated;
GRANT ALL ON public.hr_reviews TO service_role;
ALTER TABLE public.hr_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_reviews_read ON public.hr_reviews FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_reviews_write ON public.hr_reviews FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_reviews_touch BEFORE UPDATE ON public.hr_reviews
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- kpi entries
CREATE TABLE public.hr_kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  metric text NOT NULL,
  unit text,
  target_value numeric NOT NULL DEFAULT 0,
  actual_value numeric NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_kpi_entries TO authenticated;
GRANT ALL ON public.hr_kpi_entries TO service_role;
ALTER TABLE public.hr_kpi_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_kpi_read ON public.hr_kpi_entries FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_kpi_write ON public.hr_kpi_entries FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_kpi_touch BEFORE UPDATE ON public.hr_kpi_entries
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- employee events (note / warning / promotion / increment / award)
CREATE TABLE public.hr_employee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  details text,
  amount numeric,
  effective_date date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_events TO authenticated;
GRANT ALL ON public.hr_employee_events TO service_role;
ALTER TABLE public.hr_employee_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_events_read ON public.hr_employee_events FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY hr_events_write ON public.hr_employee_events FOR ALL TO authenticated
  USING (public.has_hr_access(auth.uid())) WITH CHECK (public.has_hr_access(auth.uid()));
CREATE TRIGGER trg_hr_events_touch BEFORE UPDATE ON public.hr_employee_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- seed default leave types
INSERT INTO public.hr_leave_types (name, days_per_year, is_paid) VALUES
  ('Casual Leave', 10, true),
  ('Sick Leave', 14, true),
  ('Unpaid Leave', 0, false);