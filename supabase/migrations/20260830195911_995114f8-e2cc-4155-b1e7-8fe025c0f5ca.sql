REVOKE EXECUTE ON FUNCTION public.inv_recalc_reservation(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inv_recalc_reservation_for_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inv_open_order_qty(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_qc_hold_qty(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_reservation_drift() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_release_items_reservation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_inv_guard_reserved() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_recalc_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inv_recalc_reservation_for_order(uuid) TO service_role;