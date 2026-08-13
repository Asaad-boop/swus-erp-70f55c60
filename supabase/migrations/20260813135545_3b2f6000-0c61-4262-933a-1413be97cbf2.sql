ALTER TABLE public.mkt_ad_accounts
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'meta';

DO $$ BEGIN
  ALTER TABLE public.mkt_ad_accounts
    ADD CONSTRAINT mkt_ad_accounts_platform_check
    CHECK (platform IN ('meta','google','tiktok'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mkt_ad_accounts_platform ON public.mkt_ad_accounts(platform);