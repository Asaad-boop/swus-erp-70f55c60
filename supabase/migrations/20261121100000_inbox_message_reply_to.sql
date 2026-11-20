ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta jsonb;
COMMENT ON COLUMN public.inbox_messages.reply_to IS 'Message this one quotes (e.g. price reply to a customer photo)';
COMMENT ON COLUMN public.inbox_messages.meta IS 'Extra info, e.g. {"product_id": "...", "attachment_index": 0}';
