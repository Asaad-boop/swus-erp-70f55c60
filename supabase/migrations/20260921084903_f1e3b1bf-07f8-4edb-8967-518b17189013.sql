-- analytics_events: prevent spoofed user attribution on insert
DROP POLICY IF EXISTS "anyone insert analytics events" ON public.analytics_events;
CREATE POLICY "anyone insert analytics events" ON public.analytics_events
FOR INSERT TO anon, authenticated
WITH CHECK (
  length(session_id) > 0
  AND length(event_name) > 0
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- active_sessions: staff read policy should not list the anon role at all
DROP POLICY IF EXISTS "staff read sessions" ON public.active_sessions;
CREATE POLICY "staff read sessions" ON public.active_sessions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'customer_service'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
);