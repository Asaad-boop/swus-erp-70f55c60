-- AI key (Google Gemini) saved from inside the ERP, so it can be set without
-- touching Vercel. Nobody can read the key back: only the `ai-proxy` edge
-- function (service role) uses it. The ERP sees "set / last 4 digits".
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gemini_api_key text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: no direct reads or writes from the browser
INSERT INTO public.ai_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
REVOKE ALL ON public.ai_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_key_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT public.is_staff(auth.uid()) THEN '{}'::jsonb ELSE
    jsonb_build_object(
      'set', coalesce(length(gemini_api_key), 0) > 0,
      'last4', CASE WHEN length(gemini_api_key) > 4 THEN right(gemini_api_key, 4) END,
      'updated_at', updated_at)
  END
  FROM public.ai_settings WHERE id = 1
$$;

CREATE OR REPLACE FUNCTION public.ai_set_key(_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text := nullif(btrim(coalesce(_key, '')), '');
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'owner'::public.app_role)) THEN
    RAISE EXCEPTION 'Admin or owner only';
  END IF;
  IF k IS NOT NULL AND (length(k) < 30 OR length(k) > 200 OR k ~ '\s') THEN
    RAISE EXCEPTION 'Key thik nai — AI Studio theke pura key copy koro';
  END IF;
  UPDATE public.ai_settings SET gemini_api_key = k, updated_by = auth.uid(), updated_at = now() WHERE id = 1;
  RETURN public.ai_key_status();
END $$;

REVOKE ALL ON FUNCTION public.ai_set_key(text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_key_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_set_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_key_status() TO authenticated;
