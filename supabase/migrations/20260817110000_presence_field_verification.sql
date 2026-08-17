-- Presence & Field Verification foundation
-- Event-based evidence, tenant-safe RPC writes, offline-safe idempotency.

create extension if not exists postgis schema extensions;

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
  location extensions.geography(POINT, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_locations_business_idx on public.business_locations(business_id);
create index if not exists business_locations_geo_idx on public.business_locations using gist(location);

create or replace function public.sync_business_location_point()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.location := extensions.st_setsrid(extensions.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::extensions.geography;
  return new;
end;
$$;

drop trigger if exists business_locations_sync_point on public.business_locations;
create trigger business_locations_sync_point
before insert or update of latitude, longitude on public.business_locations
for each row execute function public.sync_business_location_point();

create unique index if not exists business_locations_one_primary_idx
  on public.business_locations(business_id) where is_primary and is_active;

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

update public.attendance_records
set business_id = s.business_id
from public.staff s
where attendance_records.staff_id = s.id
  and attendance_records.business_id is null;

create unique index if not exists attendance_records_staff_date_uidx
  on public.attendance_records(staff_id, date);
create index if not exists attendance_records_business_date_idx
  on public.attendance_records(business_id, date desc);
create index if not exists attendance_records_staff_date_idx
  on public.attendance_records(staff_id, date desc);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  event_type text not null check (event_type in ('clock_in','clock_out','correction_requested','correction_approved','correction_rejected')),
  client_event_id uuid not null unique,
  captured_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_meters numeric,
  distance_meters numeric,
  verification_status text not null default 'unverified',
  verification_reason text,
  device text,
  network_state text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_events_business_idx on public.attendance_events(business_id, created_at desc);
create index if not exists attendance_events_staff_idx on public.attendance_events(staff_id, created_at desc);

create table if not exists public.field_visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  assigned_staff_id uuid not null references public.staff(id) on delete restrict,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  radius_meters numeric not null default 150 check (radius_meters between 10 and 5000),
  customer_location extensions.geography(POINT, 4326),
  scheduled_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','accepted','en_route','arrived','verified','in_progress','completed','cancelled','rescheduled','customer_unavailable','unverified')),
  arrived_at timestamptz,
  completed_at timestamptz,
  arrival_lat numeric(10,7),
  arrival_lng numeric(10,7),
  arrival_accuracy_meters numeric,
  arrival_distance_meters numeric,
  arrival_verification_status text not null default 'unverified',
  arrival_verification_reason text,
  completion_lat numeric(10,7),
  completion_lng numeric(10,7),
  completion_accuracy_meters numeric,
  completion_distance_meters numeric,
  completion_verification_status text not null default 'unverified',
  completion_verification_reason text,
  outcome text,
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  client_event_id uuid,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_visits_business_idx on public.field_visits(business_id, scheduled_at desc);
create index if not exists field_visits_staff_idx on public.field_visits(assigned_staff_id, scheduled_at desc);
create index if not exists field_visits_geo_idx on public.field_visits using gist(customer_location);

create or replace function public.sync_field_visit_point()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.customer_location := extensions.st_setsrid(extensions.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::extensions.geography;
  else
    new.customer_location := null;
  end if;
  return new;
end;
$$;

drop trigger if exists field_visits_sync_point on public.field_visits;
create trigger field_visits_sync_point
before insert or update of latitude, longitude on public.field_visits
for each row execute function public.sync_field_visit_point();

create table if not exists public.field_visit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid not null references public.field_visits(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  event_type text not null check (event_type in ('assigned','accepted','en_route','arrived','verified','completed','cancelled','rescheduled','customer_unavailable')),
  client_event_id uuid not null unique,
  captured_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_meters numeric,
  distance_meters numeric,
  verification_status text not null default 'unverified',
  verification_reason text,
  device text,
  network_state text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists field_visit_events_visit_idx on public.field_visit_events(visit_id, created_at);
create index if not exists field_visit_events_business_idx on public.field_visit_events(business_id, created_at desc);

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
grant select, insert, update, delete on public.business_locations to authenticated;
grant select on public.attendance_records to authenticated;
grant select on public.attendance_events to authenticated;
grant select on public.field_visits to authenticated;
grant select on public.field_visit_events to authenticated;

drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select on public.attendance_policies
for select to authenticated
using (exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.business_id = attendance_policies.business_id));

drop policy if exists business_locations_select on public.business_locations;
create policy business_locations_select on public.business_locations
for select to authenticated
using (exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.business_id = business_locations.business_id));

drop policy if exists business_locations_manage on public.business_locations;
create policy business_locations_manage on public.business_locations
for all to authenticated
using (exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.business_id = business_locations.business_id and s.role in ('owner','admin')))
with check (exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.business_id = business_locations.business_id and s.role in ('owner','admin')));

drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records
for select to authenticated
using (
  exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.id = attendance_records.staff_id)
  or exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.business_id = attendance_records.business_id and me.role in ('owner','admin','manager','team_lead'))
);

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events
for select to authenticated
using (
  exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.id = attendance_events.staff_id)
  or exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.business_id = attendance_events.business_id and me.role in ('owner','admin','manager','team_lead'))
);

drop policy if exists field_visits_select on public.field_visits;
create policy field_visits_select on public.field_visits
for select to authenticated
using (
  exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.id = field_visits.assigned_staff_id)
  or exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.business_id = field_visits.business_id and me.role in ('owner','admin','manager','team_lead'))
);

drop policy if exists field_visit_events_select on public.field_visit_events;
create policy field_visit_events_select on public.field_visit_events
for select to authenticated
using (
  exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.id = field_visit_events.staff_id)
  or exists (select 1 from public.staff me where me.user_id = (select auth.uid()) and me.business_id = field_visit_events.business_id and me.role in ('owner','admin','manager','team_lead'))
);

create or replace function public.clock_in_staff(
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_meters numeric default null,
  p_device text default null,
  p_network_state text default 'online',
  p_client_event_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_policy public.attendance_policies%rowtype;
  v_location public.business_locations%rowtype;
  v_record public.attendance_records%rowtype;
  v_local_date date;
  v_now timestamptz := now();
  v_distance numeric;
  v_status text := 'present';
  v_verification text := 'unverified';
  v_reason text := 'No business location configured';
  v_event_id uuid;
begin
  select * into v_staff from public.staff where user_id = (select auth.uid()) limit 1;
  if v_staff.id is null then raise exception using errcode = '42501', message = 'STAFF_NOT_FOUND'; end if;

  select * into v_policy from public.attendance_policies where business_id = v_staff.business_id;
  v_local_date := (v_now at time zone coalesce(v_policy.timezone, 'Africa/Lagos'))::date;

  select * into v_record from public.attendance_records where staff_id = v_staff.id and date = v_local_date for update;
  if v_record.id is not null and v_record.check_in_at is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'attendance_id', v_record.id, 'status', v_record.status, 'verification_status', v_record.verification_status);
  end if;

  select * into v_location from public.business_locations
  where business_id = v_staff.business_id and is_active = true and is_primary = true
  limit 1;

  if p_lat is not null and p_lng is not null and v_location.id is not null then
    v_distance := extensions.st_distance(v_location.location, extensions.st_setsrid(extensions.st_makepoint(p_lng::double precision, p_lat::double precision),4326)::extensions.geography);
    if v_distance <= coalesce(v_location.radius_meters, v_policy.default_radius_meters, 150) then
      v_verification := 'verified';
      v_reason := 'Within expected business location';
    else
      v_verification := 'outside_geofence';
      v_reason := 'Outside expected business location radius';
      if coalesce(v_policy.block_outside_geofence, false) then
        raise exception using errcode = 'P0001', message = 'OUTSIDE_GEOFENCE';
      end if;
    end if;
  elsif coalesce(v_policy.require_location, false) then
    raise exception using errcode = 'P0001', message = 'LOCATION_REQUIRED';
  end if;

  if (v_now at time zone coalesce(v_policy.timezone, 'Africa/Lagos'))::time > (coalesce(v_policy.work_start, '09:00'::time) + make_interval(mins => coalesce(v_policy.grace_minutes,15))) then
    v_status := 'late';
  end if;

  if v_record.id is null then
    insert into public.attendance_records (
      staff_id,business_id,date,check_in_at,check_in,status,check_in_lat,check_in_lng,check_in_accuracy_meters,
      check_in_distance_meters,verification_status,verification_reason,evidence,client_event_id,server_received_at
    ) values (
      v_staff.id,v_staff.business_id,v_local_date,v_now,v_now::time,v_status,p_lat,p_lng,p_accuracy_meters,
      v_distance,v_verification,v_reason,jsonb_build_object('captured_at',v_now,'source','staff_clock_in'),p_client_event_id,v_now
    ) returning * into v_record;
  else
    update public.attendance_records set
      check_in_at=v_now, check_in=v_now::time, status=v_status, check_in_lat=p_lat, check_in_lng=p_lng,
      check_in_accuracy_meters=p_accuracy_meters, check_in_distance_meters=v_distance,
      verification_status=v_verification, verification_reason=v_reason, client_event_id=p_client_event_id,
      server_received_at=v_now, evidence=jsonb_build_object('captured_at',v_now,'source','staff_clock_in')
    where id=v_record.id returning * into v_record;
  end if;

  insert into public.attendance_events (
    business_id,staff_id,attendance_record_id,event_type,client_event_id,captured_at,server_received_at,
    latitude,longitude,accuracy_meters,distance_meters,verification_status,verification_reason,device,network_state,evidence
  ) values (
    v_staff.business_id,v_staff.id,v_record.id,'clock_in',p_client_event_id,v_now,v_now,p_lat,p_lng,p_accuracy_meters,
    v_distance,v_verification,v_reason,p_device,p_network_state,jsonb_build_object('attendance_status',v_status)
  ) on conflict (client_event_id) do nothing returning id into v_event_id;

  return jsonb_build_object('ok',true,'duplicate',false,'attendance_id',v_record.id,'event_id',coalesce(v_event_id,p_client_event_id),'status',v_status,'verification_status',v_verification,'verification_reason',v_reason,'distance_meters',v_distance);
