-- Order journey: who created the order, who changed each status, who booked the
-- courier, with staff names and roles resolved server-side (many staff cannot
-- read other people's profiles or the activity log directly).

CREATE OR REPLACE FUNCTION public.staff_label(_uid uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _uid IS NULL THEN NULL ELSE jsonb_build_object(
    'id', _uid,
    'name', coalesce(
      (SELECT nullif(trim(e.full_name), '') FROM public.hr_employees e WHERE e.user_id = _uid LIMIT 1),
      (SELECT nullif(trim(p.display_name), '') FROM public.profiles p WHERE p.id = _uid),
      (SELECT split_part(u.email, '@', 1) FROM auth.users u WHERE u.id = _uid),
      'Staff'),
    'role', (SELECT r.role::text FROM public.user_roles r WHERE r.user_id = _uid
             ORDER BY array_position(ARRAY['owner','admin','operations','customer_service','moderator',
               'warehouse_staff','packer','accountant','marketing_manager','hr_admin','hr_manager']::text[], r.role::text)
             NULLS LAST LIMIT 1)
  ) END
$$;
REVOKE ALL ON FUNCTION public.staff_label(uuid) FROM public, anon;

CREATE OR REPLACE FUNCTION public.order_journey(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  uid uuid := auth.uid();
  _created_by uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Same people who can open the order.
  IF NOT (
    has_role(uid, 'admin') OR has_role(uid, 'owner') OR has_role(uid, 'operations')
    OR has_role(uid, 'customer_service') OR has_role(uid, 'moderator')
    OR public.hr_is_manager()
    OR private.staff_has_explicit_page(uid, ARRAY['/erp/orders/web','/erp/orders/list','/erp/orders/pre-orders','/erp/orders/new'], o.brand_id)
    OR public.pack_can_use(o.brand_id)
    OR o.user_id = uid
  ) THEN
    RAISE EXCEPTION 'You cannot view this order';
  END IF;

  SELECT a.performed_by INTO _created_by
  FROM public.activity_log a
  WHERE a.entity_type = 'order' AND a.entity_id = o.id AND a.action = 'ORDER_CREATED'
  ORDER BY a.performed_at LIMIT 1;

  RETURN jsonb_build_object(
    'created', jsonb_build_object(
      'at', o.created_at,
      'source', o.source,
      'guest', o.is_guest_order,
      'by', public.staff_label(_created_by)
    ),
    'confirmed_by', public.staff_label(o.confirmed_by),
    'confirmed_at', o.confirmed_at,
    'events', coalesce((
      SELECT jsonb_agg(ev ORDER BY (ev->>'at')::timestamptz)
      FROM (
        SELECT jsonb_build_object(
          'id', 'h-' || h.id, 'kind', 'status', 'at', h.created_at,
          'from', h.from_status, 'to', h.to_status, 'reason', h.reason, 'note', h.note,
          'by', public.staff_label(h.changed_by)) ev
        FROM public.order_status_history h WHERE h.order_id = o.id
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'c-' || s.id, 'kind', 'courier', 'at', s.created_at,
          'provider', s.provider, 'consignment', coalesce(s.consignment_id, s.tracking_code),
          'by', public.staff_label(s.created_by)) ev
        FROM public.courier_shipments s WHERE s.order_id = o.id
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'l-' || a.id, 'kind', 'log', 'at', a.performed_at,
          'action', a.action, 'details', a.details,
          'by', public.staff_label(a.performed_by)) ev
        FROM public.activity_log a
        WHERE a.entity_type = 'order' AND a.entity_id = o.id
          AND a.action IN ('CALL_LOGGED','CONFIRMATION_CHANGED','WEB_STATUS_CHANGED','NOTE_ADDED','ORDER_ASSIGNED')
      ) x
    ), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.order_journey(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.order_journey(uuid) TO authenticated;
