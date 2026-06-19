alter table public.anonymous_devices
  add column if not exists coins integer not null default 0,
  add column if not exists preferred_language text,
  add column if not exists progress jsonb not null default '{}'::jsonb,
  add column if not exists inventory jsonb not null default '{}'::jsonb,
  add column if not exists cooldowns jsonb not null default '{}'::jsonb,
  add column if not exists hearts_current integer,
  add column if not exists hearts_max integer,
  add column if not exists hearts_last_regen_at timestamptz;

create or replace function public.save_anonymous_device_state(
  p_anonymous_device_id uuid,
  p_coins integer default 0,
  p_preferred_language text default null,
  p_progress jsonb default '{}'::jsonb,
  p_inventory jsonb default '{}'::jsonb,
  p_cooldowns jsonb default '{}'::jsonb,
  p_hearts_current integer default null,
  p_hearts_max integer default null,
  p_hearts_last_regen_at timestamptz default null
)
returns public.anonymous_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked public.anonymous_devices;
begin
  insert into public.anonymous_devices (
    anonymous_device_id,
    user_id,
    first_seen_at,
    last_seen_at,
    updated_at,
    coins,
    preferred_language,
    progress,
    inventory,
    cooldowns,
    hearts_current,
    hearts_max,
    hearts_last_regen_at
  ) values (
    p_anonymous_device_id,
    auth.uid(),
    now(),
    now(),
    now(),
    greatest(coalesce(p_coins, 0), 0),
    nullif(p_preferred_language, ''),
    coalesce(p_progress, '{}'::jsonb),
    coalesce(p_inventory, '{}'::jsonb),
    coalesce(p_cooldowns, '{}'::jsonb),
    p_hearts_current,
    p_hearts_max,
    p_hearts_last_regen_at
  )
  on conflict (anonymous_device_id)
  do update set
    user_id = coalesce(public.anonymous_devices.user_id, excluded.user_id),
    last_seen_at = now(),
    updated_at = now(),
    coins = excluded.coins,
    preferred_language = excluded.preferred_language,
    progress = excluded.progress,
    inventory = excluded.inventory,
    cooldowns = excluded.cooldowns,
    hearts_current = excluded.hearts_current,
    hearts_max = excluded.hearts_max,
    hearts_last_regen_at = excluded.hearts_last_regen_at
  returning * into tracked;

  return tracked;
end;
$$;

grant execute on function public.save_anonymous_device_state(uuid, integer, text, jsonb, jsonb, jsonb, integer, integer, timestamptz) to anon, authenticated;

create or replace function public.get_anonymous_device_state(
  p_anonymous_device_id uuid
)
returns public.anonymous_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked public.anonymous_devices;
begin
  select * into tracked
  from public.anonymous_devices
  where anonymous_device_id = p_anonymous_device_id;

  return tracked;
end;
$$;

grant execute on function public.get_anonymous_device_state(uuid) to anon, authenticated;
