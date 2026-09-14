create or replace function public.get_courier_creds(_provider text, _brand_id uuid default null)
returns table (
  brand_id uuid,
  base_url text,
  client_id text,
  client_secret text,
  username text,
  password text,
  store_id text,
  api_key text,
  secret_key text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'owner'::app_role)
    or has_role(auth.uid(), 'operations'::app_role)
    or has_role(auth.uid(), 'customer_service'::app_role)
    or has_role(auth.uid(), 'warehouse_staff'::app_role)
    or has_role(auth.uid(), 'packer'::app_role)
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select s.brand_id, s.base_url, s.client_id, s.client_secret, s.username, s.password,
         s.store_id::text, s.api_key, s.secret_key, s.is_active
  from public.erp_courier_settings s
  where s.provider = _provider
    and s.is_active = true
    and (_brand_id is null or true);
end;
$$;

revoke all on function public.get_courier_creds(text, uuid) from public, anon;
grant execute on function public.get_courier_creds(text, uuid) to authenticated, service_role;