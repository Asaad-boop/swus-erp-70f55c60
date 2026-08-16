ALTER TABLE public.hr_employees
  ADD CONSTRAINT hr_employees_user_id_key UNIQUE (user_id);

GRANT SELECT ON public.staff_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_brand_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_brand_access TO authenticated;
GRANT ALL ON public.user_brand_access TO service_role;

UPDATE public.staff_permissions
SET permissions = jsonb_build_object(
  'version', 2,
  'pageMode', CASE
    WHEN jsonb_array_length(COALESCE(permissions->'allowedPages', '[]'::jsonb)) > 0 THEN 'custom'
    ELSE 'role_default'
  END,
  'allowedPages', COALESCE((
    SELECT jsonb_agg(page)
    FROM jsonb_array_elements_text(COALESCE(permissions->'allowedPages', '[]'::jsonb)) AS page
    WHERE page IN (
      '/erp','/erp/orders/dashboard','/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new',
      '/erp/products','/erp/inventory','/erp/reorder-queue','/erp/purchase-orders','/erp/stocktake','/erp/courier','/erp/dispatch','/erp/returns','/erp/reconciliation','/erp/reports','/erp/suppliers','/erp/imports','/erp/sourcing',
      '/erp/finance','/erp/finance/accounts','/erp/finance/journal','/erp/finance/receivables','/erp/finance/dollar-purchase','/erp/finance/reports','/erp/finance/settings',
      '/erp/growth','/erp/growth/goals','/erp/growth/tasks','/erp/growth/routines','/erp/growth/planning','/erp/growth/intake','/erp/growth/pipeline','/erp/growth/media-plans','/erp/growth/creators','/erp/growth/agencies','/erp/growth/matching','/erp/growth/products','/erp/growth/rivals','/erp/growth/report','/erp/extension',
      '/erp/marketing','/erp/marketing/campaigns','/erp/marketing/creatives','/erp/marketing/attribution','/erp/marketing/products','/erp/marketing/planning','/erp/marketing/alerts','/erp/marketing/daily','/erp/marketing/channels','/erp/marketing/reports','/erp/marketing/settings',
      '/erp/crm','/erp/users','/erp/analytics','/erp/analytics/live','/erp/hr','/erp/hr/live','/erp/hr/my-attendance','/erp/hr/employees','/erp/hr/attendance','/erp/hr/leaves','/erp/hr/payroll','/erp/hr/performance','/erp/hr/access','/erp/hr/settings','/erp/settings','/erp/diagnostics','/erp/deploy-sync',
      '/erp/orders/incomplete-reports','/erp/inventory-reports','/erp/finance/wallets','/erp/finance/chart-accounts','/erp/finance/budgets','/erp/finance/taxes','/erp/finance/product-profitability','/erp/imports/orders','/erp/imports/agents','/erp/imports/reports','/erp/imports/settings','/erp/hub','/erp/content','/erp/pathao-debug'
    )
  ), '[]'::jsonb),
  'brandMode', CASE
    WHEN EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = staff_permissions.user_id) THEN 'selected'
    ELSE 'all'
  END
), updated_at = now();

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT uba.user_id, 'employee'::public.app_role
FROM public.user_brand_access uba
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = uba.user_id AND ur.role <> 'customer'::public.app_role
)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.staff_permissions (user_id, permissions, updated_at)
SELECT ur.user_id,
  jsonb_build_object(
    'version', 2,
    'pageMode', 'role_default',
    'allowedPages', '[]'::jsonb,
    'brandMode', CASE WHEN EXISTS (
      SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = ur.user_id
    ) THEN 'selected' ELSE 'all' END
  ),
  now()
FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role <> 'customer'::public.app_role) ur
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_brand_access(_brand_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _brand_id IS NULL
    OR public.has_role(_user_id, 'admin'::app_role)
    OR COALESCE((
      SELECT sp.permissions->>'brandMode' = 'all'
      FROM public.staff_permissions sp
      WHERE sp.user_id = _user_id
    ), false)
    OR EXISTS (
      SELECT 1 FROM public.user_brand_access
      WHERE user_id = _user_id AND brand_id = _brand_id
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_access_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'userId', auth.uid(),
    'roles', COALESCE((SELECT jsonb_agg(ur.role::text ORDER BY ur.role::text) FROM public.user_roles ur WHERE ur.user_id = auth.uid()), '[]'::jsonb),
    'pageMode', COALESCE(sp.permissions->>'pageMode', CASE WHEN jsonb_array_length(COALESCE(sp.permissions->'allowedPages','[]'::jsonb)) > 0 THEN 'custom' ELSE 'role_default' END),
    'allowedPages', COALESCE(sp.permissions->'allowedPages', '[]'::jsonb),
    'brandMode', COALESCE(sp.permissions->>'brandMode', CASE WHEN EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id=auth.uid()) THEN 'selected' ELSE 'all' END),
    'brandIds', COALESCE((SELECT jsonb_agg(uba.brand_id::text ORDER BY uba.brand_id::text) FROM public.user_brand_access uba WHERE uba.user_id=auth.uid()), '[]'::jsonb),
    'accessVersion', COALESCE((sp.permissions->>'version')::int, 1),
    'updatedAt', sp.updated_at
  )
  FROM (SELECT 1) seed
  LEFT JOIN public.staff_permissions sp ON sp.user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_access_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access_profile() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_access_profile() FROM anon;

CREATE OR REPLACE FUNCTION public.admin_replace_access_profile(
  _target_user_id uuid,
  _roles public.app_role[],
  _brand_mode text,
  _brand_ids uuid[],
  _page_mode text,
  _allowed_pages text[],
  _employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF _employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_employees WHERE id = _employee_id) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT jsonb_build_object(
    'roles', COALESCE((SELECT jsonb_agg(role::text ORDER BY role::text) FROM public.user_roles WHERE user_id=_target_user_id),'[]'::jsonb),
    'brandIds', COALESCE((SELECT jsonb_agg(brand_id::text ORDER BY brand_id::text) FROM public.user_brand_access WHERE user_id=_target_user_id),'[]'::jsonb),
    'permissions', (SELECT permissions FROM public.staff_permissions WHERE user_id=_target_user_id),
    'employeeId', (SELECT id::text FROM public.hr_employees WHERE user_id=_target_user_id)
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

  UPDATE public.hr_employees SET user_id=NULL WHERE user_id=_target_user_id AND (_employee_id IS NULL OR id<>_employee_id);
  IF _employee_id IS NOT NULL THEN
    UPDATE public.hr_employees SET user_id=NULL WHERE id<>_employee_id AND user_id=_target_user_id;
    UPDATE public.hr_employees SET user_id=_target_user_id WHERE id=_employee_id;
  END IF;

  _after := jsonb_build_object(
    'roles', to_jsonb(_roles),
    'brandMode', _brand_mode,
    'brandIds', to_jsonb(_brand_ids),
    'pageMode', _page_mode,
    'allowedPages', CASE WHEN _page_mode='custom' THEN to_jsonb(_allowed_pages) ELSE '[]'::jsonb END,
    'employeeId', _employee_id
  );
  INSERT INTO public.admin_audit_log(user_id, entity_type, entity_id, action, before_data, after_data, metadata)
  VALUES (_actor, 'access_profile', _target_user_id::text, 'replace', _before, _after, jsonb_build_object('source','users_access_workspace'));
  RETURN _after;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_replace_access_profile(uuid, public.app_role[], text, uuid[], text, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_access_profile(uuid, public.app_role[], text, uuid[], text, text[], uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_replace_access_profile(uuid, public.app_role[], text, uuid[], text, text[], uuid) FROM anon;