-- Run in a database SQL session. Read-only checks; rollback restores session state.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e4aaecdb-e5de-45c0-855c-a89b5cbfd289', true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders) THEN
    RAISE EXCEPTION 'Himelmaverick assigned order pages must expose existing orders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items) THEN
    RAISE EXCEPTION 'Assigned order pages must expose ordered products';
  END IF;
  IF NOT private.staff_has_explicit_page(auth.uid(), ARRAY['/erp/orders/list'], NULL) THEN
    RAISE EXCEPTION 'Explicit order-list grant with all brands must allow reads';
  END IF;
  IF private.staff_has_explicit_page(auth.uid(), ARRAY['/erp/finance'], NULL) THEN
    RAISE EXCEPTION 'Order page grants must not confer finance access';
  END IF;
  IF private.staff_has_explicit_page(NULL, ARRAY['/erp/orders/list'], NULL) THEN
    RAISE EXCEPTION 'Anonymous callers must be denied';
  END IF;
  IF private.staff_has_explicit_page('00000000-0000-0000-0000-000000000000', ARRAY['/erp/orders/list'], NULL) THEN
    RAISE EXCEPTION 'Callers must not check another user';
  END IF;
END $$;
ROLLBACK;