drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('owner','admin','moderator','operations','customer_service','packer','accountant','marketing_manager','warehouse_staff','hr_admin','hr_manager')
  )
);

create or replace function public.list_staff_profiles()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role <> 'customer'
  )
  order by p.display_name nulls last
$$;

grant execute on function public.list_staff_profiles() to authenticated;