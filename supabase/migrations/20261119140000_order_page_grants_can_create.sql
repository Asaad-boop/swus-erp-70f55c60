-- Staff whose custom page grants include the order pages can create orders
-- (New Order page) and edit their items/notes, within their brand scope.
-- Previously only admin / customer_service / operations roles could insert,
-- so page-granted staff (e.g. employee role + "New order") hit an RLS error.

CREATE OR REPLACE FUNCTION public.staff_can_edit_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.staff_has_explicit_page(
    auth.uid(),
    ARRAY['/erp/orders','/erp/orders/new','/erp/orders/list','/erp/orders/web','/erp/orders/pre-orders'],
    (SELECT brand_id FROM public.orders WHERE id = _order_id));
$$;
REVOKE EXECUTE ON FUNCTION public.staff_can_edit_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_order(uuid) TO authenticated, service_role;

CREATE POLICY "Custom order pages create orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (private.staff_has_explicit_page((SELECT auth.uid()), ARRAY['/erp/orders/new'], brand_id));

CREATE POLICY "Custom order pages insert order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_edit_order(order_id));
CREATE POLICY "Custom order pages update order items" ON public.order_items FOR UPDATE TO authenticated
  USING (public.staff_can_edit_order(order_id)) WITH CHECK (public.staff_can_edit_order(order_id));
CREATE POLICY "Custom order pages delete order items" ON public.order_items FOR DELETE TO authenticated
  USING (public.staff_can_edit_order(order_id));

CREATE POLICY "Custom order pages add notes" ON public.order_notes FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_edit_order(order_id));
