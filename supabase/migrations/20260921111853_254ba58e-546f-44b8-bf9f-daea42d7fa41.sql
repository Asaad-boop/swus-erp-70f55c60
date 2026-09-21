create or replace function public.inv_reserve_status(_brand_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _ok boolean;
begin
  select coalesce(bool_or(public.has_role(auth.uid(), r)), false) into _ok
  from unnest(array['admin','owner','operations','warehouse_staff','packer','customer_service','accountant']::public.app_role[]) as r;
  if not _ok then
    raise exception 'Not authorized';
  end if;

  return (
    with buckets(bucket, ord, statuses, reserved) as (
      values
        ('pending',   1, array['new','advance_payment_pending','on_hold','incomplete']::public.order_status[], false),
        ('confirmed', 2, array['confirmed']::public.order_status[], false),
        ('packing',   3, array['packaging','ready_to_pack']::public.order_status[], true),
        ('packed',    4, array['packed','ready_to_ship','courier_entry']::public.order_status[], true),
        ('shipped',   5, array['shipped','in_transit']::public.order_status[], false)
    ),
    agg as (
      select
        b.bucket,
        b.ord,
        b.reserved,
        count(distinct o.id) as orders,
        coalesce(sum(oi.quantity), 0)::bigint as units
      from buckets b
      left join public.orders o
        on o.status = any(b.statuses)
       and (_brand_id is null or o.brand_id = _brand_id)
      left join public.order_items oi
        on oi.order_id = o.id
       and coalesce(oi.is_combo_child, false) = false
      group by b.bucket, b.ord, b.reserved
    )
    select jsonb_build_object(
      'buckets', coalesce(jsonb_agg(jsonb_build_object(
        'key', bucket,
        'orders', orders,
        'units', units,
        'reserved', reserved
      ) order by ord), '[]'::jsonb),
      'total_reserved_units', coalesce((select sum(units) from agg where reserved), 0),
      'total_reserved_orders', coalesce((select sum(orders) from agg where reserved), 0)
    )
    from agg
  );
end;
$$;

revoke execute on function public.inv_reserve_status(uuid) from public, anon;
grant execute on function public.inv_reserve_status(uuid) to authenticated, service_role;