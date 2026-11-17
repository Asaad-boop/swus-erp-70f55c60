-- Packing Station follows the order list: newest first, and the stages match
-- the list tabs — Pending = confirmed, Packing = packaging + ready_to_pack,
-- Packed = packed, RTS = ready_to_ship.

CREATE OR REPLACE FUNCTION public.pack_queue(_brand_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pack_can_use() THEN RAISE EXCEPTION 'Packing access required'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.pack__row(o) ORDER BY o.created_at DESC)
    FROM (
      SELECT * FROM public.orders o
      WHERE o.status IN ('confirmed','ready_to_pack','packaging','packed','ready_to_ship')
        AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids))
        AND public.pack_can_use(o.brand_id)
      ORDER BY o.created_at DESC
      LIMIT 400
    ) o
  ), '[]'::jsonb);
END $$;

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
    WHEN _mode = 'pack'   AND _from = 'confirmed' THEN 'packaging'
    WHEN _mode = 'packed' AND _from IN ('confirmed','ready_to_pack','packaging') THEN 'packed'
    WHEN _mode = 'ready'  AND _from = 'packed' THEN 'ready_to_ship'
    WHEN _mode = 'auto' AND _from = 'confirmed' THEN 'packaging'
    WHEN _mode = 'auto' AND _from IN ('packaging','ready_to_pack') THEN 'packed'
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

CREATE OR REPLACE FUNCTION public.pack_my_stats(_brand_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _start timestamptz := (public.hr_today()::timestamp AT TIME ZONE 'Asia/Dhaka');
BEGIN
  IF NOT public.pack_can_use() THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'to_pack', (SELECT count(*) FROM public.orders o WHERE o.status = 'confirmed'
                AND (_brand_ids IS NULL OR o.brand_id = ANY(_brand_ids)) AND public.pack_can_use(o.brand_id)),
    'packing', (SELECT count(*) FROM public.orders o WHERE o.status IN ('packaging','ready_to_pack')
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
