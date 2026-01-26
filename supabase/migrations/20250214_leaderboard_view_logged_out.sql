-- Ensure leaderboard view works for logged-out users via a security definer function
create or replace function public.get_time_trial_overall_leaderboard()
returns table (
  user_id uuid,
  username text,
  points int,
  plays int
)
language sql
security definer
set search_path = public
as $$
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
$$;

create or replace view public.time_trial_overall_leaderboard_view as
select * from public.get_time_trial_overall_leaderboard();

grant execute on function public.get_time_trial_overall_leaderboard() to anon, authenticated;
grant select on public.time_trial_overall_leaderboard_view to anon, authenticated;
