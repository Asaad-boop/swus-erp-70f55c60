ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.inbox_messages.reactions IS '[{"by":"customer"|"page","emoji":"❤️","at":"..."}] — at most one per side';
