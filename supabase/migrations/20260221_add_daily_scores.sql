create table if not exists public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_key text not null,
  score integer not null,
  correct_count integer not null,
  total_time_ms integer not null,
  created_at timestamptz not null default now(),
  constraint daily_scores_user_day_unique unique (user_id, daily_key)
);

create index if not exists daily_scores_daily_key_score_idx
  on public.daily_scores (daily_key, score desc, total_time_ms asc);

alter table public.daily_scores enable row level security;

create policy "daily_scores_insert_own"
  on public.daily_scores
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "daily_scores_select_authenticated"
  on public.daily_scores
  for select
  to authenticated
  using (true);
