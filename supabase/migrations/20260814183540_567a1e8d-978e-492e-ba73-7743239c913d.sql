ALTER TABLE public.content_plans ADD COLUMN IF NOT EXISTS content_style text;
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS content_style text;

COMMENT ON COLUMN public.content_plans.content_style IS 'Selected creative style for this content plan (e.g., UGC, lifestyle, demo, testimonial).';
COMMENT ON COLUMN public.content_items.content_style IS 'Creative style applied to this content item, inherited from the plan or set per item.';