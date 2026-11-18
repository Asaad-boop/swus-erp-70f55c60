-- One round trip per scan: find the order by scanned code and move it.
-- Returns {result: ok|error|choose|not_found, order?, choices?, message?}.
CREATE OR REPLACE FUNCTION public.pack_scan_code(_code text, _mode text DEFAULT 'auto')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c text := btrim(coalesce(_code, ''));
  _ids uuid[];
  _row jsonb;
BEGIN
  IF NOT public.pack_can_use() THEN RAISE EXCEPTION 'Packing access required'; END IF;
  IF length(_c) < 3 THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  SELECT array_agg(o.id) INTO _ids FROM (
    SELECT o.id FROM public.orders o
    WHERE (o.invoice_no = _c OR o.tracking_number = _c OR o.id::text = _c)
      AND public.pack_can_use(o.brand_id)
    LIMIT 3) o;

  IF coalesce(array_length(_ids, 1), 0) = 0 AND length(_c) >= 4 THEN
    SELECT array_agg(o.id) INTO _ids FROM (
      SELECT o.id FROM public.orders o
      WHERE o.invoice_no ILIKE '%' || _c AND public.pack_can_use(o.brand_id)
      ORDER BY o.created_at DESC LIMIT 5) o;
  END IF;

  IF coalesce(array_length(_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF array_length(_ids, 1) > 1 THEN
    RETURN jsonb_build_object('result', 'choose', 'choices',
      (SELECT jsonb_agg(public.pack__row(o) ORDER BY o.created_at DESC) FROM public.orders o WHERE o.id = ANY(_ids)));
  END IF;

  BEGIN
    _row := public.pack_scan(_ids[1], _mode);
    RETURN jsonb_build_object('result', 'ok', 'order', _row);
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('result', 'error', 'message', SQLERRM,
      'order', (SELECT public.pack__row(o) FROM public.orders o WHERE o.id = _ids[1]));
  END;
END $$;

REVOKE EXECUTE ON FUNCTION public.pack_scan_code(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pack_scan_code(text, text) TO authenticated, service_role;
