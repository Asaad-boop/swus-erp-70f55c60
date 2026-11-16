-- Packing Station: packers see the packing queue and move orders only along
-- confirmed → packaging → packed → ready_to_ship by scanning. Nothing else.
-- Reads/writes go through these SECURITY DEFINER functions, so packers need
-- no SELECT/UPDATE rights on orders.

CREATE OR REPLACE FUNCTION public.pack_can_use(_brand uuid DEFAULT NULL, _uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('owner','admin'))
    OR (
      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('operations','warehouse_staff','packer'))
       OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id = _uid
                  AND sp.permissions->>'pageMode' = 'custom'
                  AND coalesce(sp.permissions->'allowedPages','[]'::jsonb) ? '/erp/packing'))
      AND (_brand IS NULL OR public.has_brand_access(_brand, _uid))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.pack__row(o public.orders)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', o.id, 'invoice_no', o.invoice_no, 'status', o.status, 'brand_id', o.brand_id,
    'customer', coalesce(nullif(o.shipping_name,''), o.guest_name),
    'area', concat_ws(', ', nullif(o.shipping_thana,''), nullif(o.shipping_district,'')),
    'courier', o.courier_name, 'tracking', o.tracking_number,
    'note', coalesce(nullif(o.shipping_note,''), nullif(o.customer_note,'')),
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'name', i.name, 'variant', i.variant_label, 'qty', i.quantity, 'image', i.image) ORDER BY i.created_at)
              FROM public.order_items i WHERE i.order_id = o.id AND coalesce(i.is_combo_child, false) = false), '[]'::jsonb),
    'item_count', coalesce((SELECT sum(i.quantity) FROM public.order_items i
                            WHERE i.order_id = o.id AND coalesce(i.is_combo_child, false) = false), 0),
    'last_by', (SELECT coalesce(e.full_name, p.display_name) FROM public.order_status_history h
                LEFT JOIN public.hr_employees e ON e.user_id = h.changed_by
                LEFT JOIN public.profiles p ON p.id = h.changed_by
                WHERE h.order_id = o.id AND h.changed_by IS NOT NULL ORDER BY h.created_at DESC LIMIT 1)
  );
$$;

-- Packing queue for the caller's brands.
CREATE OR REPLACE FUNCTION public.pack_queue(_brand_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pack_can_use() THEN RAISE EXCEPTION 'Packing access required'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.pack__row(o) ORDER BY o.created_at)
    FROM (
      SELECT * FROM public.orders o
      WHERE o.status IN ('confirmed','ready_to_pack','packaging','packed','ready_to_ship')
        AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids))
        AND public.pack_can_use(o.brand_id)
      ORDER BY o.created_at
      LIMIT 400
    ) o
  ), '[]'::jsonb);
END $$;

-- Find an order by scanned code: exact invoice / tracking, else invoice ending with the code.
CREATE OR REPLACE FUNCTION public.pack_lookup(_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c text := btrim(coalesce(_code, ''));
BEGIN
  IF NOT public.pack_can_use() THEN RAISE EXCEPTION 'Packing access required'; END IF;
  IF length(_c) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.pack__row(o))
    FROM (
      SELECT * FROM public.orders o
      WHERE (o.invoice_no = _c OR o.tracking_number = _c OR o.id::text = _c
             OR (length(_c) >= 4 AND o.invoice_no ILIKE '%' || _c))
        AND public.pack_can_use(o.brand_id)
      ORDER BY (o.invoice_no = _c OR o.tracking_number = _c) DESC, o.created_at DESC
      LIMIT 5
    ) o
  ), '[]'::jsonb);
END $$;

