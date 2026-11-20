-- ════════════════════════════════════════════════════════════════════
-- Inbox module: one panel for Messenger, Instagram DM and WhatsApp
-- across every brand (HobbyShop, Toyora, …).
--
--   inbox_channels         one row per connected page / IG account / WA number
--   inbox_channel_secrets  access tokens — NO policies, service role only
--   inbox_conversations    one thread per (channel, customer)
--   inbox_messages         every inbound / outbound message
--   inbox_quick_replies    saved replies (brand-specific or all brands)
--   inbox_notes            internal staff notes on a conversation
--   inbox_oauth_sessions   short-lived Meta user token during "Connect pages"
--   inbox_webhook_events   raw webhook log for debugging (service role only)
-- ════════════════════════════════════════════════════════════════════

-- Who may use the inbox for a brand: admin/owner, operations, customer service,
-- or staff with an explicit /erp/inbox page grant for that brand.
CREATE OR REPLACE FUNCTION public.inbox_can_access(_brand uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = (SELECT auth.uid())
        AND r.role IN ('admin','owner')
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = (SELECT auth.uid())
          AND r.role IN ('operations','customer_service')
      )
      AND public.can_access_brand((SELECT auth.uid()), _brand)
    )
    OR private.staff_has_explicit_page((SELECT auth.uid()), ARRAY['/erp/inbox'], _brand)
  );
$$;

CREATE OR REPLACE FUNCTION public.inbox_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role IN ('admin','owner')
  );
$$;

-- ── channels ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('messenger','instagram','whatsapp')),
  external_id text NOT NULL,            -- FB page id / IG account id / WA phone_number_id
  page_id text,                         -- FB page that sends for this channel (messenger + instagram)
  name text NOT NULL,
  username text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE TABLE IF NOT EXISTS public.inbox_channel_secrets (
  channel_id uuid PRIMARY KEY REFERENCES public.inbox_channels(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── conversations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.inbox_channels(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_user_id text NOT NULL,       -- PSID / IGSID / WhatsApp wa_id
  contact_name text,
  contact_username text,
  contact_avatar text,
  contact_phone text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  assigned_to uuid,
  tags text[] NOT NULL DEFAULT '{}',
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  last_inbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_user_id)
);
CREATE INDEX IF NOT EXISTS inbox_conversations_list_idx
  ON public.inbox_conversations (brand_id, status, last_message_at DESC, id);
CREATE INDEX IF NOT EXISTS inbox_conversations_last_idx
  ON public.inbox_conversations (last_message_at DESC, id);

-- ── messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  external_message_id text,
  msg_type text NOT NULL DEFAULT 'text',
  body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{type,url,name}]
  sent_by uuid,                                     -- staff user (null = customer or sent outside ERP)
  sent_via text,                                    -- 'erp' | 'platform' (echo from Meta inbox / phone)
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','read','failed','received')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_external_uidx
  ON public.inbox_messages (external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_messages_conv_idx
  ON public.inbox_messages (conversation_id, created_at, id);

-- ── quick replies ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,   -- null = all brands
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_quick_replies_brand_idx ON public.inbox_quick_replies (brand_id, sort_order);

-- ── notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_notes_conv_idx ON public.inbox_notes (conversation_id, created_at);

-- ── service-only tables ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_oauth_sessions (
  user_id uuid PRIMARY KEY,
  access_token text NOT NULL,
  expires_at timestamptz,
  fb_user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inbox_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object text,
  payload jsonb NOT NULL,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_webhook_events_received_idx ON public.inbox_webhook_events (received_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.inbox_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_channel_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_webhook_events ENABLE ROW LEVEL SECURITY;
-- inbox_channel_secrets / inbox_oauth_sessions / inbox_webhook_events: no policies on purpose.

CREATE POLICY inbox_channels_select ON public.inbox_channels
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));
CREATE POLICY inbox_channels_admin_update ON public.inbox_channels
  FOR UPDATE TO authenticated USING (public.inbox_is_admin()) WITH CHECK (public.inbox_is_admin());

CREATE POLICY inbox_conversations_select ON public.inbox_conversations
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));
CREATE POLICY inbox_conversations_update ON public.inbox_conversations
  FOR UPDATE TO authenticated USING (public.inbox_can_access(brand_id)) WITH CHECK (public.inbox_can_access(brand_id));

CREATE POLICY inbox_messages_select ON public.inbox_messages
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));

CREATE POLICY inbox_quick_replies_select ON public.inbox_quick_replies
  FOR SELECT TO authenticated USING (
    CASE WHEN brand_id IS NULL
      THEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role <> 'customer')
      ELSE public.inbox_can_access(brand_id) END
  );
CREATE POLICY inbox_quick_replies_insert ON public.inbox_quick_replies
  FOR INSERT TO authenticated WITH CHECK (
    CASE WHEN brand_id IS NULL THEN public.inbox_is_admin() OR public.inbox_can_access(NULL)
      ELSE public.inbox_can_access(brand_id) END
  );
