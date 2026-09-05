
-- Helper: finance staff (admin/owner/accountant/operations)
CREATE OR REPLACE FUNCTION public.is_finance_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'owner'::app_role)
      OR public.has_role(_uid, 'operations'::app_role)
      OR public.has_role(_uid, 'accountant'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_finance_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'owner'::app_role);
$$;

-- Brand scope: no explicit brand rows = all brands; null brand rows are shared
CREATE OR REPLACE FUNCTION public.can_access_brand(_uid uuid, _brand uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL
     AND (
       public.is_finance_admin(_uid)
       OR _brand IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _uid)
       OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _uid AND brand_id = _brand)
     );
$$;

GRANT EXECUTE ON FUNCTION public.is_finance_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid, uuid) TO authenticated;

-- ===== erp_accounts =====
DROP POLICY IF EXISTS "Staff view accounts" ON public.erp_accounts;
CREATE POLICY "Staff view accounts" ON public.erp_accounts
FOR SELECT TO authenticated
USING (
  public.is_finance_staff((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'customer_service'::app_role)
);

DROP POLICY IF EXISTS "Finance staff update accounts" ON public.erp_accounts;
CREATE POLICY "Finance staff update accounts" ON public.erp_accounts
FOR UPDATE TO authenticated
USING (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id))
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance staff create accounts" ON public.erp_accounts;
CREATE POLICY "Finance staff create accounts" ON public.erp_accounts
FOR INSERT TO authenticated
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

-- ===== erp_transactions =====
DROP POLICY IF EXISTS "Staff view transactions" ON public.erp_transactions;
CREATE POLICY "Staff view transactions" ON public.erp_transactions
FOR SELECT TO authenticated
USING (
  public.is_finance_staff((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'customer_service'::app_role)
);

DROP POLICY IF EXISTS "Finance staff create transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff create transactions" ON public.erp_transactions
FOR INSERT TO authenticated
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance staff update transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff update transactions" ON public.erp_transactions
FOR UPDATE TO authenticated
USING (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id))
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "Finance staff delete transactions" ON public.erp_transactions;
CREATE POLICY "Finance staff delete transactions" ON public.erp_transactions
FOR DELETE TO authenticated
USING (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

-- ===== erp_expense_categories =====
DROP POLICY IF EXISTS "Staff view expense categories" ON public.erp_expense_categories;
CREATE POLICY "Staff view expense categories" ON public.erp_expense_categories
FOR SELECT TO authenticated
USING (
  public.is_finance_staff((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'customer_service'::app_role)
);

DROP POLICY IF EXISTS "Finance staff manage expense categories" ON public.erp_expense_categories;
CREATE POLICY "Finance staff manage expense categories" ON public.erp_expense_categories
FOR INSERT TO authenticated
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

-- ===== journal =====
DROP POLICY IF EXISTS "Admins/ops manage entries" ON public.erp_journal_entries;
CREATE POLICY "Finance staff manage entries" ON public.erp_journal_entries
FOR ALL TO authenticated
USING (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id))
WITH CHECK (public.is_finance_staff((SELECT auth.uid())) AND public.can_access_brand((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "Admins/ops manage lines" ON public.erp_journal_lines;
CREATE POLICY "Finance staff manage lines" ON public.erp_journal_lines
FOR ALL TO authenticated
USING (public.is_finance_staff((SELECT auth.uid())))
WITH CHECK (public.is_finance_staff((SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_expense_categories TO authenticated;
