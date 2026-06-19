create or replace function public.track_anonymous_device(
  p_anonymous_device_id uuid,
  p_user_id uuid default null
)
returns public.anonymous_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_user_id uuid;
  tracked public.anonymous_devices;
begin
  if p_user_id is not null and auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'Cannot link anonymous device to a different user.';
  end if;

  resolved_user_id := auth.uid();

  insert into public.anonymous_devices (
    anonymous_device_id,
    user_id,
    first_seen_at,
    last_seen_at,
    converted_at,
    updated_at
  ) values (
    p_anonymous_device_id,
    resolved_user_id,
    now(),
    now(),
    case when resolved_user_id is null then null else now() end,
    now()
  )
  on conflict (anonymous_device_id)
  do update set
    user_id = coalesce(excluded.user_id, public.anonymous_devices.user_id),
    last_seen_at = now(),
    converted_at = case
      when public.anonymous_devices.converted_at is not null then public.anonymous_devices.converted_at
      when coalesce(excluded.user_id, public.anonymous_devices.user_id) is not null then now()
      else null
    end,
    updated_at = now()
  returning * into tracked;

  return tracked;
end;
$$;

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
    user_id = coalesce(excluded.user_id, public.anonymous_devices.user_id),
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
