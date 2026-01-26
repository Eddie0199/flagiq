-- Ensure profiles table exists
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz default now()
);

-- Ensure RLS on profiles and public read for id/username
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Public profiles read'
  ) then
    create policy "Public profiles read"
      on public.profiles
      for select
      using (true);
  end if;
end $$;

-- Sync profiles from auth.users
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_username text;
begin
  resolved_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  if resolved_username is null then
    resolved_username := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
  end if;
  if resolved_username is null then
    resolved_username := nullif(split_part(new.email, '@', 1), '');
  end if;
  if resolved_username is null then
    resolved_username := 'Player';
  end if;

  insert into public.profiles (id, username)
  values (new.id, resolved_username)
  on conflict (id)
  do update set username = excluded.username;

  return new;
end;
$$;

-- Trigger for new users and updates to user metadata/email
create or replace trigger sync_profile_from_auth
after insert or update of raw_user_meta_data, email
on auth.users
for each row execute function public.sync_profile_from_auth();

-- Backfill existing users
insert into public.profiles (id, username)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data->>'username'), ''),
    nullif(trim(users.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(users.email, '@', 1), ''),
    'Player'
  ) as username
from auth.users as users
on conflict (id)
do update set username = excluded.username;

-- Create/update leaderboard view with profile usernames
create or replace view public.time_trial_overall_leaderboard_view as
select
  scores.user_id,
  profiles.username,
  coalesce(sum(scores.best_score), 0)::int as points,
  coalesce(sum(scores.plays_count), 0)::int as plays
from public.time_trial_level_scores as scores
left join public.profiles as profiles
  on profiles.id = scores.user_id
group by scores.user_id, profiles.username
order by points desc, plays desc
limit 100;

-- Public read access for leaderboard view
grant select on public.time_trial_overall_leaderboard_view to anon, authenticated;

-- Public read access for profiles (RLS still applies)
grant select on public.profiles to anon, authenticated;