end;
$$;

create or replace function public.clock_out_staff(
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_meters numeric default null,
  p_device text default null,
  p_network_state text default 'online',
  p_client_event_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_policy public.attendance_policies%rowtype;
  v_location public.business_locations%rowtype;
  v_record public.attendance_records%rowtype;
  v_now timestamptz := now();
  v_distance numeric;
  v_verification text := 'unverified';
  v_reason text := 'No business location configured';
  v_event_id uuid;
  v_hours numeric;
  v_local_date date;
begin
  select * into v_staff from public.staff where user_id = (select auth.uid()) limit 1;
  if v_staff.id is null then raise exception using errcode = '42501', message = 'STAFF_NOT_FOUND'; end if;
  select * into v_policy from public.attendance_policies where business_id=v_staff.business_id;
  v_local_date := (v_now at time zone coalesce(v_policy.timezone,'Africa/Lagos'))::date;
  select * into v_record from public.attendance_records where staff_id=v_staff.id and date=v_local_date for update;
  if v_record.id is null or v_record.check_in_at is null then raise exception using errcode='P0001', message='NOT_CLOCKED_IN'; end if;
  if v_record.check_out_at is not null then
    return jsonb_build_object('ok',true,'duplicate',true,'attendance_id',v_record.id,'status',v_record.status,'work_hours',v_record.work_hours);
  end if;

  select * into v_location from public.business_locations where business_id=v_staff.business_id and is_active=true and is_primary=true limit 1;
  if p_lat is not null and p_lng is not null and v_location.id is not null then
    v_distance := extensions.st_distance(v_location.location, extensions.st_setsrid(extensions.st_makepoint(p_lng::double precision,p_lat::double precision),4326)::extensions.geography);
    if v_distance <= coalesce(v_location.radius_meters,v_policy.default_radius_meters,150) then
      v_verification := 'verified'; v_reason := 'Within expected business location';
    else
      v_verification := 'outside_geofence'; v_reason := 'Outside expected business location radius';
    end if;
  elsif coalesce(v_policy.require_location,false) then
    raise exception using errcode='P0001', message='LOCATION_REQUIRED';
  end if;

  v_hours := greatest(0, extract(epoch from (v_now-v_record.check_in_at))/3600.0);
  update public.attendance_records set
    check_out_at=v_now, check_out=v_now::time, work_hours=round(v_hours::numeric,2),
    check_out_lat=p_lat, check_out_lng=p_lng, check_out_accuracy_meters=p_accuracy_meters,
    check_out_distance_meters=v_distance,
    verification_status=case when verification_status='verified' and v_verification='verified' then 'verified' else coalesce(v_verification,verification_status) end,
    verification_reason=v_reason, server_received_at=v_now
  where id=v_record.id returning * into v_record;

  insert into public.attendance_events (
    business_id,staff_id,attendance_record_id,event_type,client_event_id,captured_at,server_received_at,
    latitude,longitude,accuracy_meters,distance_meters,verification_status,verification_reason,device,network_state,evidence
  ) values (
    v_staff.business_id,v_staff.id,v_record.id,'clock_out',p_client_event_id,v_now,v_now,p_lat,p_lng,p_accuracy_meters,
    v_distance,v_verification,v_reason,p_device,p_network_state,jsonb_build_object('work_hours',v_record.work_hours)
  ) on conflict (client_event_id) do nothing returning id into v_event_id;

  return jsonb_build_object('ok',true,'duplicate',false,'attendance_id',v_record.id,'event_id',coalesce(v_event_id,p_client_event_id),'work_hours',v_record.work_hours,'verification_status',v_record.verification_status,'verification_reason',v_record.verification_reason);
end;
$$;

create or replace function public.create_field_visit(
  p_assigned_staff_id uuid,
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_radius_meters numeric default 150,
  p_scheduled_at timestamptz default null,
  p_notes text default null
)
returns public.field_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_assignee public.staff%rowtype;
  v_visit public.field_visits%rowtype;
begin
  select * into v_staff from public.staff where user_id=(select auth.uid()) limit 1;
  if v_staff.id is null or v_staff.role not in ('owner','admin','manager','team_lead') then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;
  select * into v_assignee from public.staff where id=p_assigned_staff_id and business_id=v_staff.business_id limit 1;
  if v_assignee.id is null then raise exception using errcode='P0001',message='INVALID_ASSIGNEE'; end if;
  insert into public.field_visits (business_id,assigned_staff_id,customer_name,customer_phone,customer_address,latitude,longitude,radius_meters,scheduled_at,notes,created_by)
  values (v_staff.business_id,p_assigned_staff_id,p_customer_name,p_customer_phone,p_customer_address,p_lat,p_lng,p_radius_meters,p_scheduled_at,p_notes,v_staff.id)
  returning * into v_visit;
  return v_visit;
end;
$$;

create or replace function public.start_field_visit(
  p_visit_id uuid,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_meters numeric default null,
  p_device text default null,
  p_network_state text default 'online',
  p_client_event_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_visit public.field_visits%rowtype;
  v_now timestamptz:=now();
  v_distance numeric;
  v_verification text:='unverified';
  v_reason text:='Customer location not configured';
  v_event_id uuid;
begin
  select * into v_staff from public.staff where user_id=(select auth.uid()) limit 1;
  select * into v_visit from public.field_visits where id=p_visit_id and business_id=v_staff.business_id for update;
  if v_visit.id is null or v_visit.assigned_staff_id <> v_staff.id then raise exception using errcode='42501',message='VISIT_NOT_ASSIGNED'; end if;
  if v_visit.status in ('completed','cancelled') then raise exception using errcode='P0001',message='VISIT_CLOSED'; end if;
  if p_lat is not null and p_lng is not null and v_visit.customer_location is not null then
    v_distance:=extensions.st_distance(v_visit.customer_location,extensions.st_setsrid(extensions.st_makepoint(p_lng::double precision,p_lat::double precision),4326)::extensions.geography);
    if v_distance <= v_visit.radius_meters then v_verification:='verified';v_reason:='Within customer location radius';
    else v_verification:='outside_geofence';v_reason:='Outside customer location radius'; end if;
  end if;
  update public.field_visits set status=case when v_verification='verified' then 'verified' else 'arrived' end,arrived_at=v_now,arrival_lat=p_lat,arrival_lng=p_lng,arrival_accuracy_meters=p_accuracy_meters,arrival_distance_meters=v_distance,arrival_verification_status=v_verification,arrival_verification_reason=v_reason,updated_at=v_now where id=v_visit.id returning * into v_visit;
  insert into public.field_visit_events (business_id,visit_id,staff_id,event_type,client_event_id,captured_at,server_received_at,latitude,longitude,accuracy_meters,distance_meters,verification_status,verification_reason,device,network_state) values (v_staff.business_id,v_visit.id,v_staff.id,case when v_verification='verified' then 'verified' else 'arrived' end,p_client_event_id,v_now,v_now,p_lat,p_lng,p_accuracy_meters,v_distance,v_verification,v_reason,p_device,p_network_state) on conflict(client_event_id) do nothing returning id into v_event_id;
  return jsonb_build_object('ok',true,'visit_id',v_visit.id,'event_id',coalesce(v_event_id,p_client_event_id),'status',v_visit.status,'verification_status',v_verification,'distance_meters',v_distance);
end;
$$;

create or replace function public.complete_field_visit(
  p_visit_id uuid,
  p_outcome text,
  p_notes text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_meters numeric default null,
  p_device text default null,
  p_network_state text default 'online',
  p_client_event_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_visit public.field_visits%rowtype;
  v_now timestamptz:=now();
  v_distance numeric;
  v_verification text:='unverified';
  v_reason text:='Customer location not configured';
  v_event_id uuid;
begin
  select * into v_staff from public.staff where user_id=(select auth.uid()) limit 1;
  select * into v_visit from public.field_visits where id=p_visit_id and business_id=v_staff.business_id for update;
  if v_visit.id is null or v_visit.assigned_staff_id <> v_staff.id then raise exception using errcode='42501',message='VISIT_NOT_ASSIGNED'; end if;
  if v_visit.status in ('completed','cancelled') then raise exception using errcode='P0001',message='VISIT_CLOSED'; end if;
  if p_lat is not null and p_lng is not null and v_visit.customer_location is not null then
    v_distance:=extensions.st_distance(v_visit.customer_location,extensions.st_setsrid(extensions.st_makepoint(p_lng::double precision,p_lat::double precision),4326)::extensions.geography);
    if v_distance <= v_visit.radius_meters then v_verification:='verified';v_reason:='Within customer location radius';
    else v_verification:='outside_geofence';v_reason:='Outside customer location radius'; end if;
  end if;
  update public.field_visits set status='completed',completed_at=v_now,completion_lat=p_lat,completion_lng=p_lng,completion_accuracy_meters=p_accuracy_meters,completion_distance_meters=v_distance,completion_verification_status=v_verification,completion_verification_reason=v_reason,outcome=p_outcome,notes=coalesce(p_notes,notes),updated_at=v_now where id=v_visit.id returning * into v_visit;
  insert into public.field_visit_events (business_id,visit_id,staff_id,event_type,client_event_id,captured_at,server_received_at,latitude,longitude,accuracy_meters,distance_meters,verification_status,verification_reason,device,network_state,payload) values (v_staff.business_id,v_visit.id,v_staff.id,'completed',p_client_event_id,v_now,v_now,p_lat,p_lng,p_accuracy_meters,v_distance,v_verification,v_reason,p_device,p_network_state,jsonb_build_object('outcome',p_outcome)) on conflict(client_event_id) do nothing returning id into v_event_id;
  return jsonb_build_object('ok',true,'visit_id',v_visit.id,'event_id',coalesce(v_event_id,p_client_event_id),'status','completed','verification_status',v_verification,'distance_meters',v_distance);
end;
$$;

revoke all on function public.clock_in_staff(numeric,numeric,numeric,text,text,uuid) from public, anon;
revoke all on function public.clock_out_staff(numeric,numeric,numeric,text,text,uuid) from public, anon;
revoke all on function public.create_field_visit(uuid,text,text,text,numeric,numeric,numeric,timestamptz,text) from public, anon;
revoke all on function public.start_field_visit(uuid,numeric,numeric,numeric,text,text,uuid) from public, anon;
revoke all on function public.complete_field_visit(uuid,text,text,numeric,numeric,text,text,uuid) from public, anon;
grant execute on function public.clock_in_staff(numeric,numeric,numeric,text,text,uuid) to authenticated;
grant execute on function public.clock_out_staff(numeric,numeric,numeric,text,text,uuid) to authenticated;
grant execute on function public.create_field_visit(uuid,text,text,text,numeric,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.start_field_visit(uuid,numeric,numeric,numeric,text,text,uuid) to authenticated;
grant execute on function public.complete_field_visit(uuid,text,text,numeric,numeric,text,text,uuid) to authenticated;

notify pgrst, 'reload schema';