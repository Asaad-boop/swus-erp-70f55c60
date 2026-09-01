create or replace function public.growth_team_scoreboard(_brand_ids uuid[], _from date, _to date)
returns table (
  user_id uuid,
  name text,
  confirmed_orders bigint,
  confirmed_value numeric,
  delivered_orders bigint,
  delivered_value numeric,
  calls bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with conf as (
    select o.confirmed_by as uid,
           count(*)::bigint as confirmed_orders,
           coalesce(sum(o.total),0)::numeric as confirmed_value,
           count(*) filter (where o.status in ('delivered','completed','paid'))::bigint as delivered_orders,
           coalesce(sum(o.total) filter (where o.status in ('delivered','completed','paid')),0)::numeric as delivered_value
    from public.orders o
    where o.confirmed_by is not null
      and (_brand_ids is null or o.brand_id = any(_brand_ids))
      and (o.confirmed_at at time zone 'Asia/Dhaka')::date between _from and _to
    group by o.confirmed_by
  ),
  calls as (
    select o.last_called_by as uid, count(*)::bigint as calls
    from public.orders o
    where o.last_called_by is not null
      and (_brand_ids is null or o.brand_id = any(_brand_ids))
      and (o.last_call_at at time zone 'Asia/Dhaka')::date between _from and _to
    group by o.last_called_by
  ),
  ids as (select uid from conf union select uid from calls)
  select i.uid,
         coalesce(nullif(p.display_name,''), p.username, p.email, 'Unknown') as name,
         coalesce(c.confirmed_orders,0),
         coalesce(c.confirmed_value,0),
         coalesce(c.delivered_orders,0),
         coalesce(c.delivered_value,0),
         coalesce(cl.calls,0)
  from ids i
  left join conf c on c.uid = i.uid
  left join calls cl on cl.uid = i.uid
  left join public.profiles p on p.id = i.uid
  order by 3 desc, 7 desc;
$$;

revoke all on function public.growth_team_scoreboard(uuid[], date, date) from public, anon;
grant execute on function public.growth_team_scoreboard(uuid[], date, date) to authenticated, service_role;