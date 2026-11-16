-- HRM removal, step 1 of 2: decouple access + reports from hr_* tables.
-- Safe to run while the old app is still deployed (function signatures unchanged).

-- 1) Access profile writer: keep the 7-arg signature (old clients still pass
--    _employee_id) but ignore it — there is no employee table any more.
CREATE OR REPLACE FUNCTION public.admin_replace_access_profile(_target_user_id uuid, _roles app_role[], _brand_mode text, _brand_ids uuid[], _page_mode text, _allowed_pages text[], _employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _before jsonb;
  _after jsonb;
  _admin_count integer;
  _valid_brand_count integer;
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF COALESCE(array_length(_roles, 1), 0) = 0 OR _roles <@ ARRAY['customer']::public.app_role[] THEN
    RAISE EXCEPTION 'At least one staff role is required';
  END IF;
  IF _brand_mode NOT IN ('all', 'selected') THEN
    RAISE EXCEPTION 'Invalid brand mode';
  END IF;
  IF _brand_mode = 'selected' AND COALESCE(array_length(_brand_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one brand';
  END IF;
  IF _page_mode NOT IN ('role_default', 'custom') THEN
    RAISE EXCEPTION 'Invalid page mode';
  END IF;
  IF _page_mode = 'custom' AND COALESCE(array_length(_allowed_pages, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one page';
  END IF;
  IF _brand_mode = 'selected' THEN
    SELECT count(*) INTO _valid_brand_count FROM public.brands WHERE id = ANY(_brand_ids) AND is_active;
    IF _valid_brand_count <> cardinality(_brand_ids) THEN
      RAISE EXCEPTION 'One or more brands are invalid or inactive';
    END IF;
  END IF;
  IF _target_user_id = _actor AND NOT ('admin'::public.app_role = ANY(_roles)) THEN
    RAISE EXCEPTION 'Cannot remove your own admin role';
  END IF;
  IF public.has_role(_target_user_id, 'admin'::public.app_role) AND NOT ('admin'::public.app_role = ANY(_roles)) THEN
    SELECT count(DISTINCT user_id) INTO _admin_count FROM public.user_roles WHERE role = 'admin'::public.app_role;
    IF _admin_count <= 1 THEN RAISE EXCEPTION 'Cannot remove the last admin'; END IF;
  END IF;

  SELECT jsonb_build_object(
    'roles', COALESCE((SELECT jsonb_agg(role::text ORDER BY role::text) FROM public.user_roles WHERE user_id=_target_user_id),'[]'::jsonb),
    'brandIds', COALESCE((SELECT jsonb_agg(brand_id::text ORDER BY brand_id::text) FROM public.user_brand_access WHERE user_id=_target_user_id),'[]'::jsonb),
    'permissions', (SELECT permissions FROM public.staff_permissions WHERE user_id=_target_user_id)
  ) INTO _before;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles(user_id, role)
    SELECT _target_user_id, role FROM unnest(_roles) role;

  DELETE FROM public.user_brand_access WHERE user_id = _target_user_id;
  IF _brand_mode = 'selected' THEN
    INSERT INTO public.user_brand_access(user_id, brand_id, created_by)
      SELECT _target_user_id, brand_id, _actor FROM unnest(_brand_ids) brand_id;
  END IF;

  INSERT INTO public.staff_permissions(user_id, permissions, updated_by, updated_at)
  VALUES (_target_user_id, jsonb_build_object(
    'version', 2,
    'pageMode', _page_mode,
    'allowedPages', CASE WHEN _page_mode='custom' THEN to_jsonb(_allowed_pages) ELSE '[]'::jsonb END,
    'brandMode', _brand_mode
  ), _actor, now())
  ON CONFLICT (user_id) DO UPDATE SET
    permissions=EXCLUDED.permissions, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at;

  _after := jsonb_build_object(
    'roles', to_jsonb(_roles),
    'brandMode', _brand_mode,
    'brandIds', to_jsonb(_brand_ids),
    'pageMode', _page_mode,
    'allowedPages', CASE WHEN _page_mode='custom' THEN to_jsonb(_allowed_pages) ELSE '[]'::jsonb END
  );
  INSERT INTO public.admin_audit_log(user_id, entity_type, entity_id, action, before_data, after_data, metadata)
  VALUES (_actor, 'access_profile', _target_user_id::text, 'replace', _before, _after, jsonb_build_object('source','users_access_workspace'));
  RETURN _after;
END;
$function$;

-- 2) Team performance report: names from profiles only.
CREATE OR REPLACE FUNCTION public.rpt_team_performance(_brand_ids uuid[], _from date, _to date)
 RETURNS TABLE(user_id uuid, person text, confirmed bigint, packed bigint, shipped bigint, cancelled bigint, delivered bigint, total_actions bigint, avg_pack_minutes numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH h AS (
    SELECT sh.changed_by, sh.to_status, sh.order_id, sh.created_at
    FROM public.order_status_history sh
    JOIN public.orders o ON o.id = sh.order_id
    WHERE o.brand_id = ANY(_brand_ids)
      AND sh.changed_by IS NOT NULL
      AND (sh.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  pack AS (
    SELECT sh.order_id, sh.changed_by,
           EXTRACT(EPOCH FROM (sh.created_at - o.created_at))/60 AS mins
    FROM public.order_status_history sh
    JOIN public.orders o ON o.id = sh.order_id
    WHERE o.brand_id = ANY(_brand_ids) AND sh.to_status = 'packed'
      AND sh.changed_by IS NOT NULL
      AND (sh.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  )
  SELECT h.changed_by,
         COALESCE(pr.display_name, pr.username, 'Unknown user'),
         COUNT(*) FILTER (WHERE h.to_status = 'confirmed')::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('packed','ready_to_ship'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('shipped','in_transit'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('cancelled','fake'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status = 'delivered')::bigint,
         COUNT(*)::bigint,
         ROUND(COALESCE((SELECT AVG(mins) FROM pack WHERE pack.changed_by = h.changed_by), 0)::numeric, 1)
  FROM h
  LEFT JOIN public.profiles pr ON pr.id = h.changed_by
  GROUP BY h.changed_by, pr.display_name, pr.username
  ORDER BY 8 DESC;
$function$;

-- 3) Drop granted HR pages from custom page lists (all other grants untouched).
UPDATE public.staff_permissions sp
SET permissions = jsonb_set(
      sp.permissions, '{allowedPages}',
      COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements_text(sp.permissions->'allowedPages') p
                WHERE p NOT LIKE '/erp/hr%'), '[]'::jsonb)),
    updated_at = now()
WHERE sp.permissions->'allowedPages' @? '$[*] ? (@ starts with "/erp/hr")';
