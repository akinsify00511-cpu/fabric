-- PostGIS provides geography types and the ST_Distance geofencing used by
-- business_locations/field_visits and the clock_in/out RPCs. On Supabase it
-- is always available; the bare-postgres CI migration-test job lacks it, so
-- create best-effort (matches the 051 pg_cron/pg_net guard pattern).
DO $$ BEGIN
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'postgis not available, skipping (geofence columns/RPCs will fail until applied on a Postgres with PostGIS)';
END $$;

create table if not exists public.attendance_policies (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  timezone text not null default 'Africa/Lagos',
  work_start time not null default '09:00',
  grace_minutes integer not null default 15 check (grace_minutes between 0 and 240),
  default_radius_meters numeric not null default 150 check (default_radius_meters between 10 and 5000),
  require_location boolean not null default false,
  block_outside_geofence boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  radius_meters numeric not null default 150 check (radius_meters between 10 and 5000),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_locations_business_idx on public.business_locations(business_id);

create or replace function public.sync_business_location_point() returns trigger
language plpgsql security invoker set search_path=''
as $$ begin
  if exists (select 1 from pg_extension where extname = 'postgis') then
    new.location := extensions.st_setsrid(extensions.st_makepoint(new.longitude::double precision,new.latitude::double precision),4326)::extensions.geography;
  end if;
  return new;
end; $$;
drop trigger if exists business_locations_sync_point on public.business_locations;
create trigger business_locations_sync_point before insert or update of latitude,longitude on public.business_locations for each row execute function public.sync_business_location_point();
create unique index if not exists business_locations_one_primary_idx on public.business_locations(business_id) where is_primary and is_active;

alter table public.attendance_records
  add column if not exists business_id uuid references public.businesses(id) on delete cascade,
  add column if not exists check_in_at timestamptz,
  add column if not exists check_out_at timestamptz,
  add column if not exists work_hours numeric(8,2) default 0,
  add column if not exists check_in_lat numeric(10,7),
  add column if not exists check_in_lng numeric(10,7),
  add column if not exists check_in_accuracy_meters numeric,
  add column if not exists check_out_lat numeric(10,7),
  add column if not exists check_out_lng numeric(10,7),
  add column if not exists check_out_accuracy_meters numeric,
  add column if not exists check_in_distance_meters numeric,
  add column if not exists check_out_distance_meters numeric,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_reason text,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists client_event_id uuid,
  add column if not exists server_received_at timestamptz,
  add column if not exists correction_status text not null default 'none',
  add column if not exists correction_reason text,
  add column if not exists corrected_by uuid references public.staff(id),
  add column if not exists corrected_at timestamptz;
update public.attendance_records ar set business_id=s.business_id from public.staff s where ar.staff_id=s.id and ar.business_id is null;
create unique index if not exists attendance_records_staff_date_uidx on public.attendance_records(staff_id,date);
create index if not exists attendance_records_business_date_idx on public.attendance_records(business_id,date desc);
create index if not exists attendance_records_staff_date_idx on public.attendance_records(staff_id,date desc);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  event_type text not null check (event_type in ('clock_in','clock_out','correction_requested','correction_approved','correction_rejected')),
  client_event_id uuid not null unique,
  captured_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  latitude numeric(10,7), longitude numeric(10,7), accuracy_meters numeric, distance_meters numeric,
  verification_status text not null default 'unverified', verification_reason text, device text, network_state text,
  evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists attendance_events_business_idx on public.attendance_events(business_id,created_at desc);
create index if not exists attendance_events_staff_idx on public.attendance_events(staff_id,created_at desc);

create table if not exists public.field_visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  assigned_staff_id uuid not null references public.staff(id) on delete restrict,
  customer_name text not null, customer_phone text, customer_address text,
  latitude numeric(10,7), longitude numeric(10,7), radius_meters numeric not null default 150 check (radius_meters between 10 and 5000),
  scheduled_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','accepted','en_route','arrived','verified','in_progress','completed','cancelled','rescheduled','customer_unavailable','unverified')),
  arrived_at timestamptz, completed_at timestamptz,
  arrival_lat numeric(10,7), arrival_lng numeric(10,7), arrival_accuracy_meters numeric, arrival_distance_meters numeric,
  arrival_verification_status text not null default 'unverified', arrival_verification_reason text,
  completion_lat numeric(10,7), completion_lng numeric(10,7), completion_accuracy_meters numeric, completion_distance_meters numeric,
  completion_verification_status text not null default 'unverified', completion_verification_reason text,
  outcome text, notes text, evidence jsonb not null default '{}'::jsonb, client_event_id uuid,
  created_by uuid references public.staff(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists field_visits_business_idx on public.field_visits(business_id,scheduled_at desc);
create index if not exists field_visits_staff_idx on public.field_visits(assigned_staff_id,scheduled_at desc);
create or replace function public.sync_field_visit_point() returns trigger
language plpgsql security invoker set search_path=''
as $$ begin
  if exists (select 1 from pg_extension where extname = 'postgis') then
    if new.latitude is not null and new.longitude is not null then new.customer_location := extensions.st_setsrid(extensions.st_makepoint(new.longitude::double precision,new.latitude::double precision),4326)::extensions.geography;
    else new.customer_location := null; end if;
  end if;
  return new;
end; $$;
drop trigger if exists field_visits_sync_point on public.field_visits;
create trigger field_visits_sync_point before insert or update of latitude,longitude on public.field_visits for each row execute function public.sync_field_visit_point();

-- Geo columns: geography + gist indexes only when PostGIS is available
-- (Supabase). On bare postgres (CI) they degrade to TEXT columns so the
-- schema still applies cleanly; geofencing stays disabled there until the
-- migration runs on a Postgres with PostGIS (matches the guard above).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'alter table public.business_locations add column if not exists location extensions.geography(POINT,4326)';
    EXECUTE 'create index if not exists business_locations_geo_idx on public.business_locations using gist(location)';
    EXECUTE 'alter table public.field_visits add column if not exists customer_location extensions.geography(POINT,4326)';
    EXECUTE 'create index if not exists field_visits_geo_idx on public.field_visits using gist(customer_location)';
  ELSE
    EXECUTE 'alter table public.business_locations add column if not exists location text';
    EXECUTE 'alter table public.field_visits add column if not exists customer_location text';
    RAISE NOTICE 'postgis unavailable: location/customer_location created as TEXT (geofencing disabled until PostGIS is installed)';
  END IF;
END $$;

create table if not exists public.field_visit_events (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid not null references public.field_visits(id) on delete cascade, staff_id uuid not null references public.staff(id) on delete cascade,
  event_type text not null check (event_type in ('assigned','accepted','en_route','arrived','verified','completed','cancelled','rescheduled','customer_unavailable')),
  client_event_id uuid not null unique, captured_at timestamptz not null, server_received_at timestamptz not null default now(),
  latitude numeric(10,7), longitude numeric(10,7), accuracy_meters numeric, distance_meters numeric,
  verification_status text not null default 'unverified', verification_reason text, device text, network_state text,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists field_visit_events_visit_idx on public.field_visit_events(visit_id,created_at);
create index if not exists field_visit_events_business_idx on public.field_visit_events(business_id,created_at desc);

alter table public.attendance_policies enable row level security;
alter table public.business_locations enable row level security;
alter table public.attendance_events enable row level security;
alter table public.field_visits enable row level security;
alter table public.field_visit_events enable row level security;
revoke all on public.attendance_policies from anon;
revoke all on public.business_locations from anon;
revoke all on public.attendance_events from anon;
revoke all on public.field_visits from anon;
revoke all on public.field_visit_events from anon;
grant select on public.attendance_policies to authenticated;
grant select,insert,update,delete on public.business_locations to authenticated;
grant select on public.attendance_records to authenticated;
grant select on public.attendance_events to authenticated;
grant select on public.field_visits to authenticated;
grant select on public.field_visit_events to authenticated;

drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select on public.attendance_policies for select to authenticated using (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=attendance_policies.business_id));
drop policy if exists business_locations_select on public.business_locations;
create policy business_locations_select on public.business_locations for select to authenticated using (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=business_locations.business_id));
drop policy if exists business_locations_manage on public.business_locations;
create policy business_locations_manage on public.business_locations for all to authenticated using (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=business_locations.business_id and s.role in ('owner','admin'))) with check (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=business_locations.business_id and s.role in ('owner','admin')));
drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated using (exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.id=attendance_records.staff_id) or exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.business_id=attendance_records.business_id and me.role in ('owner','admin','manager','team_lead')));
drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events for select to authenticated using (exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.id=attendance_events.staff_id) or exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.business_id=attendance_events.business_id and me.role in ('owner','admin','manager','team_lead')));
drop policy if exists field_visits_select on public.field_visits;
create policy field_visits_select on public.field_visits for select to authenticated using (exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.id=field_visits.assigned_staff_id) or exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.business_id=field_visits.business_id and me.role in ('owner','admin','manager','team_lead')));
drop policy if exists field_visit_events_select on public.field_visit_events;
create policy field_visit_events_select on public.field_visit_events for select to authenticated using (exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.id=field_visit_events.staff_id) or exists (select 1 from public.staff me where me.user_id=(select auth.uid()) and me.business_id=field_visit_events.business_id and me.role in ('owner','admin','manager','team_lead')));