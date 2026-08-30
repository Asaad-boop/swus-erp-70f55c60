ALTER TABLE public.imp_po_release_items
  ADD CONSTRAINT imp_po_release_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.imp_po_release_items
  ADD CONSTRAINT imp_po_release_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.imp_po_release_items DROP CONSTRAINT IF EXISTS imp_po_release_items_quantity_check;
ALTER TABLE public.imp_po_release_items
  ADD CONSTRAINT imp_po_release_items_quantity_check CHECK (quantity >= 0);