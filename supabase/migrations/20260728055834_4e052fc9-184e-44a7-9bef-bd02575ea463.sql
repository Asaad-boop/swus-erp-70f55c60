update public.orders
set status = 'confirmed',
    confirmation_status = coalesce(confirmation_status, 'pending'),
    confirmed_at = coalesce(confirmed_at, updated_at)
where id = '2df2fb23-bcd2-4590-a6fe-31487c63266e' and status = 'new';