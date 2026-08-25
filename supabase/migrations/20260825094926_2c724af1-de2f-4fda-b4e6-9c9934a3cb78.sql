ALTER TABLE public.imp_cartons
  ADD COLUMN IF NOT EXISTS shipping_rate_per_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_freight_bdt numeric,
  ADD COLUMN IF NOT EXISTS shipping_billed_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipping_note text;

COMMENT ON COLUMN public.imp_cartons.shipping_freight_bdt IS 'Actual CN->BD freight billed for this specific carton lot. NULL = not billed yet (falls back to PO-level planned shipping share).';