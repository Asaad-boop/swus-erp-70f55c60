-- Inbox: which chats came from a Meta message ad, and which orders those chats became.
--   * Meta sends a "referral" with each click-to-Messenger / Instagram / WhatsApp ad click.
--     The webhook stores it in inbox_ad_referrals and stamps the conversation.
--   * A customer phone number typed in chat fills contact_phone automatically.
--   * A new order is linked to the chat (explicitly, or by phone), and if that chat came
--     from an ad the order gets fb_ad_id / adset / campaign so the existing marketing
--     attribution (mkt_auto_attribute_order) credits the ad.

-- ── conversation ad stamp ───────────────────────────────────────────
ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS ad_id text,
  ADD COLUMN IF NOT EXISTS ad_title text,
  ADD COLUMN IF NOT EXISTS ad_photo text,
  ADD COLUMN IF NOT EXISTS ad_post_id text,
  ADD COLUMN IF NOT EXISTS ad_source text,
  ADD COLUMN IF NOT EXISTS ad_first_at timestamptz,
  ADD COLUMN IF NOT EXISTS ad_at timestamptz,
  ADD COLUMN IF NOT EXISTS ad_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS inbox_conversations_ad_idx
  ON public.inbox_conversations (brand_id, ad_at DESC) WHERE ad_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.inbox_phone_key(_p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d) >= 10 THEN right(d, 10) END
  FROM (SELECT regexp_replace(coalesce(_p, ''), '\D', '', 'g') AS d) x;
$$;

CREATE INDEX IF NOT EXISTS inbox_conversations_phone_key_idx
  ON public.inbox_conversations (brand_id, public.inbox_phone_key(contact_phone))
  WHERE contact_phone IS NOT NULL;

