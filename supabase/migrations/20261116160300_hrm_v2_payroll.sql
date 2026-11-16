-- HRM v2 — part 4: payroll engine.
--
-- Pay for a period = monthly salary × paid working days ÷ working days in the month.
--   working days in month = scheduled work days that are not public holidays
--   paid working days     = scheduled days in the period while employed
--                           − absent days (if absent deduction is on) − unpaid leave days
-- So a full month with no absences pays exactly the monthly salary, a run up to the
-- 20th pays only what is earned until the 20th, and a joiner/leaver is pro-rated.
-- Overtime = OT hours × (fixed rate, or hourly rate × multiplier).
-- A later run in the same month subtracts what earlier PAID runs already paid.

CREATE OR REPLACE FUNCTION public.hr__compute_payslip(_run_id uuid, _employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.hr_payroll_runs;
  e public.hr_employees;
  p public.hr_employee_pay;
  _m_start date; _m_end date;
  _m_work int;
  _sched_min int;
  _hourly numeric;
  _ot_rate numeric;
  d record;
  _deduct int;
  _paid_days int;
  _earned numeric;
  _absent_amt numeric;
  _ot_amt numeric;
  _prev numeric;
  _old public.hr_payslips;
BEGIN
  SELECT * INTO r FROM public.hr_payroll_runs WHERE id = _run_id;
  SELECT * INTO e FROM public.hr_employees WHERE id = _employee_id;
  SELECT * INTO p FROM public.hr_employee_pay WHERE employee_id = _employee_id;
  IF p.employee_id IS NULL THEN
    INSERT INTO public.hr_employee_pay(employee_id) VALUES (_employee_id) RETURNING * INTO p;
  END IF;

  _m_start := r.period_month;
  _m_end := (r.period_month + interval '1 month' - interval '1 day')::date;

  SELECT count(*)::int INTO _m_work
  FROM generate_series(_m_start, _m_end, interval '1 day') g
  WHERE extract(dow FROM g)::smallint = ANY(e.work_days)
    AND NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.holiday_date = g::date);

  _sched_min := public.hr_sched_minutes(e.shift_start, e.shift_end, e.break_minutes);
  _hourly := CASE WHEN _m_work > 0 AND _sched_min > 0 THEN p.monthly_salary / _m_work / (_sched_min / 60.0) ELSE 0 END;
  _ot_rate := round(coalesce(p.ot_rate_per_hour, _hourly * p.ot_multiplier), 2);

  SELECT
    count(*) FILTER (WHERE a.day_type IN ('workday','leave_paid','leave_unpaid'))::int AS period_work,
    count(*) FILTER (WHERE a.day_type = 'workday' AND a.status IN ('present','late','working','on_break','upcoming','not_yet'))::int AS present,
    count(*) FILTER (WHERE a.late_min > 0)::int AS late_days,
    count(*) FILTER (WHERE a.status = 'absent')::int AS absent,
    count(*) FILTER (WHERE a.day_type = 'leave_paid')::int AS paid_leave,
    count(*) FILTER (WHERE a.day_type = 'leave_unpaid')::int AS unpaid_leave,
    count(*) FILTER (WHERE a.day_type = 'holiday')::int AS holidays,
    coalesce(sum(a.worked_min), 0)::int AS worked,
    coalesce(sum(a.ot_min), 0)::int AS ot
  INTO d
  FROM public.hr_attendance_days(r.period_from, r.period_to, _employee_id) a;

  _deduct := CASE WHEN p.absent_deduction THEN d.absent ELSE 0 END;
  _paid_days := greatest(0, d.period_work - _deduct - d.unpaid_leave);
  _earned := CASE WHEN _m_work > 0 THEN round(p.monthly_salary * _paid_days / _m_work, 2) ELSE 0 END;
  _absent_amt := CASE WHEN _m_work > 0 THEN round(p.monthly_salary * (_deduct + d.unpaid_leave) / _m_work, 2) ELSE 0 END;
  _ot_amt := CASE WHEN p.ot_enabled THEN round(d.ot / 60.0 * _ot_rate, 2) ELSE 0 END;

  SELECT coalesce(sum(ps.net_pay), 0) INTO _prev
  FROM public.hr_payslips ps JOIN public.hr_payroll_runs pr ON pr.id = ps.run_id
  WHERE ps.employee_id = _employee_id AND pr.period_month = r.period_month
    AND pr.status = 'paid' AND pr.id <> r.id;

  SELECT * INTO _old FROM public.hr_payslips WHERE run_id = _run_id AND employee_id = _employee_id;

  INSERT INTO public.hr_payslips AS ps (
    run_id, employee_id, employee_name, employee_code, brand_id, designation,
    monthly_salary, month_workdays, per_day_rate, ot_rate,
    period_workdays, present_days, late_days, absent_days, paid_leave_days, unpaid_leave_days, holiday_days,
    worked_minutes, ot_minutes, earned_basic, absent_amount, ot_amount,
    bonus, allowance, deduction, advance, previously_paid, net_pay, payment_method, payment_account, note)
  VALUES (
    _run_id, _employee_id, e.full_name, e.employee_code, e.brand_id, e.designation,
    p.monthly_salary, _m_work, CASE WHEN _m_work > 0 THEN round(p.monthly_salary / _m_work, 2) ELSE 0 END, _ot_rate,
    d.period_work, d.present, d.late_days, d.absent, d.paid_leave, d.unpaid_leave, d.holidays,
    d.worked, d.ot, _earned, _absent_amt, _ot_amt,
    coalesce(_old.bonus, 0), coalesce(_old.allowance, 0), coalesce(_old.deduction, 0), coalesce(_old.advance, 0),
    _prev,
    round(_earned + _ot_amt + coalesce(_old.bonus,0) + coalesce(_old.allowance,0)
          - coalesce(_old.deduction,0) - coalesce(_old.advance,0) - _prev, 0),
    p.payment_method, p.payment_account, _old.note)
  ON CONFLICT (run_id, employee_id) DO UPDATE SET
    employee_name = EXCLUDED.employee_name, employee_code = EXCLUDED.employee_code,
    brand_id = EXCLUDED.brand_id, designation = EXCLUDED.designation,
    monthly_salary = EXCLUDED.monthly_salary, month_workdays = EXCLUDED.month_workdays,
    per_day_rate = EXCLUDED.per_day_rate, ot_rate = EXCLUDED.ot_rate,
    period_workdays = EXCLUDED.period_workdays, present_days = EXCLUDED.present_days,
    late_days = EXCLUDED.late_days, absent_days = EXCLUDED.absent_days,
    paid_leave_days = EXCLUDED.paid_leave_days, unpaid_leave_days = EXCLUDED.unpaid_leave_days,
    holiday_days = EXCLUDED.holiday_days, worked_minutes = EXCLUDED.worked_minutes,
    ot_minutes = EXCLUDED.ot_minutes, earned_basic = EXCLUDED.earned_basic,
    absent_amount = EXCLUDED.absent_amount, ot_amount = EXCLUDED.ot_amount,
    previously_paid = EXCLUDED.previously_paid, net_pay = EXCLUDED.net_pay,
    payment_method = EXCLUDED.payment_method, payment_account = EXCLUDED.payment_account;
