-- ════════════════════════════════════════════════════════════════════
-- Inbox comments: Facebook page/ad post comments + Instagram comments.
--   inbox_posts     one row per post/media that got comments (preview info)
--   inbox_comments  every comment and reply (customer's and the page's own)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inbox_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.inbox_channels(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  external_post_id text NOT NULL,
  message text,
  permalink text,
  image_url text,
  is_ad boolean NOT NULL DEFAULT false,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_post_id)
);

CREATE TABLE IF NOT EXISTS public.inbox_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.inbox_channels(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  post_id uuid REFERENCES public.inbox_posts(id) ON DELETE SET NULL,
  external_comment_id text NOT NULL UNIQUE,
  external_parent_id text,          -- parent comment for replies (null = top-level)
  author_id text,
  author_name text,
  author_username text,
  is_from_page boolean NOT NULL DEFAULT false,
  body text,
  attachment_url text,
  is_hidden boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  replied_at timestamptz,           -- when the page answered (publicly or privately)
  private_replied_at timestamptz,
  replied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_comments_list_idx ON public.inbox_comments (brand_id, status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS inbox_comments_parent_idx ON public.inbox_comments (external_parent_id);
CREATE INDEX IF NOT EXISTS inbox_comments_post_idx ON public.inbox_comments (post_id, created_at);

ALTER TABLE public.inbox_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_posts_select ON public.inbox_posts;
CREATE POLICY inbox_posts_select ON public.inbox_posts
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));
DROP POLICY IF EXISTS inbox_comments_select ON public.inbox_comments;
CREATE POLICY inbox_comments_select ON public.inbox_comments
  FOR SELECT TO authenticated USING (public.inbox_can_access(brand_id));
DROP POLICY IF EXISTS inbox_comments_update ON public.inbox_comments;
CREATE POLICY inbox_comments_update ON public.inbox_comments
  FOR UPDATE TO authenticated USING (public.inbox_can_access(brand_id)) WITH CHECK (public.inbox_can_access(brand_id));

-- Staff may only change the workflow status from the browser; everything else goes through the edge function.
CREATE OR REPLACE FUNCTION public.inbox_comments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_status text := NEW.status;
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    NEW := OLD;
    NEW.status := new_status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inbox_comments_guard ON public.inbox_comments;
CREATE TRIGGER inbox_comments_guard BEFORE UPDATE ON public.inbox_comments
  FOR EACH ROW EXECUTE FUNCTION public.inbox_comments_guard();

-- Realtime for the comments list.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='inbox_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_comments;
  END IF;
END $$;
