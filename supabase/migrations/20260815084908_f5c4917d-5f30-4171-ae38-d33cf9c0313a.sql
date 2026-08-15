alter table public.hub_competitors
  add column if not exists niche text,
  add column if not exists handle text,
  add column if not exists followers text,
  add column if not exists youtube_url text,
  add column if not exists page_type text;

alter table public.hub_product_ideas
  add column if not exists source_currency text,
  add column if not exists source_price numeric,
  add column if not exists fx_rate numeric;