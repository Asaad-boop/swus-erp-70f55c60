-- Staff who can be assigned inbox conversations (for the "Assign" picker).
CREATE OR REPLACE FUNCTION public.inbox_staff()
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT r.user_id, COALESCE(NULLIF(p.display_name, ''), 'Staff')
  FROM public.user_roles r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.role IN ('admin','owner','operations','customer_service')
    AND EXISTS (SELECT 1 FROM public.brands b WHERE public.inbox_can_access(b.id))
  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.inbox_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.inbox_staff() TO authenticated;

CREATE INDEX IF NOT EXISTS inbox_conversations_assigned_idx
  ON public.inbox_conversations (assigned_to, status, last_message_at DESC)
  WHERE assigned_to IS NOT NULL;
