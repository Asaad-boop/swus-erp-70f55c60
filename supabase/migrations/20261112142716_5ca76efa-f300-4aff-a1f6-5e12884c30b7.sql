CREATE TABLE public.mkt_meta_oauth_sessions (
  user_id uuid PRIMARY KEY,
  access_token text NOT NULL,
  expires_at timestamptz,
  fb_user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mkt_meta_oauth_sessions TO service_role;
ALTER TABLE public.mkt_meta_oauth_sessions ENABLE ROW LEVEL SECURITY;