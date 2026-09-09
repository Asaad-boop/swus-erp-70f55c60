REVOKE EXECUTE ON FUNCTION public.enqueue_webhook_event(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_webhook_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_webhook_products() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_webhook_variant_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_webhook_purchase_received() FROM PUBLIC, anon, authenticated;