CREATE POLICY inbox_quick_replies_update ON public.inbox_quick_replies
  FOR UPDATE TO authenticated
  USING (CASE WHEN brand_id IS NULL THEN public.inbox_is_admin() OR public.inbox_can_access(NULL) ELSE public.inbox_can_access(brand_id) END)
  WITH CHECK (CASE WHEN brand_id IS NULL THEN public.inbox_is_admin() OR public.inbox_can_access(NULL) ELSE public.inbox_can_access(brand_id) END);
CREATE POLICY inbox_quick_replies_delete ON public.inbox_quick_replies
  FOR DELETE TO authenticated
  USING (CASE WHEN brand_id IS NULL THEN public.inbox_is_admin() OR public.inbox_can_access(NULL) ELSE public.inbox_can_access(brand_id) END);

CREATE POLICY inbox_notes_select ON public.inbox_notes
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));
CREATE POLICY inbox_notes_insert ON public.inbox_notes
  FOR INSERT TO authenticated WITH CHECK (
    public.inbox_can_access(brand_id)
    AND created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.inbox_conversations c WHERE c.id = conversation_id AND c.brand_id = inbox_notes.brand_id)
  );
CREATE POLICY inbox_notes_delete ON public.inbox_notes
  FOR DELETE TO authenticated USING (created_by = (SELECT auth.uid()) OR public.inbox_is_admin());

-- Staff may only change workflow fields on a conversation, never its identity.
CREATE OR REPLACE FUNCTION public.inbox_conversations_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    NEW.channel_id := OLD.channel_id;
    NEW.brand_id := OLD.brand_id;
    NEW.platform := OLD.platform;
    NEW.external_user_id := OLD.external_user_id;
    NEW.last_message_at := OLD.last_message_at;
    NEW.last_message_preview := OLD.last_message_preview;
    NEW.last_message_direction := OLD.last_message_direction;
    NEW.last_inbound_at := OLD.last_inbound_at;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inbox_conversations_guard ON public.inbox_conversations;
CREATE TRIGGER inbox_conversations_guard BEFORE UPDATE ON public.inbox_conversations
  FOR EACH ROW EXECUTE FUNCTION public.inbox_conversations_guard();

CREATE OR REPLACE FUNCTION public.inbox_channels_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    NEW.platform := OLD.platform;
    NEW.external_id := OLD.external_id;
    NEW.page_id := OLD.page_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inbox_channels_guard ON public.inbox_channels;
CREATE TRIGGER inbox_channels_guard BEFORE UPDATE ON public.inbox_channels
  FOR EACH ROW EXECUTE FUNCTION public.inbox_channels_guard();

-- Keep a conversation's brand in step with its channel when an admin moves a channel to another brand.
CREATE OR REPLACE FUNCTION public.inbox_channels_brand_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.brand_id IS DISTINCT FROM OLD.brand_id THEN
    UPDATE public.inbox_conversations SET brand_id = NEW.brand_id WHERE channel_id = NEW.id;
    UPDATE public.inbox_messages m SET brand_id = NEW.brand_id
      FROM public.inbox_conversations c WHERE c.id = m.conversation_id AND c.channel_id = NEW.id;
    UPDATE public.inbox_notes n SET brand_id = NEW.brand_id
      FROM public.inbox_conversations c WHERE c.id = n.conversation_id AND c.channel_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inbox_channels_brand_sync ON public.inbox_channels;
CREATE TRIGGER inbox_channels_brand_sync AFTER UPDATE OF brand_id ON public.inbox_channels
  FOR EACH ROW EXECUTE FUNCTION public.inbox_channels_brand_sync();

