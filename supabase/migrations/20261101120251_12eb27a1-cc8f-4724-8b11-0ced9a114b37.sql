CREATE OR REPLACE FUNCTION public.hr_decide_leave(_leave_id uuid, _status text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; offs int[]; d date;
BEGIN
  IF NOT public.has_hr_access(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _status NOT IN ('approved','rejected','cancelled','pending') THEN RAISE EXCEPTION 'Bad status'; END IF;
  SELECT * INTO l FROM hr_leaves WHERE id = _leave_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave not found'; END IF;
  UPDATE hr_leaves SET status=_status, decided_at=now(), decided_by=auth.uid(),
    decision_note=COALESCE(_note, decision_note), updated_at=now() WHERE id=_leave_id;
  IF _status = 'approved' THEN
    SELECT COALESCE(week_offs, '{}')::int[] INTO offs FROM hr_employees WHERE id = l.employee_id;
    FOR d IN SELECT generate_series(l.start_date, l.end_date, interval '1 day')::date LOOP
      CONTINUE WHEN EXTRACT(DOW FROM d)::int = ANY(COALESCE(offs,'{}'));
      UPDATE hr_attendance SET status='leave' WHERE employee_id=l.employee_id AND work_date=d;
      IF NOT FOUND THEN
        INSERT INTO hr_attendance(employee_id, work_date, status) VALUES (l.employee_id, d, 'leave');
      END IF;
    END LOOP;
  ELSE
    DELETE FROM hr_attendance WHERE employee_id=l.employee_id AND status='leave'
      AND work_date BETWEEN l.start_date AND l.end_date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_decide_leave(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_decide_leave(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_cancel_my_leave(_leave_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE hr_leaves l SET status='cancelled', updated_at=now()
  WHERE l.id=_leave_id AND l.status='pending'
    AND EXISTS (SELECT 1 FROM hr_employees e WHERE e.id=l.employee_id AND e.user_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your own pending leave can be cancelled'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_cancel_my_leave(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_cancel_my_leave(uuid) TO authenticated;