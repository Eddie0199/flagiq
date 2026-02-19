-- Clean up legacy leaderboard view name and ensure the canonical view is not marked unrestricted.

drop view if exists public.time_trial_overall_leaderboard;

create or replace view public.time_trial_overall_leaderboard_view
with (security_invoker = true)
as
select *
from public.get_time_trial_overall_leaderboard();

grant select on public.time_trial_overall_leaderboard_view to anon, authenticated;
