-- order_locks: staff-only write access
DROP POLICY IF EXISTS "Authenticated users can create own order locks" ON public.order_locks;
CREATE POLICY "Staff can create own order locks" ON public.order_locks
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can takeover order locks" ON public.order_locks;
CREATE POLICY "Staff can takeover order locks" ON public.order_locks
FOR UPDATE TO authenticated
USING (is_staff(auth.uid()))
WITH CHECK (user_id = auth.uid() AND is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can delete own order locks" ON public.order_locks;
CREATE POLICY "Staff can delete own order locks" ON public.order_locks
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND is_staff(auth.uid()));

-- abandoned_carts: remove broad anonymous UPDATE; anon INSERT (new cart capture) stays,
-- updates are handled by the public upsert_abandoned_cart security-definer RPC
DROP POLICY IF EXISTS anon_upsert_abandoned_cart ON public.abandoned_carts;
REVOKE UPDATE ON public.abandoned_carts FROM anon;