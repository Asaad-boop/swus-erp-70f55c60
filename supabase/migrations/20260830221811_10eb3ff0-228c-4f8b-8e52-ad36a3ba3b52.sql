
create or replace function public.growth_retention_summary(_brand_ids uuid[], _from date, _to date)
returns table(
  customers bigint, new_customers bigint, repeat_customers bigint, repeat_rate numeric,
  orders bigint, avg_orders_per_customer numeric, revenue numeric, avg_ltv numeric,
  median_gap_days numeric, multi_item_order_pct numeric, aov_single numeric, aov_multi numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with base as (
  select o.id, o.total,
         nullif(right(regexp_replace(coalesce(o.shipping_phone, o.guest_phone, ''), '\D', '', 'g'), 11), '') as ph,
         (o.created_at at time zone 'Asia/Dhaka')::date as d,
         o.created_at
  from public.orders o
  where o.status in ('delivered','partial_delivered','completed','paid')
    and (_brand_ids is null or o.brand_id = any(_brand_ids))
),
win as (select * from base where ph is not null and d >= _from and d <= _to),
allc as (select ph, min(d) as first_d, count(*) as n from base where ph is not null group by ph),
per as (
  select w.ph, count(*) as n, sum(w.total) as spend, min(a.first_d) as first_d
  from win w join allc a on a.ph = w.ph group by w.ph
),
gaps as (
  select ph, extract(epoch from (created_at - lag(created_at) over (partition by ph order by created_at)))/86400 as gap
  from base where ph is not null
),
items as (
  select w.id, w.total, count(oi.id) as line_count
  from win w left join public.order_items oi on oi.order_id = w.id and coalesce(oi.is_combo_child,false) = false
  group by w.id, w.total
)
select
  (select count(*) from per)::bigint,
  (select count(*) from per where first_d >= _from)::bigint,
  (select count(*) from per where n > 1)::bigint,
  case when (select count(*) from per) > 0
    then round((select count(*) from per where n > 1)::numeric * 100 / (select count(*) from per), 2) end,
  (select count(*) from win)::bigint,
  case when (select count(*) from per) > 0
    then round((select count(*) from win)::numeric / (select count(*) from per), 2) end,
  coalesce((select sum(total) from win), 0),
  case when (select count(*) from per) > 0
    then round(coalesce((select sum(spend) from per),0) / (select count(*) from per), 2) end,
  (select round(percentile_cont(0.5) within group (order by gap)::numeric, 1) from gaps where gap is not null),
  case when (select count(*) from items) > 0
    then round((select count(*) from items where line_count > 1)::numeric * 100 / (select count(*) from items), 2) end,
  (select round(avg(total), 2) from items where line_count <= 1),
  (select round(avg(total), 2) from items where line_count > 1)
$$;

create or replace function public.growth_winback(_brand_ids uuid[], _min_days integer, _limit integer)
returns table(
  phone text, name text, orders bigint, total_spent numeric,
  last_order_at timestamptz, days_since integer, last_product text
)
language sql
stable
security invoker
set search_path = public
as $$
with base as (
  select o.id, o.total, o.created_at,
         nullif(right(regexp_replace(coalesce(o.shipping_phone, o.guest_phone, ''), '\D', '', 'g'), 11), '') as ph,
         coalesce(o.shipping_name, o.guest_name) as nm
  from public.orders o
  where o.status in ('delivered','partial_delivered','completed','paid')
    and (_brand_ids is null or o.brand_id = any(_brand_ids))
),
agg as (
  select ph,
         (array_agg(nm order by created_at desc))[1] as nm,
         count(*) as n, sum(total) as spend, max(created_at) as last_at,
         (array_agg(id order by created_at desc))[1] as last_order_id
  from base where ph is not null group by ph
)
select a.ph, a.nm, a.n, a.spend, a.last_at,
       (extract(epoch from (now() - a.last_at))/86400)::int,
       (select oi.name from public.order_items oi where oi.order_id = a.last_order_id order by oi.line_total desc nulls last limit 1)
from agg a
where (extract(epoch from (now() - a.last_at))/86400)::int >= coalesce(_min_days, 45)
order by a.spend desc
limit coalesce(_limit, 100)
$$;

create or replace function public.growth_copurchase(_brand_ids uuid[], _from date, _to date, _limit integer)
returns table(
  product_a uuid, name_a text, product_b uuid, name_b text,
  pair_orders bigint, a_orders bigint, attach_rate numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with win as (
  select o.id from public.orders o
  where o.status not in ('cancelled','fake','incomplete')
    and (_brand_ids is null or o.brand_id = any(_brand_ids))
    and (o.created_at at time zone 'Asia/Dhaka')::date between _from and _to
),
li as (
  select distinct oi.order_id, oi.product_id, oi.name
  from public.order_items oi join win w on w.id = oi.order_id
  where oi.product_id is not null and coalesce(oi.is_combo_child,false) = false
),
cnt as (select product_id, count(distinct order_id) as n from li group by product_id),
pairs as (
  select a.product_id as pa, max(a.name) as na, b.product_id as pb, max(b.name) as nb,
         count(distinct a.order_id) as pair_n
  from li a join li b on a.order_id = b.order_id and a.product_id < b.product_id
  group by a.product_id, b.product_id
)
select p.pa, p.na, p.pb, p.nb, p.pair_n, c.n,
       case when c.n > 0 then round(p.pair_n::numeric * 100 / c.n, 1) end
from pairs p join cnt c on c.product_id = p.pa
where p.pair_n > 1
order by p.pair_n desc
limit coalesce(_limit, 30)
$$;

grant execute on function public.growth_retention_summary(uuid[], date, date) to authenticated, service_role;
grant execute on function public.growth_winback(uuid[], integer, integer) to authenticated, service_role;
grant execute on function public.growth_copurchase(uuid[], date, date, integer) to authenticated, service_role;
