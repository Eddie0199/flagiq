create extension if not exists "pgcrypto";

create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  deleted_at timestamptz not null default now(),
  deletion_source text not null default 'self_service',
  auth_delete_succeeded boolean not null default false,
  auth_delete_error text,
  cleanup_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_deletions_user_id_idx
  on public.account_deletions (user_id, deleted_at desc);

create index if not exists account_deletions_email_idx
  on public.account_deletions (email, deleted_at desc);

alter table public.account_deletions enable row level security;
