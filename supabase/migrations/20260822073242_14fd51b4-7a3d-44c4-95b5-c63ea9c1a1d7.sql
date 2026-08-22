ALTER TABLE public.imp_po_releases
  ADD COLUMN IF NOT EXISTS qc_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS qc_at timestamptz,
  ADD COLUMN IF NOT EXISTS qc_by uuid,
  ADD COLUMN IF NOT EXISTS qc_notes text;

ALTER TABLE public.imp_po_release_items
  ADD COLUMN IF NOT EXISTS qc_good_qty integer,
  ADD COLUMN IF NOT EXISTS qc_damaged_qty integer,
  ADD COLUMN IF NOT EXISTS qc_extra_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qc_movement_id uuid;