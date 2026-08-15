-- Merge Growth Hub Creative Desk data into Content Studio
-- 1) hub_content_plans -> content_items (item-level creative records)
insert into public.content_items (
  id, brand_id, product_id, title, content_type, platform, source,
  angle, script, caption, cta, hashtags, reference_urls,
  due_date, cost, stage, status, video_url, published_url, published_at,
  views, attributed_orders, created_at
)
select
  h.id,
  h.brand_id,
  h.product_id,
  coalesce(nullif(h.title,''), 'Untitled content'),
  coalesce(nullif(h.asset_type,''), 'ugc'),
  coalesce(nullif(h.platform,''), 'facebook'),
  'in_house',
  h.angle,
  coalesce(h.script, h.brief),
  h.caption,
  h.cta,
  h.hashtags,
  coalesce(h.reference_urls, '{}'::text[]),
  coalesce(h.deadline, h.launch_date),
  coalesce(h.budget, 0),
  case h.status
    when 'planned'   then 'ideation'
    when 'briefing'  then 'ideation'
    when 'shooting'  then 'create'
    when 'editing'   then 'editing'
    when 'scheduled' then 'editing'
    when 'live'      then 'published'
    else 'ideation'
  end,
  case h.status
    when 'planned'   then 'briefed'
    when 'briefing'  then 'briefed'
    when 'shooting'  then 'shooting'
    when 'editing'   then 'editing'
    when 'scheduled' then 'approved'
    when 'live'      then 'published'
    else 'briefed'
  end,
  h.video_url,
  h.published_url,
  h.published_at,
  coalesce(h.views, 0),
  coalesce(h.attributed_orders, 0),
  h.created_at
from public.hub_content_plans h
where h.status is distinct from 'cancelled'
on conflict (id) do nothing;

-- 2) hub_content_assignments -> content_briefs (creator deliverables)
insert into public.content_briefs (
  id, brand_id, item_id, creator_id, deliverable_type,
  due_date, cost, approval_status, reference_url, notes, created_at
)
select
  a.id,
  p.brand_id,
  a.plan_id,
  a.creator_id,
  coalesce(nullif(a.deliverable,''), 'ugc'),
  a.deadline,
  coalesce(nullif(a.actual_cost, 0), a.agreed_budget, 0),
  case a.status
    when 'accepted'  then 'briefed'
    when 'submitted' then 'in_review'
    when 'approved'  then 'approved'
    when 'rejected'  then 'rejected'
    else 'pending'
  end,
  a.result_url,
  a.notes,
  a.created_at
from public.hub_content_assignments a
left join public.hub_content_plans p on p.id = a.plan_id
where exists (select 1 from public.content_items ci where ci.id = a.plan_id)
on conflict (id) do nothing;

-- 3) one brief per content item (canonical link)
create unique index if not exists content_briefs_item_id_uidx
  on public.content_briefs (item_id)
  where item_id is not null;