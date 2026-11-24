-- Instant reply for chats that start from a message ad.
-- One row per brand (ad_id NULL = every ad of the brand) or per specific ad.
CREATE TABLE IF NOT EXISTS public.inbox_ad_autoreplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_id text,
  ad_name text,
  body text NOT NULL,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_ad_autoreplies_uniq
  ON public.inbox_ad_autoreplies (brand_id, coalesce(ad_id, ''));

ALTER TABLE public.inbox_ad_autoreplies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_ad_autoreplies_all ON public.inbox_ad_autoreplies;
CREATE POLICY inbox_ad_autoreplies_all ON public.inbox_ad_autoreplies
  FOR ALL TO authenticated
  USING (public.inbox_can_access(brand_id))
  WITH CHECK (public.inbox_can_access(brand_id));

ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS ad_autoreplied_at timestamptz;

-- Webhook claims the auto-reply for one ad click exactly once (concurrent webhooks safe).
CREATE OR REPLACE FUNCTION public.inbox_claim_ad_autoreply(_conversation_id uuid)
RETURNS TABLE (id uuid, body text, image_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.inbox_conversations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.inbox_conversations WHERE inbox_conversations.id = _conversation_id;
  IF NOT FOUND OR c.ad_at IS NULL OR c.ad_at < now() - interval '30 minutes' THEN RETURN; END IF;
  IF c.ad_autoreplied_at IS NOT NULL AND c.ad_autoreplied_at >= c.ad_at - interval '12 hours' THEN RETURN; END IF;
  -- A human already answered since the click → stay quiet.
  IF EXISTS (SELECT 1 FROM public.inbox_messages m
              WHERE m.conversation_id = c.id AND m.direction = 'out' AND m.created_at >= c.ad_at) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH pick AS (
    SELECT a.id, a.body, a.image_url FROM public.inbox_ad_autoreplies a
     WHERE a.brand_id = c.brand_id AND a.is_active
       AND (a.ad_id = c.ad_id OR a.ad_id IS NULL)
     ORDER BY (a.ad_id IS NULL) LIMIT 1
  ), claim AS (
    UPDATE public.inbox_conversations SET ad_autoreplied_at = now()
     WHERE inbox_conversations.id = c.id
       AND (ad_autoreplied_at IS NULL OR ad_autoreplied_at < c.ad_at - interval '12 hours')
       AND EXISTS (SELECT 1 FROM pick)
    RETURNING inbox_conversations.id
  ), bump AS (
    UPDATE public.inbox_ad_autoreplies SET sent_count = sent_count + 1
     WHERE inbox_ad_autoreplies.id = (SELECT pick.id FROM pick) AND EXISTS (SELECT 1 FROM claim)
    RETURNING 1
  )
  SELECT pick.id, pick.body, pick.image_url FROM pick WHERE EXISTS (SELECT 1 FROM claim);
END $$;
REVOKE ALL ON FUNCTION public.inbox_claim_ad_autoreply(uuid) FROM PUBLIC, anon, authenticated;
