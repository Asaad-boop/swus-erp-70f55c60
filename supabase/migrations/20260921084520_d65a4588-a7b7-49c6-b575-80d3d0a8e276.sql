-- order_locks: restrict SELECT to staff
DROP POLICY IF EXISTS "Authenticated users can read order locks" ON public.order_locks;
CREATE POLICY "Staff can read order locks" ON public.order_locks
FOR SELECT TO authenticated
USING (is_staff(auth.uid()));

-- sms_logs: restrict INSERT to staff roles (matches the SELECT policy)
DROP POLICY IF EXISTS sms_logs_insert_auth ON public.sms_logs;
CREATE POLICY sms_logs_insert_staff ON public.sms_logs
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
);