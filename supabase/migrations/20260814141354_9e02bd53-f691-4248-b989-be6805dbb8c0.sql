create or replace function public.hub_idea_people(_idea_ids uuid[])
returns table (
  idea_id uuid,
  created_by uuid,
  created_by_name text,
  voters jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id as idea_id,
         i.created_by,
         coalesce(nullif(p.display_name, ''), 'Unknown') as created_by_name,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'user_id', v.user_id,
                    'name', coalesce(nullif(vp.display_name, ''), 'Unknown'),
                    'vote', v.vote,
                    'rating', v.rating,
                    'comment', v.comment
                  ) order by v.created_at)
           from public.hub_idea_votes v
           left join public.profiles vp on vp.id = v.user_id
           where v.idea_id = i.id
         ), '[]'::jsonb) as voters
  from public.hub_product_ideas i
  left join public.profiles p on p.id = i.created_by
  where i.id = any(_idea_ids)
$$;

grant execute on function public.hub_idea_people(uuid[]) to authenticated;