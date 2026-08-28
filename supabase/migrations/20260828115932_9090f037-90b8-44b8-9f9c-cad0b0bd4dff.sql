UPDATE public.erp_return_cases c
SET created_at = COALESCE(o.return_received_at, o.updated_at, o.created_at)
FROM public.orders o
WHERE c.order_id = o.id AND c.note = 'Auto-created from courier return';