-- Move one step. _mode: auto | pack | packed | ready
CREATE OR REPLACE FUNCTION public.pack_scan(_order_id uuid, _mode text DEFAULT 'auto')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  _to public.order_status;
  _from public.order_status;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.pack_can_use(o.brand_id) THEN RAISE EXCEPTION 'You cannot pack orders of this brand'; END IF;
  _from := o.status;

  _to := CASE
    WHEN _mode = 'pack'   AND _from IN ('confirmed','ready_to_pack') THEN 'packaging'
    WHEN _mode = 'packed' AND _from IN ('confirmed','ready_to_pack','packaging') THEN 'packed'
    WHEN _mode = 'ready'  AND _from IN ('packed') THEN 'ready_to_ship'
    WHEN _mode = 'auto' AND _from IN ('confirmed','ready_to_pack') THEN 'packaging'
    WHEN _mode = 'auto' AND _from = 'packaging' THEN 'packed'
    WHEN _mode = 'auto' AND _from = 'packed' THEN 'ready_to_ship'
    ELSE NULL
  END::public.order_status;

  IF _to IS NULL THEN
    RAISE EXCEPTION '% এখন "%" — এই scan-এ বদলানো যাবে না', coalesce(o.invoice_no, left(o.id::text, 8)), _from;
  END IF;

  UPDATE public.orders SET
    status = _to,
    updated_at = now(),
    packaged_at = CASE WHEN _to = 'packed' THEN now() ELSE packaged_at END,
    packaged_by = CASE WHEN _to = 'packed' THEN auth.uid() ELSE packaged_by END
  WHERE id = o.id;
  INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by, reason, note)
  VALUES (o.id, _from::text, _to::text, auth.uid(), 'scan', 'packing station');

  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  RETURN public.pack__row(o) || jsonb_build_object('from_status', _from);
END $$;

-- Undo my own last scan on an order (within 15 minutes, if nobody moved it since).
CREATE OR REPLACE FUNCTION public.pack_undo(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  h public.order_status_history;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.pack_can_use(o.brand_id) THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO h FROM public.order_status_history WHERE order_id = _order_id ORDER BY created_at DESC LIMIT 1;
  IF h.id IS NULL OR h.changed_by IS DISTINCT FROM auth.uid() OR h.reason <> 'scan'
     OR h.created_at < now() - interval '15 minutes' OR h.to_status <> o.status::text THEN
    RAISE EXCEPTION 'Only your own scan from the last 15 minutes can be undone';
  END IF;
  UPDATE public.orders SET
    status = h.from_status::public.order_status, updated_at = now(),
    packaged_at = CASE WHEN h.to_status = 'packed' THEN NULL ELSE packaged_at END,
    packaged_by = CASE WHEN h.to_status = 'packed' THEN NULL ELSE packaged_by END
  WHERE id = o.id;
  INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by, reason, note)
  VALUES (o.id, h.to_status, h.from_status, auth.uid(), 'scan_undo', 'packing station undo');
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  RETURN public.pack__row(o);
END $$;

-- Today's counters for the packing desk (queue + my own scans).
CREATE OR REPLACE FUNCTION public.pack_my_stats(_brand_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _start timestamptz := (public.hr_today()::timestamp AT TIME ZONE 'Asia/Dhaka');
BEGIN
  IF NOT public.pack_can_use() THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'to_pack', (SELECT count(*) FROM public.orders o WHERE o.status IN ('confirmed','ready_to_pack')
                AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids)) AND public.pack_can_use(o.brand_id)),
    'packing', (SELECT count(*) FROM public.orders o WHERE o.status = 'packaging'
                AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids)) AND public.pack_can_use(o.brand_id)),
    'packed', (SELECT count(*) FROM public.orders o WHERE o.status = 'packed'
               AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids)) AND public.pack_can_use(o.brand_id)),
    'ready', (SELECT count(*) FROM public.orders o WHERE o.status = 'ready_to_ship'
              AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids)) AND public.pack_can_use(o.brand_id)),
    'my_packed_today', (SELECT count(*) FROM public.order_status_history h
                        WHERE h.changed_by = auth.uid() AND h.to_status = 'packed' AND h.created_at >= _start),
    'my_scans_today', (SELECT count(*) FROM public.order_status_history h
                       WHERE h.changed_by = auth.uid() AND h.reason = 'scan' AND h.created_at >= _start)
  );
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.pack_can_use(uuid,uuid)', 'public.pack_queue(uuid[])', 'public.pack_lookup(text)',
    'public.pack_scan(uuid,text)', 'public.pack_undo(uuid)', 'public.pack_my_stats(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.pack__row(public.orders) FROM public, anon, authenticated';
END $$;
