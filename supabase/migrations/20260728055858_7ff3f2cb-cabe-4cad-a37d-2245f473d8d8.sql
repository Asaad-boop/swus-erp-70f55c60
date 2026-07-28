update public.orders
set status = 'confirmed',
    confirmation_status = coalesce(confirmation_status, 'pending'),
    confirmed_at = coalesce(confirmed_at, updated_at)
where id = '59894278-b4e0-4493-be62-87796ac55c9d' and status = 'new';