-- ── every ad click, kept for per-ad reporting ───────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_ad_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.inbox_channels(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  platform text NOT NULL,
  external_user_id text NOT NULL,
  conversation_id uuid REFERENCES public.inbox_conversations(id) ON DELETE SET NULL,
  ad_id text,
  ad_title text,
  photo_url text,
  post_id text,
  source text,
  ref text,
  ctwa_clid text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_ad_referrals_brand_idx ON public.inbox_ad_referrals (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbox_ad_referrals_user_idx ON public.inbox_ad_referrals (channel_id, external_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbox_ad_referrals_ad_idx ON public.inbox_ad_referrals (ad_id, created_at DESC);

ALTER TABLE public.inbox_ad_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_ad_referrals_select ON public.inbox_ad_referrals;
CREATE POLICY inbox_ad_referrals_select ON public.inbox_ad_referrals
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));

-- Called by the webhook (service role) for each referral.
CREATE OR REPLACE FUNCTION public.inbox_record_referral(
  _channel_id uuid, _external_user_id text, _ad_id text, _ad_title text, _photo text,
  _post_id text, _source text, _ref text, _ctwa_clid text, _payload jsonb, _at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  ch public.inbox_channels%ROWTYPE;
  conv uuid;
  at_ts timestamptz := coalesce(_at, now());
BEGIN
  IF coalesce(_ad_id, '') = '' AND coalesce(_ad_title, '') = '' THEN RETURN; END IF;
  SELECT * INTO ch FROM public.inbox_channels WHERE id = _channel_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Meta can send the same click twice (message + messaging_referrals event).
  IF EXISTS (
    SELECT 1 FROM public.inbox_ad_referrals
     WHERE channel_id = _channel_id AND external_user_id = _external_user_id
       AND coalesce(ad_id, '') = coalesce(_ad_id, '')
       AND created_at > at_ts - interval '10 minutes'
  ) THEN RETURN; END IF;

  SELECT id INTO conv FROM public.inbox_conversations
   WHERE channel_id = _channel_id AND external_user_id = _external_user_id;

  INSERT INTO public.inbox_ad_referrals
    (channel_id, brand_id, platform, external_user_id, conversation_id, ad_id, ad_title,
     photo_url, post_id, source, ref, ctwa_clid, payload, created_at)
  VALUES (_channel_id, ch.brand_id, ch.platform, _external_user_id, conv, nullif(_ad_id, ''),
     nullif(_ad_title, ''), _photo, _post_id, _source, _ref, _ctwa_clid, _payload, at_ts);

  IF conv IS NOT NULL THEN
    UPDATE public.inbox_conversations SET
      ad_id = coalesce(nullif(_ad_id, ''), ad_id),
      ad_title = coalesce(nullif(_ad_title, ''), ad_title),
      ad_photo = coalesce(_photo, ad_photo),
      ad_post_id = coalesce(_post_id, ad_post_id),
      ad_source = coalesce(_source, ad_source),
      ad_first_at = coalesce(ad_first_at, at_ts),
      ad_at = at_ts,
      ad_count = ad_count + 1
    WHERE id = conv;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.inbox_record_referral(uuid, text, text, text, text, text, text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

-- A conversation created just after its ad click picks the click up.
CREATE OR REPLACE FUNCTION public.inbox_conv_pick_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.inbox_ad_referrals%ROWTYPE; n int;
BEGIN
  IF NEW.ad_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.inbox_ad_referrals
   WHERE channel_id = NEW.channel_id AND external_user_id = NEW.external_user_id
     AND created_at > now() - interval '2 days'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO n FROM public.inbox_ad_referrals
     WHERE channel_id = NEW.channel_id AND external_user_id = NEW.external_user_id;
    NEW.ad_id := r.ad_id; NEW.ad_title := r.ad_title; NEW.ad_photo := r.photo_url;
    NEW.ad_post_id := r.post_id; NEW.ad_source := r.source; NEW.ad_at := r.created_at;
    NEW.ad_first_at := r.created_at; NEW.ad_count := n;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_inbox_conv_pick_referral ON public.inbox_conversations;
CREATE TRIGGER trg_inbox_conv_pick_referral BEFORE INSERT ON public.inbox_conversations
  FOR EACH ROW EXECUTE FUNCTION public.inbox_conv_pick_referral();

CREATE OR REPLACE FUNCTION public.inbox_conv_link_referrals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.inbox_ad_referrals SET conversation_id = NEW.id
   WHERE channel_id = NEW.channel_id AND external_user_id = NEW.external_user_id
     AND conversation_id IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_inbox_conv_link_referrals ON public.inbox_conversations;
CREATE TRIGGER trg_inbox_conv_link_referrals AFTER INSERT ON public.inbox_conversations
  FOR EACH ROW EXECUTE FUNCTION public.inbox_conv_link_referrals();

-- ── phone number typed in chat → contact_phone ──────────────────────
CREATE OR REPLACE FUNCTION public.inbox_extract_bd_phone(_body text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (regexp_match(
    regexp_replace(translate(coalesce(_body, ''), '০১২৩৪৫৬৭৮৯', '0123456789'), '[\s\-\.]', '', 'g'),
    '(?:\+?88)?(01[3-9][0-9]{8})(?![0-9])'))[1];
$$;

CREATE OR REPLACE FUNCTION public.inbox_msg_capture_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p text;
BEGIN
  IF NEW.direction <> 'in' OR NEW.body IS NULL THEN RETURN NULL; END IF;
  p := public.inbox_extract_bd_phone(NEW.body);
  IF p IS NOT NULL THEN
    UPDATE public.inbox_conversations SET contact_phone = p
     WHERE id = NEW.conversation_id AND contact_phone IS NULL;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_inbox_msg_capture_phone ON public.inbox_messages;
CREATE TRIGGER trg_inbox_msg_capture_phone AFTER INSERT ON public.inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.inbox_msg_capture_phone();

-- ── orders ↔ chat ───────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inbox_conversation_id uuid REFERENCES public.inbox_conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_inbox_conversation_idx
  ON public.orders (inbox_conversation_id) WHERE inbox_conversation_id IS NOT NULL;

-- Copy a chat's ad onto an order that has no tracking of its own.
CREATE OR REPLACE FUNCTION public.inbox_apply_ad_to_order(_conv uuid, INOUT o public.orders)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; a record;
BEGIN
  IF coalesce(o.fb_ad_id, '') <> '' OR coalesce(o.fbclid, '') <> '' OR coalesce(o.utm_campaign, '') <> '' THEN
    RETURN;
  END IF;
  SELECT ad_id, ad_title, ad_at, platform INTO c FROM public.inbox_conversations WHERE id = _conv;
  IF c.ad_id IS NULL OR c.ad_at < coalesce(o.created_at, now()) - interval '30 days' THEN RETURN; END IF;
  SELECT ad.external_id AS ad_ext, st.external_id AS adset_ext, cp.external_id AS camp_ext, cp.name AS camp_name
    INTO a
    FROM public.mkt_ads ad
    LEFT JOIN public.mkt_adsets st ON st.id = ad.adset_id
    LEFT JOIN public.mkt_campaigns cp ON cp.id = ad.campaign_id
   WHERE ad.external_id = c.ad_id
   LIMIT 1;
  o.fb_ad_id := c.ad_id;
  o.fb_adset_id := coalesce(o.fb_adset_id, a.adset_ext);
  o.fb_campaign_id := coalesce(o.fb_campaign_id, a.camp_ext);
  o.utm_source := coalesce(o.utm_source, CASE c.platform WHEN 'instagram' THEN 'instagram' WHEN 'whatsapp' THEN 'whatsapp' ELSE 'facebook' END);
  o.utm_medium := coalesce(o.utm_medium, 'message_ad');
  o.utm_content := coalesce(o.utm_content, left(c.ad_title, 200));
END $$;

CREATE OR REPLACE FUNCTION public.orders_link_inbox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text;
BEGIN
  IF NEW.inbox_conversation_id IS NULL AND NEW.brand_id IS NOT NULL THEN
    k := public.inbox_phone_key(coalesce(NEW.shipping_phone, NEW.guest_phone));
    IF k IS NOT NULL THEN
      SELECT id INTO NEW.inbox_conversation_id FROM public.inbox_conversations
       WHERE brand_id = NEW.brand_id AND contact_phone IS NOT NULL
         AND public.inbox_phone_key(contact_phone) = k
         AND coalesce(last_inbound_at, last_message_at, created_at) > now() - interval '30 days'
       ORDER BY (ad_id IS NOT NULL) DESC, last_message_at DESC NULLS LAST
       LIMIT 1;
    END IF;
  END IF;
  IF NEW.inbox_conversation_id IS NOT NULL THEN
    NEW := public.inbox_apply_ad_to_order(NEW.inbox_conversation_id, NEW);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_link_inbox ON public.orders;
CREATE TRIGGER trg_orders_link_inbox BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_link_inbox();

-- Phone found in chat after the order was already made → link recent orders.
CREATE OR REPLACE FUNCTION public.inbox_conv_link_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text; o public.orders%ROWTYPE; patched public.orders%ROWTYPE;
BEGIN
  k := public.inbox_phone_key(NEW.contact_phone);
  IF k IS NULL THEN RETURN NULL; END IF;
  FOR o IN
    SELECT * FROM public.orders
     WHERE brand_id = NEW.brand_id AND inbox_conversation_id IS NULL
       AND created_at > greatest(NEW.created_at - interval '1 day', now() - interval '30 days')
       AND (public.inbox_phone_key(shipping_phone) = k OR public.inbox_phone_key(guest_phone) = k)
  LOOP
    patched := public.inbox_apply_ad_to_order(NEW.id, o);
    UPDATE public.orders SET
      inbox_conversation_id = NEW.id,
      fb_ad_id = patched.fb_ad_id, fb_adset_id = patched.fb_adset_id, fb_campaign_id = patched.fb_campaign_id,
      utm_source = patched.utm_source, utm_medium = patched.utm_medium, utm_content = patched.utm_content
     WHERE id = o.id;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_inbox_conv_link_orders ON public.inbox_conversations;
CREATE TRIGGER trg_inbox_conv_link_orders AFTER INSERT OR UPDATE OF contact_phone ON public.inbox_conversations
  FOR EACH ROW WHEN (NEW.contact_phone IS NOT NULL) EXECUTE FUNCTION public.inbox_conv_link_orders();

-- ── per-ad report ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inbox_ad_report(_brand_ids uuid[], _from timestamptz, _to timestamptz)
RETURNS TABLE (
  ad_id text, ad_name text, campaign_name text, thumbnail text, brand_id uuid,
  chats int, replied int, unreplied int, median_reply_min numeric,
  orders int, delivered int, revenue numeric, spend numeric, meta_chats int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH brands AS (
  SELECT b FROM unnest(_brand_ids) b WHERE public.inbox_can_access(b)
),
clicks AS (
  SELECT r.brand_id, coalesce(r.ad_id, 'title:' || r.ad_title) AS ad_key, r.ad_id,
         max(r.ad_title) AS ad_title, max(r.photo_url) AS photo,
         r.channel_id, r.external_user_id, min(r.created_at) AS at
    FROM public.inbox_ad_referrals r
   WHERE r.brand_id IN (SELECT b FROM brands) AND r.created_at >= _from AND r.created_at < _to
   GROUP BY 1, 2, 3, r.channel_id, r.external_user_id
),
per_chat AS (
  SELECT k.*, cv.id AS conv_id,
    (SELECT min(m.created_at) FROM public.inbox_messages m
      WHERE m.conversation_id = cv.id AND m.direction = 'out' AND m.created_at >= k.at) AS first_reply
    FROM clicks k
    LEFT JOIN public.inbox_conversations cv
      ON cv.channel_id = k.channel_id AND cv.external_user_id = k.external_user_id
),
chat_agg AS (
  SELECT brand_id, ad_key, max(ad_id) AS ad_id, max(ad_title) AS ad_title, max(photo) AS photo,
         count(*)::int AS chats,
         count(first_reply)::int AS replied,
         (count(*) - count(first_reply))::int AS unreplied,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_reply - at) / 60))::numeric, 1) AS median_reply_min
    FROM per_chat GROUP BY 1, 2
),
ord AS (
  SELECT o.brand_id, o.fb_ad_id AS ad_key,
         count(*) FILTER (WHERE o.status::text NOT IN ('cancelled','fake','incomplete'))::int AS orders,
         count(*) FILTER (WHERE o.status::text IN ('delivered','partial_delivered','completed','paid'))::int AS delivered,
         coalesce(sum(o.total) FILTER (WHERE o.status::text NOT IN ('cancelled','fake','incomplete')), 0) AS revenue
    FROM public.orders o
   WHERE o.brand_id IN (SELECT b FROM brands) AND o.inbox_conversation_id IS NOT NULL
     AND o.fb_ad_id IS NOT NULL AND o.created_at >= _from AND o.created_at < _to
   GROUP BY 1, 2
),
ins AS (
  SELECT ad.brand_id, ad.external_id AS ad_key, sum(i.spend) AS spend,
         sum(coalesce((SELECT (x->>'value')::numeric FROM jsonb_array_elements(i.raw->'actions') x
                        WHERE x->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'), 0))::int AS meta_chats
    FROM public.mkt_insights_daily i
    JOIN public.mkt_ads ad ON ad.id = i.ad_id
   WHERE ad.brand_id IN (SELECT b FROM brands)
     AND i.date >= (_from AT TIME ZONE 'Asia/Dhaka')::date
     AND i.date <= ((_to - interval '1 second') AT TIME ZONE 'Asia/Dhaka')::date
   GROUP BY 1, 2
),
keys AS (
  SELECT brand_id, ad_key FROM chat_agg
  UNION SELECT brand_id, ad_key FROM ord
  UNION SELECT brand_id, ad_key FROM ins WHERE meta_chats > 0
)
SELECT
  coalesce(c.ad_id, CASE WHEN k.ad_key NOT LIKE 'title:%' THEN k.ad_key END) AS ad_id,
  coalesce(ad.name, c.ad_title, k.ad_key) AS ad_name,
  cp.name AS campaign_name,
  coalesce(ad.creative_thumbnail, c.photo) AS thumbnail,
  k.brand_id,
  coalesce(c.chats, 0), coalesce(c.replied, 0), coalesce(c.unreplied, 0), c.median_reply_min,
  coalesce(o.orders, 0), coalesce(o.delivered, 0), coalesce(o.revenue, 0),
  coalesce(i.spend, 0), coalesce(i.meta_chats, 0)
FROM keys k
LEFT JOIN chat_agg c ON c.brand_id = k.brand_id AND c.ad_key = k.ad_key
LEFT JOIN ord o ON o.brand_id = k.brand_id AND o.ad_key = k.ad_key
LEFT JOIN ins i ON i.brand_id = k.brand_id AND i.ad_key = k.ad_key
LEFT JOIN public.mkt_ads ad ON ad.external_id = k.ad_key AND ad.brand_id = k.brand_id
LEFT JOIN public.mkt_campaigns cp ON cp.id = ad.campaign_id
ORDER BY coalesce(c.chats, 0) DESC, coalesce(i.meta_chats, 0) DESC;
$$;
REVOKE ALL ON FUNCTION public.inbox_ad_report(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_ad_report(uuid[], timestamptz, timestamptz) TO authenticated;

-- ── backfill phones already typed in chat (links matching recent orders) ──
UPDATE public.inbox_conversations cv SET contact_phone = p.phone
  FROM (
    SELECT DISTINCT ON (m.conversation_id) m.conversation_id, public.inbox_extract_bd_phone(m.body) AS phone
      FROM public.inbox_messages m
     WHERE m.direction = 'in' AND public.inbox_extract_bd_phone(m.body) IS NOT NULL
     ORDER BY m.conversation_id, m.created_at DESC
  ) p
 WHERE cv.id = p.conversation_id AND cv.contact_phone IS NULL;
