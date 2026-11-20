-- Packing staff may move Pending → Packing and Packing → Packed.
-- Packed → RTS stays with owner / admin / operations / warehouse staff.
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

  IF NOT public.pack__listed(o) THEN
    RAISE EXCEPTION '% — website order টা এখনো Web Orders-এ complete হয়নি (%)', coalesce(o.invoice_no, left(o.id::text, 8)), coalesce(o.web_status::text, '—');
  END IF;

  IF public.pack_is_packer_only() THEN
    -- Packers: Pending → Packing, and Packing → Packed. Nothing else.
    _to := CASE
      WHEN _from = 'confirmed' THEN 'packaging'
      WHEN _from IN ('packaging','ready_to_pack') THEN 'packed'
    END::public.order_status;
    IF _to IS NULL THEN
      RAISE EXCEPTION '% এখন "%" — আপনি শুধু Pending → Packing আর Packing → Packed করতে পারবেন',
        coalesce(o.invoice_no, left(o.id::text, 8)), _from;
    END IF;
  ELSE
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
