-- 1) reviews: remove public read of approved reviews (exposed guest_name/guest_phone).
-- Staff + owner policies remain ('reviews staff and owner read'). Storefront does not query this table directly.
DROP POLICY IF EXISTS "anyone read approved reviews" ON public.reviews;
REVOKE SELECT ON public.reviews FROM anon;

-- 2) active_sessions: drop open anon write policies (tracking goes through server-side mkt_ingest_track with service role)
DROP POLICY IF EXISTS "anyone insert presence" ON public.active_sessions;
DROP POLICY IF EXISTS "anyone update presence" ON public.active_sessions;
REVOKE INSERT, UPDATE ON public.active_sessions FROM anon;

-- 3) hub_idea_votes: scope SELECT to own votes or votes on ideas from brands the user can access
DROP POLICY IF EXISTS "hub votes readable" ON public.hub_idea_votes;
CREATE POLICY "hub votes readable" ON public.hub_idea_votes
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.hub_product_ideas i
    WHERE i.id = hub_idea_votes.idea_id
      AND has_brand_access(i.brand_id, auth.uid())
  )
);

-- 4) mkt_ad_account_brands: restrict SELECT to marketing staff
DROP POLICY IF EXISTS "Auth users can read ad account brand links" ON public.mkt_ad_account_brands;
CREATE POLICY "Marketing staff can read ad account brand links" ON public.mkt_ad_account_brands
FOR SELECT TO authenticated
USING (
  is_marketing_staff(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operations'::app_role)
);