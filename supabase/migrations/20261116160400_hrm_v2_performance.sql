-- HRM v2 — part 5: who did what. Order work comes from order_status_history.changed_by;
-- scans are the transitions the scan module tags with reason = 'scan'.

CREATE OR REPLACE FUNCTION public.hr_staff_performance(_from date, _to date)
RETURNS TABLE(
  user_id uuid, employee_id uuid, name text, designation text,
  present_days int, late_days int, absent_days int, worked_min int, ot_min int,
  confirmed int, cancelled int, packing int, packed int, ready_to_ship int, shipped int,
  returned int, scans int, total_actions int, actions_per_hour numeric,
  first_action timestamptz, last_action timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _mgr boolean := public.hr_is_manager();
BEGIN
  IF _to < _from OR _to - _from > 92 THEN RAISE EXCEPTION 'Date range must be 1–93 days'; END IF;
  RETURN QUERY
  WITH acts AS (
    SELECT h.changed_by AS uid,
      count(*) FILTER (WHERE h.to_status = 'confirmed')::int AS c_conf,
      count(*) FILTER (WHERE h.to_status IN ('cancelled','fake'))::int AS c_canc,
      count(*) FILTER (WHERE h.to_status = 'packaging')::int AS c_pkg,
      count(*) FILTER (WHERE h.to_status = 'packed')::int AS c_packed,
      count(*) FILTER (WHERE h.to_status = 'ready_to_ship')::int AS c_rts,
      count(*) FILTER (WHERE h.to_status IN ('shipped','in_transit'))::int AS c_ship,
      count(*) FILTER (WHERE h.to_status IN ('returned','partial_return'))::int AS c_ret,
      count(*) FILTER (WHERE h.reason = 'scan')::int AS c_scan,
      count(*)::int AS c_all,
      min(h.created_at) AS f_act, max(h.created_at) AS l_act
    FROM public.order_status_history h
    WHERE h.changed_by IS NOT NULL
      AND h.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND h.created_at <  ((_to + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    GROUP BY h.changed_by
  ),
  att AS (
    SELECT a.employee_id AS eid,
      count(*) FILTER (WHERE a.status IN ('present','late','working','on_break'))::int AS p_days,
      count(*) FILTER (WHERE a.late_min > 0)::int AS l_days,
      count(*) FILTER (WHERE a.status = 'absent')::int AS a_days,
      coalesce(sum(a.worked_min), 0)::int AS w_min,
      coalesce(sum(a.ot_min), 0)::int AS o_min
    FROM public.hr_attendance_days(_from, _to, NULL) a
    GROUP BY a.employee_id
  ),
  people AS (
    SELECT e.user_id AS uid, e.id AS eid, e.full_name AS nm, e.designation AS des
    FROM public.hr_employees e
    WHERE e.status IN ('active','probation') OR e.end_date >= _from
    UNION
    SELECT a.uid, NULL::uuid, coalesce(p.display_name, p.username, 'Unknown user'), NULL::text
    FROM acts a LEFT JOIN public.profiles p ON p.id = a.uid
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = a.uid)
  )
  SELECT pp.uid, pp.eid, pp.nm, pp.des,
    coalesce(t.p_days, 0), coalesce(t.l_days, 0), coalesce(t.a_days, 0), coalesce(t.w_min, 0), coalesce(t.o_min, 0),
    coalesce(a.c_conf, 0), coalesce(a.c_canc, 0), coalesce(a.c_pkg, 0), coalesce(a.c_packed, 0),
    coalesce(a.c_rts, 0), coalesce(a.c_ship, 0), coalesce(a.c_ret, 0), coalesce(a.c_scan, 0), coalesce(a.c_all, 0),
    CASE WHEN coalesce(t.w_min, 0) >= 30 THEN round(coalesce(a.c_all, 0) / (t.w_min / 60.0), 1) END,
    a.f_act, a.l_act
  FROM people pp
  LEFT JOIN acts a ON a.uid = pp.uid
  LEFT JOIN att t ON t.eid = pp.eid
  WHERE _mgr OR pp.uid = auth.uid()
  ORDER BY coalesce(a.c_all, 0) DESC, pp.nm;
END $$;

-- Timeline of order actions (optionally one person). Managers see all; staff see their own.
CREATE OR REPLACE FUNCTION public.hr_activity_feed(_from timestamptz, _to timestamptz, _user_id uuid DEFAULT NULL, _limit int DEFAULT 200)
RETURNS TABLE(at timestamptz, user_id uuid, name text, order_id uuid, invoice_no text,
              from_status text, to_status text, via text, brand_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _mgr boolean := public.hr_is_manager();
BEGIN
  RETURN QUERY
  SELECT h.created_at, h.changed_by,
         coalesce(e.full_name, p.display_name, p.username, 'Unknown user'),
         h.order_id, o.invoice_no, h.from_status, h.to_status,
         CASE WHEN h.reason = 'scan' THEN 'scan' ELSE 'manual' END,
         o.brand_id
  FROM public.order_status_history h
  JOIN public.orders o ON o.id = h.order_id
  LEFT JOIN public.hr_employees e ON e.user_id = h.changed_by
  LEFT JOIN public.profiles p ON p.id = h.changed_by
  WHERE h.changed_by IS NOT NULL
    AND h.created_at >= _from AND h.created_at < _to
    AND (_user_id IS NULL OR h.changed_by = _user_id)
    AND (_mgr OR h.changed_by = auth.uid())
  ORDER BY h.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 200), 1), 1000);
END $$;

REVOKE EXECUTE ON FUNCTION public.hr_staff_performance(date,date) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.hr_activity_feed(timestamptz,timestamptz,uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_performance(date,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_activity_feed(timestamptz,timestamptz,uuid,int) TO authenticated, service_role;
