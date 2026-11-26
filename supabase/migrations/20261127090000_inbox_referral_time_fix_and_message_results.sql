-- Message-ad leads were landing with 1970 dates: Meta sends the
-- messaging_referrals (OPEN_THREAD) timestamp in seconds, not milliseconds.
-- Those clicks dropped out of every date-filtered report, never triggered the
-- ad auto-reply, and orders from those chats lost their campaign.
-- Also: message campaigns' result ("messaging conversations started") was
-- never stored, so campaigns showed 0 leads.

-- 1. Read a seconds-based time correctly, everywhere it comes in.
CREATE OR REPLACE FUNCTION public.inbox_fix_ts(_t timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _t IS NULL THEN NULL
    WHEN _t < '2001-01-01'::timestamptz THEN to_timestamp(extract(epoch FROM _t) * 1000)
    ELSE _t
  END
$$;

CREATE OR REPLACE FUNCTION public.inbox_record_referral(_channel_id uuid, _external_user_id text, _ad_id text, _ad_title text, _photo text, _post_id text, _source text, _ref text, _ctwa_clid text, _payload jsonb, _at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ch public.inbox_channels%ROWTYPE;
  conv uuid;
  at_ts timestamptz := least(coalesce(public.inbox_fix_ts(_at), now()), now() + interval '5 minutes');
BEGIN
  IF coalesce(_ad_id, '') = '' AND coalesce(_ad_title, '') = '' THEN RETURN; END IF;
  SELECT * INTO ch FROM public.inbox_channels WHERE id = _channel_id;
  IF NOT FOUND THEN RETURN; END IF;
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
      ad_first_at = least(coalesce(ad_first_at, at_ts), at_ts),
      ad_at = greatest(coalesce(ad_at, at_ts), at_ts),
      ad_count = ad_count + 1
    WHERE id = conv;
  END IF;
END $function$;

-- 2. Repair what already came in.
UPDATE public.inbox_ad_referrals
   SET created_at = public.inbox_fix_ts(created_at)
 WHERE created_at < '2001-01-01';

UPDATE public.inbox_conversations c
   SET ad_at = r.last_at,
       ad_first_at = least(coalesce(public.inbox_fix_ts(c.ad_first_at), r.first_at), r.first_at)
  FROM (
    SELECT conversation_id, max(created_at) AS last_at, min(created_at) AS first_at
      FROM public.inbox_ad_referrals
     WHERE conversation_id IS NOT NULL
     GROUP BY conversation_id
  ) r
 WHERE r.conversation_id = c.id
   AND (c.ad_at < '2001-01-01' OR c.ad_first_at < '2001-01-01');

UPDATE public.inbox_conversations
   SET ad_at = public.inbox_fix_ts(ad_at), ad_first_at = public.inbox_fix_ts(ad_first_at)
 WHERE ad_at < '2001-01-01' OR ad_first_at < '2001-01-01';

-- 3. Give chat orders that lost their ad the campaign back (fires the attribution trigger).
DO $$
DECLARE r public.orders; o2 public.orders;
BEGIN
  FOR r IN
    SELECT o.* FROM public.orders o
      JOIN public.inbox_conversations c ON c.id = o.inbox_conversation_id
     WHERE c.ad_id IS NOT NULL
       AND coalesce(o.fb_ad_id, '') = '' AND coalesce(o.fbclid, '') = '' AND coalesce(o.utm_campaign, '') = ''
       AND o.created_at > now() - interval '45 days'
  LOOP
    o2 := public.inbox_apply_ad_to_order(r.inbox_conversation_id, r);
    IF coalesce(o2.fb_ad_id, '') <> '' THEN
      UPDATE public.orders SET
        fb_ad_id = o2.fb_ad_id, fb_adset_id = o2.fb_adset_id, fb_campaign_id = o2.fb_campaign_id,
        utm_source = o2.utm_source, utm_medium = o2.utm_medium, utm_content = o2.utm_content
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 4. Store message-campaign results ("messaging conversations started").
ALTER TABLE public.mkt_insights_daily
  ADD COLUMN IF NOT EXISTS meta_messages integer NOT NULL DEFAULT 0;

UPDATE public.mkt_insights_daily i
   SET meta_messages = coalesce((
     SELECT (x->>'value')::numeric::int
       FROM jsonb_array_elements(coalesce(i.raw->'actions', '[]'::jsonb)) x
      WHERE x->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'
      LIMIT 1), 0)
 WHERE i.raw ? 'actions';
