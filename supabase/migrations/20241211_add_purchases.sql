-- Purchases audit table for web prototype purchases
create extension if not exists "pgcrypto";

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  coins_granted int4 default 0,
  hearts_refill boolean default false,
  platform text not null,
  created_at timestamptz not null default now()
);

create index if not exists purchases_user_id_created_at_idx
  on public.purchases (user_id, created_at desc);
create index if not exists purchases_product_id_created_at_idx
  on public.purchases (product_id, created_at desc);

alter table public.purchases enable row level security;

create policy "Users can insert their own purchases" on public.purchases
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own purchases" on public.purchases
  for select to authenticated
  using (auth.uid() = user_id);

-- No update/delete policies: disallow by default
