-- Set BulkSMSBD credentials for both brands and enable SMS
insert into public.app_settings (key, value)
select 'sms:bulksmsbd:' || b.id,
       jsonb_build_object(
         'enabled', true,
         'api_key', 'Bve6Ocim7nGHJGd43nSb',
         'sender_id', '8809648910203',
         'auto_order_confirm', true,
         'auto_preorder_placed', true
       )::text
from public.brands b
on conflict (key) do update
set value = (
  coalesce(nullif(app_settings.value,'')::jsonb, '{}'::jsonb)
  || jsonb_build_object('enabled', true, 'api_key', 'Bve6Ocim7nGHJGd43nSb', 'sender_id', '8809648910203')
)::text;