
REVOKE EXECUTE ON FUNCTION public.is_finance_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_finance_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finance_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid, uuid) TO authenticated;
