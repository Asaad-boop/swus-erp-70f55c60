create or replace function public.trg_block_auto_return_downgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delivered_family text[] := array['delivered','partial_delivered','paid','completed'];
  return_family    text[] := array['returned','return_in_transit','pending_return','partial_return'];
begin
  if NEW.status::text = OLD.status::text then
    return NEW;
  end if;

  -- Automated writers only (webhooks / cron / service-role). A signed-in human
  -- can still mark a delivered order as returned from the UI.
  if auth.uid() is null
     and (OLD.status::text = any(delivered_family) or OLD.delivered_at is not null)
     and NEW.status::text = any(return_family) then
    insert into public.order_status_history (order_id, from_status, to_status, note)
    values (OLD.id, OLD.status, OLD.status,
            'Blocked automated return downgrade (attempted: ' || NEW.status::text || ')');
    NEW.status := OLD.status;
    NEW.delivered_at := coalesce(NEW.delivered_at, OLD.delivered_at);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_orders_block_auto_return_downgrade on public.orders;
create trigger trg_orders_block_auto_return_downgrade
before update of status on public.orders
for each row execute function public.trg_block_auto_return_downgrade();

-- Repair the order wrongly flipped by the InstaPay webhook.
update public.orders
set status = 'delivered', payment_status = 'paid'
where id = '3d71d488-38e3-42d5-8be1-4c934a466711';

update public.courier_shipments
set status = 'Delivered'
where order_id = '3d71d488-38e3-42d5-8be1-4c934a466711';