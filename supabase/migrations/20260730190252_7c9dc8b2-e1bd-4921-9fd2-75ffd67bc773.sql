CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  order_id uuid,
  preorder_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  template_key text,
  status text NOT NULL DEFAULT 'sent',
  provider_response text,
  segments integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_order ON public.sms_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone ON public.sms_logs (phone);

GRANT SELECT, INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs_select_auth" ON public.sms_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sms_logs_insert_auth" ON public.sms_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sms_logs_delete_admin" ON public.sms_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));