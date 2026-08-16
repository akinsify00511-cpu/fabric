-- Canonical user preferences schema used by the web app.
-- This migration is idempotent because some production environments already
-- contain this table from an earlier out-of-band migration.

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  show_email boolean default true,
  show_phone boolean default true,
  show_avatar boolean default true,
  show_status boolean default true,
  theme_mode text default 'company',
  compact_mode boolean default false,
  show_tips boolean default true,
  show_recent_activity boolean default true,
  dashboard_layout text default 'grid',
  show_stats_cards boolean default true,
  show_quick_actions boolean default true,
  show_announcements boolean default true,
  email_notifications boolean default true,
  push_notifications boolean default true,
  sound_enabled boolean default false,
  language text default 'en',
  timezone text,
  date_format text default 'DMY',
  currency_display text default 'symbol',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  dashboard_view_preferences jsonb not null default '{}'::jsonb,
  constraint user_preferences_dashboard_view_preferences_object
    check (jsonb_typeof(dashboard_view_preferences) = 'object')
);

alter table public.user_preferences
  add column if not exists dashboard_view_preferences jsonb not null default '{}'::jsonb;

alter table public.user_preferences
  enable row level security;

revoke all on table public.user_preferences from anon;
grant select, insert, update on table public.user_preferences to authenticated;

drop policy if exists user_preferences_select_own on public.user_preferences;
drop policy if exists user_preferences_insert_own on public.user_preferences;
drop policy if exists user_preferences_update_own on public.user_preferences;

create policy user_preferences_select_own
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_preferences_insert_own
  on public.user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_preferences_update_own
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists user_preferences_user_id_idx
  on public.user_preferences (user_id);

notify pgrst, 'reload schema';
