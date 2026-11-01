REVOKE EXECUTE ON FUNCTION public.hr_log_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_validate_leave() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_can_decide_leave(uuid) FROM PUBLIC, anon;