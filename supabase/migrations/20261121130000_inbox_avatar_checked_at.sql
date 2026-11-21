ALTER TABLE public.inbox_conversations ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz;
