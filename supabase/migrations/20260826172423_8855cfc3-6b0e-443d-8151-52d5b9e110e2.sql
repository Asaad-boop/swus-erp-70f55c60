ALTER TABLE public.imp_po_releases
  ADD COLUMN IF NOT EXISTS local_courier_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS local_courier_wallet_id uuid,
  ADD COLUMN IF NOT EXISTS local_courier_payment_id uuid,
  ADD COLUMN IF NOT EXISTS qc_local_courier_note text,
  ADD COLUMN IF NOT EXISTS local_courier_source text NOT NULL DEFAULT 'qc';

UPDATE public.imp_po_releases SET local_courier_source = 'release' WHERE created_at < now();

ALTER TABLE public.imp_po_releases
  DROP CONSTRAINT IF EXISTS imp_po_releases_local_courier_source_chk;
ALTER TABLE public.imp_po_releases
  ADD CONSTRAINT imp_po_releases_local_courier_source_chk
  CHECK (local_courier_source IN ('release','qc'));

ALTER TABLE public.imp_po_release_items
  ADD COLUMN IF NOT EXISTS final_unit_cost_bdt numeric,
  ADD COLUMN IF NOT EXISTS reserved_qty integer NOT NULL DEFAULT 0;