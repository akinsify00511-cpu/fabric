create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  staff_id uuid not null,
  title text not null,
  description text,
  date date not null,
  start_time time not null,
  end_time time,
  location text,
  meeting_link text,
  attendees jsonb not null default '[]'::jsonb,
  agenda text,
  notes text,
  recording_url text,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_business_date_idx on public.meetings (business_id,date,start_time);
create index if not exists meetings_business_status_idx on public.meetings (business_id,status);
alter table public.meetings enable row level security;
drop policy if exists meetings_select_member on public.meetings;
create policy meetings_select_member on public.meetings for select to authenticated using (exists(select 1 from public.get_current_staff() s where s.business_id=meetings.business_id));
drop policy if exists meetings_insert_member on public.meetings;
create policy meetings_insert_member on public.meetings for insert to authenticated with check (exists(select 1 from public.get_current_staff() s where s.id=meetings.staff_id and s.business_id=meetings.business_id));
drop policy if exists meetings_update_member on public.meetings;
create policy meetings_update_member on public.meetings for update to authenticated using (exists(select 1 from public.get_current_staff() s where s.business_id=meetings.business_id)) with check (exists(select 1 from public.get_current_staff() s where s.business_id=meetings.business_id));
drop policy if exists meetings_delete_member on public.meetings;
create policy meetings_delete_member on public.meetings for delete to authenticated using (exists(select 1 from public.get_current_staff() s where s.business_id=meetings.business_id));

create or replace function public.set_avenize_meeting_room()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  new.meeting_link := '/app/meeting-capture?meeting=' || new.id::text;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_set_avenize_meeting_room on public.meetings;
create trigger trg_set_avenize_meeting_room before insert or update on public.meetings for each row execute function public.set_avenize_meeting_room();
update public.meetings set meeting_link='/app/meeting-capture?meeting='||id::text,updated_at=now();
revoke execute on function public.set_avenize_meeting_room() from public,anon,authenticated;
grant execute on function public.set_avenize_meeting_room() to service_role;

create table if not exists public.meeting_captures (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  business_id uuid not null,
  staff_id uuid not null,
  capture_type text not null check (capture_type in ('text','voice','image','file','recording')),
  title text,
  body text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists meeting_captures_meeting_idx on public.meeting_captures(meeting_id,created_at desc);
create index if not exists meeting_captures_business_idx on public.meeting_captures(business_id,created_at desc);
alter table public.meeting_captures enable row level security;
drop policy if exists meeting_captures_select_member on public.meeting_captures;
create policy meeting_captures_select_member on public.meeting_captures for select to authenticated using (exists(select 1 from public.get_current_staff() s where s.id=meeting_captures.staff_id and s.business_id=meeting_captures.business_id) and exists(select 1 from public.meetings m where m.id=meeting_captures.meeting_id and m.business_id=meeting_captures.business_id));
drop policy if exists meeting_captures_insert_member on public.meeting_captures;
create policy meeting_captures_insert_member on public.meeting_captures for insert to authenticated with check (exists(select 1 from public.get_current_staff() s where s.id=meeting_captures.staff_id and s.business_id=meeting_captures.business_id) and exists(select 1 from public.meetings m where m.id=meeting_captures.meeting_id and m.business_id=meeting_captures.business_id));
drop policy if exists meeting_captures_update_member on public.meeting_captures;
create policy meeting_captures_update_member on public.meeting_captures for update to authenticated using (exists(select 1 from public.get_current_staff() s where s.id=meeting_captures.staff_id and s.business_id=meeting_captures.business_id)) with check (exists(select 1 from public.get_current_staff() s where s.id=meeting_captures.staff_id and s.business_id=meeting_captures.business_id));
drop policy if exists meeting_captures_delete_member on public.meeting_captures;
create policy meeting_captures_delete_member on public.meeting_captures for delete to authenticated using (exists(select 1 from public.get_current_staff() s where s.id=meeting_captures.staff_id and s.business_id=meeting_captures.business_id));

insert into storage.buckets(id,name,public) values('meeting-captures','meeting-captures',false) on conflict(id) do update set public=false;
drop policy if exists meeting_capture_objects_select on storage.objects;
create policy meeting_capture_objects_select on storage.objects for select to authenticated using (bucket_id='meeting-captures' and name ~ '^[0-9a-fA-F-]{36}/' and exists(select 1 from public.meetings m where m.id=split_part(name,'/',1)::uuid and exists(select 1 from public.get_current_staff() s where s.business_id=m.business_id)));
drop policy if exists meeting_capture_objects_insert on storage.objects;
create policy meeting_capture_objects_insert on storage.objects for insert to authenticated with check (bucket_id='meeting-captures' and name ~ '^[0-9a-fA-F-]{36}/' and exists(select 1 from public.meetings m where m.id=split_part(name,'/',1)::uuid and exists(select 1 from public.get_current_staff() s where s.business_id=m.business_id)));
drop policy if exists meeting_capture_objects_delete on storage.objects;
create policy meeting_capture_objects_delete on storage.objects for delete to authenticated using (bucket_id='meeting-captures' and name ~ '^[0-9a-fA-F-]{36}/' and exists(select 1 from public.meetings m where m.id=split_part(name,'/',1)::uuid and exists(select 1 from public.get_current_staff() s where s.business_id=m.business_id)));

-- Realtime signaling/presence is restricted to authenticated members of the meeting's business.
drop policy if exists native_meeting_realtime_select on realtime.messages;
create policy native_meeting_realtime_select on realtime.messages for select to authenticated using (realtime.messages.extension in ('broadcast','presence') and realtime.topic() ~ '^meeting:[0-9a-fA-F-]{36}$' and exists(select 1 from public.meetings m where m.id=split_part(realtime.topic(),':',2)::uuid and exists(select 1 from public.get_current_staff() s where s.business_id=m.business_id)));
drop policy if exists native_meeting_realtime_insert on realtime.messages;
create policy native_meeting_realtime_insert on realtime.messages for insert to authenticated with check (realtime.messages.extension in ('broadcast','presence') and realtime.topic() ~ '^meeting:[0-9a-fA-F-]{36}$' and exists(select 1 from public.meetings m where m.id=split_part(realtime.topic(),':',2)::uuid and exists(select 1 from public.get_current_staff() s where s.business_id=m.business_id)));
