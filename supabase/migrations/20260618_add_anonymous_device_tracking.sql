create table if not exists public.anonymous_devices (
  anonymous_device_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anonymous_devices_user_id_idx
  on public.anonymous_devices (user_id);

create index if not exists anonymous_devices_converted_at_idx
  on public.anonymous_devices (converted_at)
  where converted_at is not null;

alter table public.anonymous_devices enable row level security;

create policy "Anonymous devices can be recorded"
  on public.anonymous_devices
  for insert
  to anon, authenticated
  with check (true);

create policy "Users can read linked anonymous devices"
  on public.anonymous_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update linked anonymous devices"
  on public.anonymous_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
      when coalesce(public.anonymous_devices.user_id, excluded.user_id) is not null then now()
      else null
    end,
    updated_at = now()
  returning * into tracked;

  return tracked;
end;
$$;

grant execute on function public.track_anonymous_device(uuid, uuid) to anon, authenticated;

create or replace view public.app_user_device_reporting as
select
  (select count(*) from auth.users)::bigint as total_registered_users,
  (select count(*) from public.anonymous_devices where user_id is null)::bigint as total_anonymous_guest_devices,
  (
    (select count(*) from auth.users) +
    (select count(*) from public.anonymous_devices where user_id is null)
  )::bigint as total_unique_app_users_devices,
  (select count(*) from public.anonymous_devices where converted_at is not null)::bigint as guests_who_later_registered;

comment on table public.anonymous_devices is
  'Persistent anonymous install/device records. Rows start as guests and are linked to auth.users when the player logs in or signs up.';

comment on view public.app_user_device_reporting is
  'Admin reporting: registered users + still-anonymous devices gives de-duplicated total unique app users/devices; converted devices are counted under registered users only.';
