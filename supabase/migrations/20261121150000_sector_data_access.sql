-- Sectors in Staff & Access are backed by roles. Fill the read gaps so every
-- page a sector shows actually loads its data:
--   * warehouse_staff → stock movement history (Products & Stock page)
--   * marketing_manager → orders, order items and site events (attribution,
--     analytics, product & LTV pages)

CREATE POLICY "warehouse reads stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'warehouse_staff'::public.app_role)));

CREATE POLICY "marketing reads orders" ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'marketing_manager'::public.app_role)));

CREATE POLICY "marketing reads order items" ON public.order_items
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'marketing_manager'::public.app_role)));

CREATE POLICY "marketing reads analytics events" ON public.analytics_events
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'marketing_manager'::public.app_role)));
