create table if not exists public.iap_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios',
  product_id text not null,
  transaction_id text unique,
  purchased_at timestamptz not null default now(),
  environment text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists iap_purchases_user_id_purchased_at_idx
  on public.iap_purchases (user_id, purchased_at desc);

create index if not exists iap_purchases_product_id_purchased_at_idx
  on public.iap_purchases (product_id, purchased_at desc);

alter table public.iap_purchases enable row level security;

create policy "Users can view their own iap purchases"
  on public.iap_purchases
  for select
  using (auth.uid() = user_id);

create or replace view public.iap_purchases_recent as
select
  user_id,
  product_id,
  transaction_id,
  environment,
  purchased_at,
  platform
from public.iap_purchases
order by purchased_at desc;

comment on view public.iap_purchases_recent is
  'Admin helper view. Example: select * from public.iap_purchases_recent where user_id = ''<uuid>'' order by purchased_at desc limit 100;';
