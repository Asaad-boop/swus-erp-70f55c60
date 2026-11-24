-- Inbox work queues (complaints, follow-ups, order-placed) + team performance report.

-- ── conversation state ──────────────────────────────────────────────
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS complaint_at timestamptz,
  ADD COLUMN IF NOT EXISTS complaint_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS complaint_text text,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_note text,
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_at timestamptz;

CREATE INDEX IF NOT EXISTS inbox_conversations_complaint_idx
  ON public.inbox_conversations (brand_id, complaint_at DESC)
  WHERE complaint_at IS NOT NULL AND complaint_resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS inbox_conversations_snooze_idx
  ON public.inbox_conversations (brand_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_conversations_tags_idx
  ON public.inbox_conversations USING gin (tags);

-- Who made an order (new orders only; older ones fall back to confirmed_by).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- ── complaint words (Bangla, Banglish, English) ─────────────────────
CREATE OR REPLACE FUNCTION public.inbox_is_complaint(_body text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(_body, '') ~* (
    '(ভাঙা|ভেঙে|ভেংগে|নষ্ট|ড্যামেজ|damage|broken|vanga|venge|nosto|'
    || 'ফেরত|refund|return\s*(dite|korbo|chai)|টাকা\s*ফেরত|'
    || 'খারাপ\s*(প্রোডাক্ট|মাল|জিনিস)|kharap\s*(product|mal)|'
    || 'ভুয়া|fake|প্রতারণা|প্রতারক|বাটপার|batpar|scam|cheat|'
    || 'পাইনি|পাই\s*নাই|পাই\s*নি|paini|pai\s*nai|'
    || 'ভুল\s*(প্রোডাক্ট|মাল|সাইজ|কালার|জিনিস)|wrong\s*(product|item|size|color)|vul\s*(product|mal)|'
    || 'অভিযোগ|complain|complaint|'
    || 'এখনো\s*(আসে|পাই)|ekhono\s*(ashe|pai)|delivery\s*(hoy|hoi)\s*(nai|ni)|কবে\s*পাবো)'
  );
$$;

CREATE OR REPLACE FUNCTION public.inbox_msg_queue_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.direction = 'in' THEN
    -- A new customer message ends any snooze and may raise a complaint.
    UPDATE public.inbox_conversations SET
      snoozed_until = NULL,
      snooze_note = NULL,
      complaint_at = CASE
        WHEN public.inbox_is_complaint(NEW.body)
             AND (complaint_at IS NULL OR complaint_resolved_at IS NOT NULL)
        THEN NEW.created_at ELSE complaint_at END,
      complaint_text = CASE
        WHEN public.inbox_is_complaint(NEW.body)
             AND (complaint_at IS NULL OR complaint_resolved_at IS NOT NULL)
        THEN left(NEW.body, 300) ELSE complaint_text END,
      complaint_resolved_at = CASE
        WHEN public.inbox_is_complaint(NEW.body) THEN NULL ELSE complaint_resolved_at END
    WHERE id = NEW.conversation_id;
  ELSE
    -- Our reply to a due follow-up clears it.
    UPDATE public.inbox_conversations SET snoozed_until = NULL, snooze_note = NULL
     WHERE id = NEW.conversation_id AND snoozed_until IS NOT NULL AND snoozed_until <= now();
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_inbox_msg_queue_state ON public.inbox_messages;
CREATE TRIGGER trg_inbox_msg_queue_state AFTER INSERT ON public.inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.inbox_msg_queue_state();

-- ── order count on the chat ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inbox_refresh_order_count(_conv uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.inbox_conversations c SET
    order_count = s.n, last_order_at = s.last_at
  FROM (SELECT count(*)::int AS n, max(created_at) AS last_at
          FROM public.orders WHERE inbox_conversation_id = _conv
           AND status::text NOT IN ('cancelled', 'fake')) s
  WHERE c.id = _conv;
$$;

CREATE OR REPLACE FUNCTION public.orders_touch_inbox_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.inbox_conversation_id IS NOT NULL THEN
    PERFORM public.inbox_refresh_order_count(NEW.inbox_conversation_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.inbox_conversation_id IS NOT NULL
     AND OLD.inbox_conversation_id IS DISTINCT FROM NEW.inbox_conversation_id THEN
    PERFORM public.inbox_refresh_order_count(OLD.inbox_conversation_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_orders_touch_inbox_count ON public.orders;
CREATE TRIGGER trg_orders_touch_inbox_count AFTER INSERT OR UPDATE OF inbox_conversation_id, status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_touch_inbox_count();

-- ── queue counts (replaces the earlier version) ─────────────────────
CREATE OR REPLACE FUNCTION public.inbox_view_counts(
  _brand_ids uuid[], _platform text DEFAULT NULL, _user uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  WITH c AS (
    SELECT *,
      (snoozed_until IS NOT NULL AND snoozed_until > now()) AS sleeping,
      (status = 'open' AND (last_message_direction = 'in'
         OR (snoozed_until IS NOT NULL AND snoozed_until <= now()))) AS needs
    FROM public.inbox_conversations
    WHERE brand_id = ANY(_brand_ids) AND (_platform IS NULL OR platform = _platform)
  )
  SELECT jsonb_build_object(
    'awaiting',    count(*) FILTER (WHERE needs AND NOT sleeping),
    'urgent',      count(*) FILTER (WHERE needs AND NOT sleeping AND last_message_at < now() - interval '30 minutes'),
    'open',        count(*) FILTER (WHERE status = 'open' AND NOT sleeping),
    'mine',        count(*) FILTER (WHERE status = 'open' AND NOT sleeping AND _user IS NOT NULL AND assigned_to = _user),
    'mine_waiting',count(*) FILTER (WHERE needs AND NOT sleeping AND _user IS NOT NULL AND assigned_to = _user),
    'unassigned',  count(*) FILTER (WHERE status = 'open' AND NOT sleeping AND assigned_to IS NULL),
    'unread',      count(*) FILTER (WHERE unread_count > 0),
    'ads',         count(*) FILTER (WHERE status = 'open' AND ad_id IS NOT NULL AND NOT sleeping),
    'ads_waiting', count(*) FILTER (WHERE needs AND NOT sleeping AND ad_id IS NOT NULL),
    'complaint',   count(*) FILTER (WHERE complaint_at IS NOT NULL AND complaint_resolved_at IS NULL),
    'followup',    count(*) FILTER (WHERE snoozed_until IS NOT NULL),
    'followup_due',count(*) FILTER (WHERE snoozed_until IS NOT NULL AND snoozed_until <= now()),
    'ordered',     count(*) FILTER (WHERE order_count > 0 AND last_order_at > now() - interval '30 days'),
    'labels',      coalesce((SELECT jsonb_object_agg(t, n) FROM (
                     SELECT t, count(*) n FROM c, unnest(c.tags) t WHERE c.status = 'open' GROUP BY t) x), '{}'::jsonb)
  )
  FROM c;
$$;
GRANT EXECUTE ON FUNCTION public.inbox_view_counts(uuid[], text, uuid) TO authenticated;

-- ── team performance report ─────────────────────────────────────────
-- First response = first reply after a customer message that opened a wait
-- (their first message, or the first one after our last reply).
CREATE OR REPLACE FUNCTION public.inbox_team_report(_brand_ids uuid[], _from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH brands AS (
  SELECT b FROM unnest(_brand_ids) b WHERE public.inbox_can_access(b)
),
msgs AS (
  SELECT m.id, m.conversation_id, m.brand_id, m.direction, m.created_at, m.sent_by, m.sent_via, m.body,
         lag(m.direction) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at, m.id) AS prev_dir
    FROM public.inbox_messages m
   WHERE m.brand_id IN (SELECT b FROM brands)
     AND m.created_at >= _from - interval '3 days' AND m.created_at < _to + interval '1 day'
),
waits AS (
  SELECT w.conversation_id, w.created_at AS in_at, r.created_at AS out_at, r.sent_by, r.sent_via
    FROM msgs w
    LEFT JOIN LATERAL (
      SELECT o.created_at, o.sent_by, o.sent_via FROM msgs o
       WHERE o.conversation_id = w.conversation_id AND o.direction = 'out' AND o.created_at > w.created_at
       ORDER BY o.created_at LIMIT 1
    ) r ON true
   WHERE w.direction = 'in' AND (w.prev_dir IS NULL OR w.prev_dir = 'out')
     AND w.created_at >= _from AND w.created_at < _to
),
frt AS (
  SELECT *, extract(epoch FROM out_at - in_at) / 60.0 AS mins FROM waits
),
outs AS (
  SELECT * FROM msgs WHERE direction = 'out' AND created_at >= _from AND created_at < _to
),
ords AS (
  SELECT o.id, o.total, o.status::text AS status, o.created_at, o.inbox_conversation_id,
         coalesce(o.created_by, o.confirmed_by, cv.assigned_to) AS by_user,
         (o.fb_ad_id IS NOT NULL AND o.utm_medium = 'message_ad') AS from_ad
    FROM public.orders o
    JOIN public.inbox_conversations cv ON cv.id = o.inbox_conversation_id
   WHERE o.brand_id IN (SELECT b FROM brands) AND o.created_at >= _from AND o.created_at < _to
     AND o.status::text NOT IN ('cancelled', 'fake', 'incomplete')
),
people AS (
  SELECT p.id, coalesce(nullif(p.display_name, ''), 'Staff') AS name FROM public.profiles p
),
staff AS (
  SELECT u.user_id,
         coalesce((SELECT name FROM people WHERE id = u.user_id), 'Staff') AS name,
         (SELECT count(*) FROM outs WHERE sent_by = u.user_id AND sent_via = 'erp')::int AS replies,
         (SELECT count(DISTINCT conversation_id) FROM outs WHERE sent_by = u.user_id AND sent_via = 'erp')::int AS chats,
         (SELECT count(*) FROM frt WHERE sent_by = u.user_id AND sent_via = 'erp')::int AS first_responses,
         (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY mins))::numeric, 1) FROM frt WHERE sent_by = u.user_id AND sent_via = 'erp') AS median_min,
         (SELECT round(avg(mins)::numeric, 1) FROM frt WHERE sent_by = u.user_id AND sent_via = 'erp') AS avg_min,
         (SELECT round(100.0 * count(*) FILTER (WHERE mins <= 5) / nullif(count(*), 0)) FROM frt WHERE sent_by = u.user_id AND sent_via = 'erp') AS within5_pct,
         (SELECT count(*) FROM ords WHERE by_user = u.user_id)::int AS orders,
         (SELECT coalesce(sum(total), 0) FROM ords WHERE by_user = u.user_id) AS order_value,
         (SELECT count(*) FROM frt f JOIN public.inbox_conversations cv ON cv.id = f.conversation_id
           WHERE f.sent_by = u.user_id AND f.sent_via = 'erp' AND cv.complaint_at IS NOT NULL
             AND cv.complaint_at >= _from)::int AS complaint_chats,
         (SELECT extract(hour FROM (min(created_at) AT TIME ZONE 'Asia/Dhaka'))::int FROM outs WHERE sent_by = u.user_id) AS first_hour
    FROM (SELECT DISTINCT sent_by AS user_id FROM outs WHERE sent_by IS NOT NULL
          UNION SELECT DISTINCT by_user FROM ords WHERE by_user IS NOT NULL) u
)
SELECT jsonb_build_object(
  'totals', jsonb_build_object(
    'new_chats', (SELECT count(*) FROM public.inbox_conversations
                   WHERE brand_id IN (SELECT b FROM brands) AND created_at >= _from AND created_at < _to),
    'ad_chats', (SELECT count(*) FROM public.inbox_conversations
                   WHERE brand_id IN (SELECT b FROM brands) AND ad_first_at >= _from AND ad_first_at < _to),
    'inbound', (SELECT count(*) FROM msgs WHERE direction = 'in' AND created_at >= _from AND created_at < _to),
    'replies', (SELECT count(*) FROM outs WHERE sent_via = 'erp'),
    'auto_replies', (SELECT count(*) FROM outs WHERE sent_via = 'auto'),
    'app_replies', (SELECT count(*) FROM outs WHERE sent_via = 'platform'),
    'waits', (SELECT count(*) FROM frt),
    'unanswered', (SELECT count(*) FROM frt WHERE out_at IS NULL),
    'median_min', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY mins))::numeric, 1) FROM frt WHERE out_at IS NOT NULL),
    'within5_pct', (SELECT round(100.0 * count(*) FILTER (WHERE mins <= 5) / nullif(count(*) FILTER (WHERE out_at IS NOT NULL), 0)) FROM frt),
    'orders', (SELECT count(*) FROM ords),
    'order_value', (SELECT coalesce(sum(total), 0) FROM ords),
    'ad_orders', (SELECT count(*) FROM ords WHERE from_ad),
    'chats_with_order', (SELECT count(DISTINCT inbox_conversation_id) FROM ords),
    'complaints', (SELECT count(*) FROM public.inbox_conversations
                    WHERE brand_id IN (SELECT b FROM brands) AND complaint_at >= _from AND complaint_at < _to),
    'complaints_open', (SELECT count(*) FROM public.inbox_conversations
                    WHERE brand_id IN (SELECT b FROM brands) AND complaint_at >= _from AND complaint_at < _to
                      AND complaint_resolved_at IS NULL)
  ),
  'staff', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.replies DESC) FROM staff s), '[]'::jsonb),
  'daily', coalesce((
    SELECT jsonb_agg(jsonb_build_object('day', d, 'inbound', i, 'replies', r, 'orders', o, 'value', v) ORDER BY d)
      FROM (
        SELECT g::date AS d,
          (SELECT count(*) FROM msgs WHERE direction = 'in' AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = g::date) AS i,
          (SELECT count(*) FROM outs WHERE sent_via = 'erp' AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = g::date) AS r,
          (SELECT count(*) FROM ords WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = g::date) AS o,
          (SELECT coalesce(sum(total), 0) FROM ords WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = g::date) AS v
          FROM generate_series((_from AT TIME ZONE 'Asia/Dhaka')::date,
                               ((_to - interval '1 second') AT TIME ZONE 'Asia/Dhaka')::date, interval '1 day') g
      ) x), '[]'::jsonb),
  'hourly', coalesce((
    SELECT jsonb_agg(jsonb_build_object('hour', h, 'inbound', i, 'median_min', md) ORDER BY h)
      FROM (
        SELECT h,
          (SELECT count(*) FROM msgs WHERE direction = 'in' AND created_at >= _from AND created_at < _to
             AND extract(hour FROM created_at AT TIME ZONE 'Asia/Dhaka') = h) AS i,
          (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY mins))::numeric, 1) FROM frt
             WHERE out_at IS NOT NULL AND extract(hour FROM in_at AT TIME ZONE 'Asia/Dhaka') = h) AS md
          FROM generate_series(0, 23) h
      ) y), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.inbox_team_report(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_team_report(uuid[], timestamptz, timestamptz) TO authenticated;

-- One staff member's replies (drill-down), newest first.
CREATE OR REPLACE FUNCTION public.inbox_staff_replies(
  _brand_ids uuid[], _user uuid, _from timestamptz, _to timestamptz, _limit int DEFAULT 100
) RETURNS TABLE (id uuid, conversation_id uuid, body text, attachments jsonb, created_at timestamptz,
                 contact_name text, platform text, brand_id uuid, response_min numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id, m.conversation_id, m.body, m.attachments, m.created_at, cv.contact_name, cv.platform, m.brand_id,
         round((extract(epoch FROM m.created_at - p.created_at) / 60.0)::numeric, 1)
    FROM public.inbox_messages m
    JOIN public.inbox_conversations cv ON cv.id = m.conversation_id
    LEFT JOIN LATERAL (
      SELECT i.created_at FROM public.inbox_messages i
       WHERE i.conversation_id = m.conversation_id AND i.direction = 'in' AND i.created_at < m.created_at
       ORDER BY i.created_at DESC LIMIT 1
    ) p ON true
   WHERE m.sent_by = _user AND m.direction = 'out'
     AND m.created_at >= _from AND m.created_at < _to
     AND m.brand_id = ANY(_brand_ids) AND public.inbox_can_access(m.brand_id)
   ORDER BY m.created_at DESC
   LIMIT least(coalesce(_limit, 100), 300);
$$;
REVOKE ALL ON FUNCTION public.inbox_staff_replies(uuid[], uuid, timestamptz, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_staff_replies(uuid[], uuid, timestamptz, timestamptz, int) TO authenticated;

-- ── backfill ────────────────────────────────────────────────────────
UPDATE public.inbox_conversations c SET order_count = s.n, last_order_at = s.last_at
  FROM (SELECT inbox_conversation_id AS cid, count(*)::int AS n, max(created_at) AS last_at
          FROM public.orders WHERE inbox_conversation_id IS NOT NULL
           AND status::text NOT IN ('cancelled', 'fake') GROUP BY 1) s
 WHERE c.id = s.cid;

-- Open complaints from the last 14 days of customer messages.
UPDATE public.inbox_conversations c SET complaint_at = x.at, complaint_text = x.body
  FROM (SELECT DISTINCT ON (conversation_id) conversation_id, created_at AS at, left(body, 300) AS body
          FROM public.inbox_messages
         WHERE direction = 'in' AND created_at > now() - interval '14 days'
           AND public.inbox_is_complaint(body)
         ORDER BY conversation_id, created_at DESC) x
 WHERE c.id = x.conversation_id AND c.complaint_at IS NULL;
