ALTER TABLE public.hub_product_ideas
  ADD COLUMN IF NOT EXISTS imp_po_id uuid REFERENCES public.imp_purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_product_ideas_imp_po ON public.hub_product_ideas(imp_po_id);