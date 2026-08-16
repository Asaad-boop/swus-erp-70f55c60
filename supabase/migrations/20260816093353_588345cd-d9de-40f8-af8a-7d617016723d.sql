ALTER TABLE public.hub_product_ideas
  ADD COLUMN IF NOT EXISTS sourcing_review_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sourcing_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sourcing_submitted_by uuid,
  ADD COLUMN IF NOT EXISTS sourcing_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sourcing_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS sourcing_review_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_product_ideas_sourcing_review_status_chk'
  ) THEN
    ALTER TABLE public.hub_product_ideas
      ADD CONSTRAINT hub_product_ideas_sourcing_review_status_chk
      CHECK (sourcing_review_status IN ('draft','submitted','approved','rejected'));
  END IF;
END $$;

UPDATE public.hub_product_ideas
SET sourcing_review_status = 'approved',
    sourcing_reviewed_at = COALESCE(sourcing_reviewed_at, ordered_at, approved_at, now())
WHERE sourcing_review_status = 'draft'
  AND (imp_po_id IS NOT NULL OR status = 'ordered' OR selected_quote_id IS NOT NULL);