END $$;

CREATE OR REPLACE FUNCTION public.hr__refresh_run(_run_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.hr_payroll_runs r SET
    employee_count = (SELECT count(*) FROM public.hr_payslips WHERE run_id = r.id),
    total_net = (SELECT coalesce(sum(net_pay), 0) FROM public.hr_payslips WHERE run_id = r.id)
  WHERE r.id = _run_id;
$$;

CREATE OR REPLACE FUNCTION public.hr__fill_run(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.hr_payroll_runs; _e uuid;
BEGIN
  SELECT * INTO r FROM public.hr_payroll_runs WHERE id = _run_id;
  -- drop slips for people no longer in scope
  DELETE FROM public.hr_payslips ps USING public.hr_employees e
  WHERE ps.run_id = _run_id AND e.id = ps.employee_id
    AND NOT (e.join_date <= r.period_to AND (e.end_date IS NULL OR e.end_date >= r.period_from)
             AND (r.brand_id IS NULL OR e.brand_id = r.brand_id));
  FOR _e IN
    SELECT e.id FROM public.hr_employees e
    WHERE e.join_date <= r.period_to AND (e.end_date IS NULL OR e.end_date >= r.period_from)
      AND (r.brand_id IS NULL OR e.brand_id = r.brand_id)
      AND (e.status IN ('active','probation') OR e.end_date IS NOT NULL)
    ORDER BY e.full_name
  LOOP
    PERFORM public.hr__compute_payslip(_run_id, _e);
  END LOOP;
  PERFORM public.hr__refresh_run(_run_id);
END $$;

CREATE OR REPLACE FUNCTION public.hr_payroll_generate(_month date, _as_of date DEFAULT NULL, _brand_id uuid DEFAULT NULL, _title text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m date := date_trunc('month', _month)::date;
  _end date := (date_trunc('month', _month) + interval '1 month' - interval '1 day')::date;
  _to date;
  _id uuid;
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  _to := coalesce(_as_of, least(public.hr_today(), _end));
  IF _to < _m OR _to > _end THEN RAISE EXCEPTION 'Pay-until date must be inside the selected month'; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_payroll_runs WHERE period_month = _m AND status = 'draft'
             AND brand_id IS NOT DISTINCT FROM _brand_id) THEN
    RAISE EXCEPTION 'A draft payroll for this month already exists — open it or delete it first';
  END IF;
  INSERT INTO public.hr_payroll_runs(period_month, period_from, period_to, brand_id, title, created_by)
  VALUES (_m, _m, _to, _brand_id,
          coalesce(nullif(btrim(_title),''), to_char(_m, 'FMMonth YYYY') ||
                   CASE WHEN _to < _end THEN ' (until ' || to_char(_to, 'FMDD Mon') || ')' ELSE '' END),
          auth.uid())
  RETURNING id INTO _id;
  PERFORM public.hr__fill_run(_id);
  PERFORM public.hr_audit('hr_payroll_run', _id::text, 'generate', NULL,
    jsonb_build_object('month', _m, 'to', _to, 'brand_id', _brand_id));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.hr_payroll_recalculate(_run_id uuid, _as_of date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.hr_payroll_runs; _end date;
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  SELECT * INTO r FROM public.hr_payroll_runs WHERE id = _run_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payroll not found'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft payroll can be recalculated'; END IF;
  IF _as_of IS NOT NULL THEN
    _end := (r.period_month + interval '1 month' - interval '1 day')::date;
    IF _as_of < r.period_month OR _as_of > _end THEN RAISE EXCEPTION 'Pay-until date must be inside the month'; END IF;
    UPDATE public.hr_payroll_runs SET period_to = _as_of WHERE id = _run_id;
  END IF;
  PERFORM public.hr__fill_run(_run_id);
END $$;

CREATE OR REPLACE FUNCTION public.hr_payslip_update(_id uuid, _bonus numeric, _allowance numeric, _deduction numeric, _advance numeric, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _run uuid;
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  SELECT ps.run_id INTO _run FROM public.hr_payslips ps JOIN public.hr_payroll_runs r ON r.id = ps.run_id
  WHERE ps.id = _id AND r.status = 'draft';
  IF _run IS NULL THEN RAISE EXCEPTION 'Only payslips in a draft payroll can be edited'; END IF;
  UPDATE public.hr_payslips SET
    bonus = greatest(0, coalesce(_bonus, 0)), allowance = greatest(0, coalesce(_allowance, 0)),
    deduction = greatest(0, coalesce(_deduction, 0)), advance = greatest(0, coalesce(_advance, 0)),
    note = nullif(btrim(_note), ''),
    net_pay = round(earned_basic + ot_amount + greatest(0, coalesce(_bonus,0)) + greatest(0, coalesce(_allowance,0))
                    - greatest(0, coalesce(_deduction,0)) - greatest(0, coalesce(_advance,0)) - previously_paid, 0)
  WHERE id = _id;
  PERFORM public.hr__refresh_run(_run);
END $$;

CREATE OR REPLACE FUNCTION public.hr_payroll_set_status(_run_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.hr_payroll_runs;
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  SELECT * INTO r FROM public.hr_payroll_runs WHERE id = _run_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payroll not found'; END IF;
  IF _status = 'finalized' AND r.status = 'draft' THEN
    UPDATE public.hr_payroll_runs SET status = 'finalized', finalized_by = auth.uid(), finalized_at = now() WHERE id = _run_id;
  ELSIF _status = 'draft' AND r.status = 'finalized' THEN
    UPDATE public.hr_payroll_runs SET status = 'draft', finalized_by = NULL, finalized_at = NULL WHERE id = _run_id;
  ELSE
    RAISE EXCEPTION 'Cannot move payroll from % to %', r.status, _status;
  END IF;
  PERFORM public.hr_audit('hr_payroll_run', _run_id::text, _status, NULL, NULL);
END $$;

-- Mark a finalized payroll paid. Optionally posts one salary expense per brand to Finance,
-- all in one transaction.
CREATE OR REPLACE FUNCTION public.hr_payroll_pay(_run_id uuid, _account_id uuid, _paid_on date, _post_to_finance boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.hr_payroll_runs;
  g record;
  _cat uuid;
  _posted int := 0;
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  SELECT * INTO r FROM public.hr_payroll_runs WHERE id = _run_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payroll not found'; END IF;
  IF r.status <> 'finalized' THEN RAISE EXCEPTION 'Finalize the payroll before paying it'; END IF;
  IF _post_to_finance AND _account_id IS NULL THEN RAISE EXCEPTION 'Choose the account the salary is paid from'; END IF;

  IF _post_to_finance THEN
    FOR g IN
      SELECT ps.brand_id, sum(ps.net_pay) AS amt, count(*) AS n
      FROM public.hr_payslips ps WHERE ps.run_id = _run_id AND ps.net_pay > 0
      GROUP BY ps.brand_id
    LOOP
      _cat := NULL;
      SELECT c.id INTO _cat FROM public.erp_expense_categories c
      WHERE c.kind = 'expense' AND (c.name ILIKE '%salary%' OR c.name ILIKE '%payroll%')
        AND (c.brand_id = g.brand_id OR (g.brand_id IS NULL AND c.brand_id IS NULL))
      ORDER BY (c.brand_id IS NULL) LIMIT 1;
      IF _cat IS NULL THEN
        SELECT c.id INTO _cat FROM public.erp_expense_categories c
        WHERE c.kind = 'expense' AND c.brand_id IS NULL AND (c.name ILIKE '%salary%' OR c.name ILIKE '%payroll%') LIMIT 1;
      END IF;
      INSERT INTO public.erp_transactions(brand_id, txn_type, category_id, account_id, amount, reference_type, reference_id,
                                          description, transaction_date, created_by)
      VALUES (g.brand_id, 'expense', _cat, _account_id, g.amt, 'hr_payroll', _run_id,
              'Salary — ' || coalesce(r.title, to_char(r.period_month, 'FMMonth YYYY')) || ' (' || g.n || ' staff)',
              coalesce(_paid_on, public.hr_today()), auth.uid());
      _posted := _posted + 1;
    END LOOP;
  END IF;

  UPDATE public.hr_payroll_runs SET status = 'paid', paid_by = auth.uid(), paid_at = now(),
    paid_on = coalesce(_paid_on, public.hr_today()), payout_account_id = _account_id
  WHERE id = _run_id;
  PERFORM public.hr_audit('hr_payroll_run', _run_id::text, 'paid', NULL,
    jsonb_build_object('account_id', _account_id, 'paid_on', _paid_on, 'posted', _posted, 'total', r.total_net));
  RETURN jsonb_build_object('posted', _posted, 'total', r.total_net);
END $$;

CREATE OR REPLACE FUNCTION public.hr_payroll_delete(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.hr_can_pay() THEN RAISE EXCEPTION 'Payroll access required'; END IF;
  DELETE FROM public.hr_payroll_runs WHERE id = _run_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft payroll can be deleted'; END IF;
  PERFORM public.hr_audit('hr_payroll_run', _run_id::text, 'delete', NULL, NULL);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.hr_payroll_generate(date,date,uuid,text)',
    'public.hr_payroll_recalculate(uuid,date)',
    'public.hr_payslip_update(uuid,numeric,numeric,numeric,numeric,text)',
    'public.hr_payroll_set_status(uuid,text)',
    'public.hr_payroll_pay(uuid,uuid,date,boolean)',
    'public.hr_payroll_delete(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.hr__compute_payslip(uuid,uuid)', 'public.hr__refresh_run(uuid)', 'public.hr__fill_run(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f);
  END LOOP;
END $$;
