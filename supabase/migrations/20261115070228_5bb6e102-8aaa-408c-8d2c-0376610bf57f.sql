-- Allow shared (all-brand) expenses: brand_id NULL means "shared across brands"
ALTER TABLE public.erp_transactions ALTER COLUMN brand_id DROP NOT NULL;

-- Finance staff can create/update/delete shared transactions (brand_id NULL)
DROP POLICY IF EXISTS "Finance staff create transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff create transactions" ON public.erp_transactions
  FOR INSERT WITH CHECK (
    is_finance_staff((SELECT auth.uid()))
    AND (brand_id IS NULL OR can_access_brand((SELECT auth.uid()), brand_id))
  );

DROP POLICY IF EXISTS "Finance staff update transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff update transactions" ON public.erp_transactions
  FOR UPDATE USING (
    is_finance_staff((SELECT auth.uid()))
    AND (brand_id IS NULL OR can_access_brand((SELECT auth.uid()), brand_id))
  ) WITH CHECK (
    is_finance_staff((SELECT auth.uid()))
    AND (brand_id IS NULL OR can_access_brand((SELECT auth.uid()), brand_id))
  );

DROP POLICY IF EXISTS "Finance staff delete transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff delete transactions" ON public.erp_transactions
  FOR DELETE USING (
    is_finance_staff((SELECT auth.uid()))
    AND (brand_id IS NULL OR can_access_brand((SELECT auth.uid()), brand_id))
  );