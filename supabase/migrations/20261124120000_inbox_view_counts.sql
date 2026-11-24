-- Counts for every inbox filter in one round trip (RLS applies: SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.inbox_view_counts(
  _brand_ids uuid[], _platform text DEFAULT NULL, _user uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'awaiting',   count(*) FILTER (WHERE status = 'open' AND last_message_direction = 'in'),
    'open',       count(*) FILTER (WHERE status = 'open'),
    'mine',       count(*) FILTER (WHERE status = 'open' AND _user IS NOT NULL AND assigned_to = _user),
    'unassigned', count(*) FILTER (WHERE status = 'open' AND assigned_to IS NULL),
    'unread',     count(*) FILTER (WHERE unread_count > 0),
    'ads',        count(*) FILTER (WHERE status = 'open' AND ad_id IS NOT NULL),
    'ads_waiting',count(*) FILTER (WHERE status = 'open' AND ad_id IS NOT NULL AND last_message_direction = 'in'),
    'urgent',     count(*) FILTER (WHERE status = 'open' AND last_message_direction = 'in'
                                     AND last_message_at < now() - interval '30 minutes')
  )
  FROM public.inbox_conversations
  WHERE brand_id = ANY(_brand_ids)
    AND (_platform IS NULL OR platform = _platform);
$$;
GRANT EXECUTE ON FUNCTION public.inbox_view_counts(uuid[], text, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS inbox_conversations_status_dir_idx
  ON public.inbox_conversations (brand_id, status, last_message_direction);
