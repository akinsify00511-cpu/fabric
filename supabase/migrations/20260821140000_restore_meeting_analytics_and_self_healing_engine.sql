-- Avenize Integrity & Self-Healing Engine foundation
-- Restores the production Meetings analytics RPC and records the repair contract.

create table if not exists public.integrity_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  auto_repair boolean not null default false,
  repair_action text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integrity_findings (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.integrity_rules(rule_key) on delete cascade,
  business_id uuid,
  object_type text,
  object_name text,
  status text not null default 'open' check (status in ('open','repairing','resolved','ignored','failed')),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(rule_key,business_id,object_type,object_name,status)
);

create table if not exists public.integrity_repairs (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references public.integrity_findings(id) on delete set null,
  rule_key text not null,
  repair_action text not null,
  status text not null default 'planned' check (status in ('planned','running','succeeded','failed','rolled_back','approval_required')),
  dry_run boolean not null default false,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.integrity_rules enable row level security;
alter table public.integrity_findings enable row level security;
alter table public.integrity_repairs enable row level security;

drop policy if exists integrity_rules_platform_admin on public.integrity_rules;
drop policy if exists integrity_findings_platform_admin on public.integrity_findings;
drop policy if exists integrity_repairs_platform_admin on public.integrity_repairs;
create policy integrity_rules_platform_admin on public.integrity_rules for select using (public.is_platform_admin());
create policy integrity_findings_platform_admin on public.integrity_findings for select using (public.is_platform_admin());
create policy integrity_repairs_platform_admin on public.integrity_repairs for select using (public.is_platform_admin());

create or replace function public.meeting_analytics(p_business_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
  v_completed bigint;
  v_upcoming bigint;
  v_cancelled bigint;
  v_overdue bigint;
  v_by_status jsonb;
  v_by_staff jsonb;
  v_daily jsonb;
begin
  perform public.assert_business_access(p_business_id);
  select count(*) into v_total from public.meetings where business_id = p_business_id;
  select count(*) into v_completed from public.meetings where business_id = p_business_id and lower(status) in ('completed','complete','done');
  select count(*) into v_upcoming from public.meetings where business_id = p_business_id and date >= current_date and lower(status) not in ('cancelled','canceled','completed','complete','done');
  select count(*) into v_cancelled from public.meetings where business_id = p_business_id and lower(status) in ('cancelled','canceled');
  select count(*) into v_overdue from public.meetings where business_id = p_business_id and (date + start_time) < now() and lower(status) not in ('cancelled','canceled','completed','complete','done');
  select coalesce(jsonb_agg(jsonb_build_object('status',status,'count',cnt) order by status),'[]'::jsonb) into v_by_status from (select coalesce(nullif(status,''),'unknown') status,count(*) cnt from public.meetings where business_id=p_business_id group by status) s;
  select coalesce(jsonb_agg(jsonb_build_object('staff_id',staff_id,'count',cnt) order by cnt desc),'[]'::jsonb) into v_by_staff from (select staff_id,count(*) cnt from public.meetings where business_id=p_business_id group by staff_id) s;
  select coalesce(jsonb_agg(jsonb_build_object('date',meeting_date,'count',cnt) order by meeting_date),'[]'::jsonb) into v_daily from (select date meeting_date,count(*) cnt from public.meetings where business_id=p_business_id and date >= current_date - 30 group by date) d;
  return jsonb_build_object('total_meetings',v_total,'completed_meetings',v_completed,'upcoming_meetings',v_upcoming,'cancelled_meetings',v_cancelled,'overdue_meetings',v_overdue,'by_status',v_by_status,'by_staff',v_by_staff,'daily',v_daily,'generated_at',now());
end;
$$;

create or replace function public.meeting_analytics()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_business_id uuid;
begin
  select business_id into v_business_id from public.staff where user_id=auth.uid() and is_active=true limit 1;
  if v_business_id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return public.meeting_analytics(v_business_id);
end;
$$;

grant execute on function public.meeting_analytics(uuid) to authenticated;
grant execute on function public.meeting_analytics() to authenticated;

insert into public.integrity_rules(rule_key,name,description,severity,auto_repair,repair_action)
values
('frontend_rpc_contract','Frontend RPC contract','Detect application RPC dependencies that are missing or unavailable in production.','critical',true,'ensure_known_rpc'),
('ui_async_data_safety','UI async data safety','Require loading, error, empty and null-safe states around asynchronous application data.','warning',false,'code_patch_required'),
('database_schema_drift','Database schema drift','Detect differences between the application contract and production database schema.','critical',false,'migration_required'),
('tenant_isolation','Tenant isolation','Verify business-scoped data paths cannot cross tenant boundaries.','critical',false,'approval_required')
on conflict(rule_key) do update set name=excluded.name,description=excluded.description,severity=excluded.severity,auto_repair=excluded.auto_repair,repair_action=excluded.repair_action,updated_at=now();

comment on table public.integrity_rules is 'Avenize self-healing rule registry. Only trusted service/admin paths may mutate rules.';
comment on table public.integrity_findings is 'Avenize detected application/database/infrastructure integrity findings.';
comment on table public.integrity_repairs is 'Avenize repair ledger with explicit lifecycle and rollback metadata.';