-- Quick reply usage counter (any inbox user can bump it).
CREATE OR REPLACE FUNCTION public.inbox_bump_quick_reply(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.inbox_quick_replies q SET use_count = use_count + 1
  WHERE q.id = _id
    AND (q.brand_id IS NULL OR public.inbox_can_access(q.brand_id));
$$;

-- Ingest one message (used by the webhook with the service role).
-- Upserts the conversation, inserts the message (deduped on external id),
-- and keeps the list preview / unread counter / 24h window in step.
CREATE OR REPLACE FUNCTION public.inbox_ingest_message(
  _channel_id uuid,
  _external_user_id text,
  _direction text,
  _external_message_id text,
  _msg_type text,
  _body text,
  _attachments jsonb,
  _created_at timestamptz,
  _contact_name text DEFAULT NULL,
  _contact_username text DEFAULT NULL,
  _contact_avatar text DEFAULT NULL,
  _contact_phone text DEFAULT NULL,
  _sent_via text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ch public.inbox_channels%ROWTYPE;
  conv_id uuid;
  msg_id uuid;
  preview text;
BEGIN
  SELECT * INTO ch FROM public.inbox_channels WHERE id = _channel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'channel not found'; END IF;

  INSERT INTO public.inbox_conversations
    (channel_id, brand_id, platform, external_user_id, contact_name, contact_username, contact_avatar, contact_phone)
  VALUES (ch.id, ch.brand_id, ch.platform, _external_user_id, _contact_name, _contact_username, _contact_avatar, _contact_phone)
  ON CONFLICT (channel_id, external_user_id) DO UPDATE SET
    contact_name = COALESCE(EXCLUDED.contact_name, inbox_conversations.contact_name),
    contact_username = COALESCE(EXCLUDED.contact_username, inbox_conversations.contact_username),
    contact_avatar = COALESCE(EXCLUDED.contact_avatar, inbox_conversations.contact_avatar),
    contact_phone = COALESCE(inbox_conversations.contact_phone, EXCLUDED.contact_phone)
  RETURNING id INTO conv_id;

  INSERT INTO public.inbox_messages
    (conversation_id, brand_id, direction, external_message_id, msg_type, body, attachments, status, sent_via, created_at)
  VALUES (conv_id, ch.brand_id, _direction, _external_message_id, COALESCE(_msg_type,'text'), _body,
          COALESCE(_attachments,'[]'::jsonb), CASE WHEN _direction = 'in' THEN 'received' ELSE 'sent' END,
          _sent_via, COALESCE(_created_at, now()))
  ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
  RETURNING id INTO msg_id;

  IF msg_id IS NULL THEN
    RETURN NULL;  -- duplicate delivery (or our own message echoing back)
  END IF;

  preview := COALESCE(NULLIF(left(_body, 140), ''),
    CASE COALESCE(_msg_type,'text')
      WHEN 'image' THEN '📷 Photo' WHEN 'video' THEN '🎬 Video' WHEN 'audio' THEN '🎤 Voice'
      WHEN 'sticker' THEN '😊 Sticker' WHEN 'file' THEN '📎 File' ELSE '…' END);

  UPDATE public.inbox_conversations SET
    last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'::timestamptz), COALESCE(_created_at, now())),
    last_message_preview = preview,
    last_message_direction = _direction,
    last_inbound_at = CASE WHEN _direction = 'in' THEN GREATEST(COALESCE(last_inbound_at, '-infinity'::timestamptz), COALESCE(_created_at, now())) ELSE last_inbound_at END,
    unread_count = CASE WHEN _direction = 'in' THEN unread_count + 1 ELSE 0 END,
    status = CASE WHEN _direction = 'in' THEN 'open' ELSE status END,
    updated_at = now()
  WHERE id = conv_id;

  RETURN msg_id;
END;
$$;
REVOKE ALL ON FUNCTION public.inbox_ingest_message(uuid,text,text,text,text,text,jsonb,timestamptz,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

-- ── realtime ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='inbox_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='inbox_conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_conversations;
  END IF;
END $$;

-- ── media bucket (photos staff send + copies of customer media) ─────
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-media', 'inbox-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS inbox_media_staff_upload ON storage.objects;
CREATE POLICY inbox_media_staff_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inbox-media' AND public.is_staff((SELECT auth.uid())));

-- ── starter quick replies (all brands) ──────────────────────────────
INSERT INTO public.inbox_quick_replies (brand_id, shortcut, title, body, sort_order)
SELECT NULL, v.shortcut, v.title, v.body, v.sort_order FROM (VALUES
  ('/hi', 'Greeting', 'আসসালামু আলাইকুম {name} 😊 আমাদের পেজে মেসেজ করার জন্য ধন্যবাদ। কিভাবে সাহায্য করতে পারি?', 1),
  ('/order', 'Order info চাওয়া', 'অর্ডার কনফার্ম করতে আপনার নাম, মোবাইল নাম্বার আর পূর্ণ ঠিকানা (থানা + জেলা সহ) দিন প্লিজ 🙏', 2),
  ('/delivery', 'Delivery charge (চার্জ বসিয়ে নাও)', 'ঢাকার ভিতরে ডেলিভারি চার্জ ৳__, ঢাকার বাইরে ৳__। ক্যাশ অন ডেলিভারি — প্রোডাক্ট হাতে পেয়ে টাকা দিবেন।', 3),
  ('/time', 'Delivery time (সময় ঠিক করে নাও)', 'ঢাকার ভিতরে __ দিন, ঢাকার বাইরে __ দিনের মধ্যে ডেলিভারি হয়ে যাবে ইনশাআল্লাহ।', 4),
  ('/confirm', 'Order confirmed', 'ধন্যবাদ {name}! আপনার অর্ডারটি কনফার্ম করা হয়েছে ✅ ডেলিভারি ম্যান কল দিলে রিসিভ করবেন প্লিজ।', 5),
  ('/thanks', 'Thanks', 'আমাদের সাথে থাকার জন্য ধন্যবাদ ❤️', 6)
) AS v(shortcut, title, body, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.inbox_quick_replies);

-- ── function grants ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.inbox_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_can_access(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_is_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_bump_quick_reply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_bump_quick_reply(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_channels_brand_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_ingest_message(uuid,text,text,text,text,text,jsonb,timestamptz,text,text,text,text,text) TO service_role;
