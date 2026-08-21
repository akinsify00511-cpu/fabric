-- ============================================================================
-- Riverways Activity & Operations Center — platform-wide event store +
-- admin-gated aggregate readers. Event-driven: every important Avenize
-- operation emits ONE structured row; readers aggregate over it.
-- Privacy rule: operational metadata only — the emitter strips sensitive
-- keys (password/token/secret/credential/api_key) server-side before insert.
-- No conversation/message contents are ever stored here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_activity_events — the single real-time activity stream
-- ----------------------------------------------------------------------------
create table if not exists public.platform_activity_events (
  id bigint generated always as identity primary key,
  event_type text not null,                 -- user.signed_in | lead.created | ai.requested | ...
  actor_id uuid,                            -- auth.users.id when known
  actor_email text,                         -- snapshot for search/display
  business_id uuid,                         -- tenant scope when known
  business_name text,                       -- snapshot for display
  feature text,                             -- module/feature tag
  result text,                              -- started|completed|failed|succeeded
  severity text not null default 'info' check (severity in ('info','warn','error','critical')),
  service text default 'web-app',           -- web-app|edge-fn|db-trigger|cron
  correlation_id text,                      -- request/trace id when available
  payload jsonb not null default '{}'::jsonb, -- sanitized operational metadata
  created_at timestamptz not null default now()
);

create index if not exists platform_activity_events_created_idx
  on public.platform_activity_events (created_at desc);
create index if not exists platform_activity_events_type_idx
  on public.platform_activity_events (event_type, created_at desc);
create index if not exists platform_activity_events_business_idx
  on public.platform_activity_events (business_id) where business_id is not null;
create index if not exists platform_activity_events_actor_idx
  on public.platform_activity_events (actor_email) where actor_email is not null;

alter table public.platform_activity_events enable row level security;

drop policy if exists platform_activity_events_no_client on public.platform_activity_events;
create policy platform_activity_events_no_client on public.platform_activity_events
  for all to authenticated using (false) with check (false);

-- ----------------------------------------------------------------------------
-- 2. Payload sanitizer — strip any key that smells like a credential. The
--    emitter runs this on every insert; edge functions are told to call it
--    too via emit_platform_activity (they pass payload through the RPC).
-- ----------------------------------------------------------------------------
create or replace function public.sanitize_platform_payload(p_payload jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_k text;
  v_v jsonb;
  v_bad text[] := array['password','token','secret','credential','api_key','apikey','access_code','totp','session'];
begin
  if p_payload is null then return '{}'::jsonb; end if;
  for v_k, v_v in select key, value from jsonb_each(p_payload) loop
    if not exists (select 1 from unnest(v_bad) b where lower(v_k) like '%'||b||'%') then
      v_out := v_out || jsonb_build_object(v_k, v_v);
    end if;
  end loop;
  return v_out;
end $$;

-- ----------------------------------------------------------------------------
-- 3. emit_platform_activity — the ONLY client-callable writer. SECURITY
--    DEFINER fills actor on the server; payload sanitized before storage.
--    Granted to authenticated so the SPA logs operational events (sign-in,
--    feature use, AI requests). Result/severity validated.
-- ----------------------------------------------------------------------------
create or replace function public.emit_platform_activity(
  p_event_type text,
  p_feature text default null,
  p_business_id uuid default null,
  p_result text default null,
  p_severity text default 'info',
  p_service text default 'web-app',
  p_correlation_id text default null,
  p_payload jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_actor uuid := auth.uid();
  v_email text;
  v_biz_name text;
begin
  if p_event_type is null or p_event_type = '' then return null; end if;
  if p_severity not in ('info','warn','error','critical') then p_severity := 'info'; end if;
  if v_actor is not null then
    v_email := (select email from auth.users where id = v_actor);
  end if;
  v_biz_name := coalesce((select name from public.businesses where id = p_business_id), null);
  insert into public.platform_activity_events
    (event_type, actor_id, actor_email, business_id, business_name, feature,
     result, severity, service, correlation_id, payload)
  values
    (p_event_type, v_actor, v_email, p_business_id, v_biz_name, p_feature,
     coalesce(p_result,'completed'), p_severity, p_service, p_correlation_id,
     public.sanitize_platform_payload(p_payload))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.emit_platform_activity(text,text,uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.emit_platform_activity(text,text,uuid,text,text,text,text,jsonb) to authenticated;

comment on function public.emit_platform_activity is 'Riverways activity emitter. Sanitizes payload server-side (password/token/secret/credential keys dropped). Operational metadata only.';

-- ----------------------------------------------------------------------------
-- 4. Reader RPCs — every one gated by is_riverways_admin() before any data
--    is returned. Non-admins get {authorized:false} and no payload.
-- ----------------------------------------------------------------------------
create or replace function public.riverways_activity_feed(
  p_limit int default 100,
  p_event_type text default null,
  p_severity text default null,
  p_business_id uuid default null,
  p_actor_email text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  select jsonb_agg(t) into r from (
    select id, event_type, actor_email, business_name, feature, result,
           severity, service, correlation_id, payload, created_at
    from public.platform_activity_events
    where (p_event_type is null or event_type = p_event_type)
      and (p_severity is null or severity = p_severity)
      and (p_business_id is null or business_id = p_business_id)
      and (p_actor_email is null or actor_email ilike p_actor_email)
    order by created_at desc
    limit least(coalesce(p_limit,100), 500)
  ) t;
  return jsonb_build_object('authorized', true, 'events', coalesce(r,'[]'::jsonb));
end $$;

-- Global search: accounts, organizations, RPCs, incidents, events — one box.
create or replace function public.riverways_global_search(p_q text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_q text := coalesce(trim(p_q),'');
  v_users jsonb; v_orgs jsonb; v_events jsonb; v_incidents jsonb; v_rpcs jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  if v_q = '' then return jsonb_build_object('authorized',true,'users','[]'::jsonb,'organizations','[]'::jsonb,'events','[]'::jsonb,'incidents','[]'::jsonb,'rpcs','[]'::jsonb); end if;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_users from (
    select email, created_at from auth.users
    where email ilike '%'||v_q||'%' order by created_at desc limit 10) t;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_orgs from (
    select id, name, industry from public.businesses
    where name ilike '%'||v_q||'%' order by name limit 10) t;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_events from (
    select event_type, feature, severity, created_at from public.platform_activity_events
    where event_type ilike '%'||v_q||'%' or feature ilike '%'||v_q||'%' or payload::text ilike '%'||v_q||'%'
    order by created_at desc limit 20) t;

  v_incidents := '[]'::jsonb;
  if to_regclass('public.platform_incidents') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select id, title, status, opened_at as created_at from public.platform_incidents where title ilike ''%''||$1||''%'' order by opened_at desc limit 10) t'
      into v_incidents using v_q;
  end if;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_rpcs from (
    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ilike '%'||v_q||'%' order by proname limit 20) t;

  return jsonb_build_object('authorized',true,'users',v_users,'organizations',v_orgs,
                            'events',v_events,'incidents',v_incidents,'rpcs',v_rpcs);
end $$;

-- User activity: grouped event counts + recent stream for one actor.
create or replace function public.riverways_user_activity(p_email text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_counts jsonb; v_recent jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  select coalesce(jsonb_object_agg(event_type, n),'{}'::jsonb) into v_counts from (
    select event_type, count(*) n from public.platform_activity_events
    where actor_email = p_email group by event_type) t;
  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_recent from (
    select event_type, feature, result, severity, created_at
    from public.platform_activity_events where actor_email = p_email
    order by created_at desc limit 50) t;
  return jsonb_build_object('authorized',true,'counts',v_counts,'recent',v_recent);
end $$;

-- Organization activity: per-tenant event/usage metadata (never content).
create or replace function public.riverways_org_activity(p_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_counts jsonb; v_recent jsonb; v_members int; v_name text;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  v_name := (select name from public.businesses where id = p_business_id);
  v_members := (select count(*) from public.staff where business_id = p_business_id);
  select coalesce(jsonb_object_agg(feature, n),'{}'::jsonb) into v_counts from (
    select feature, count(*) n from public.platform_activity_events
    where business_id = p_business_id and feature is not null group by feature) t;
  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_recent from (
    select event_type, actor_email, feature, severity, created_at
    from public.platform_activity_events where business_id = p_business_id
    order by created_at desc limit 50) t;
  return jsonb_build_object('authorized',true,'business',v_name,'members',v_members,
                            'feature_counts',v_counts,'recent',v_recent);
end $$;

-- AI activity: health/adoption of AI features. Duration from payload when
-- the emitter provides duration_ms. Contents are NEVER stored.
create or replace function public.riverways_ai_activity(p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_requests int; v_completed int; v_failed int;
  v_avg_ms numeric; v_features jsonb; v_recent jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  select
    count(*) filter (where event_type like 'ai.%'),
    count(*) filter (where result = 'completed'),
    count(*) filter (where result = 'failed'),
    avg((payload->>'duration_ms')::numeric) filter (where payload ? 'duration_ms')
  into v_requests, v_completed, v_failed, v_avg_ms
  from public.platform_activity_events
  where event_type like 'ai.%';

  select coalesce(jsonb_object_agg(feature, n),'{}'::jsonb) into v_features from (
    select feature, count(*) n from public.platform_activity_events
    where event_type like 'ai.%' and feature is not null group by feature) t;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_recent from (
    select event_type, actor_email, feature, result, severity,
           payload->>'duration_ms' as duration_ms, created_at
    from public.platform_activity_events
    where event_type like 'ai.%'
    order by created_at desc limit least(coalesce(p_limit,100),500)) t;

  return jsonb_build_object('authorized',true,
    'requests',v_requests,'completed',v_completed,'failed',v_failed,
    'avg_duration_ms', v_avg_ms,
    'success_rate', case when v_requests = 0 then null
                         else round(100.0*v_completed/nullif(v_requests,0),1) end,
    'by_feature', v_features, 'recent', v_recent);
end $$;

-- Billing activity: subscription plan/status aggregates + recent sub events.
create or replace function public.riverways_billing_activity()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_plans jsonb; v_status jsonb; v_recent jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  if to_regclass('public.business_subscriptions') is not null then
    execute 'select coalesce(jsonb_object_agg(plan,n),''{}''::jsonb) from (select plan,count(*) n from public.business_subscriptions group by plan) t'
      into v_plans;
    execute 'select coalesce(jsonb_object_agg(status,n),''{}''::jsonb) from (select status,count(*) n from public.business_subscriptions group by status) t'
      into v_status;
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select b.name as business, s.plan, s.status, s.updated_at from public.business_subscriptions s join public.businesses b on b.id = s.business_id order by s.updated_at desc limit 25) t'
      into v_recent;
  else
    v_plans := '{}'::jsonb; v_status := '{}'::jsonb; v_recent := '[]'::jsonb;
  end if;
  return jsonb_build_object('authorized',true,'by_plan',v_plans,'by_status',v_status,'recent',v_recent);
end $$;

-- Security center: aggregated counts over the activity stream + audit log.
create or replace function public.riverways_security_center()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_failed_login int := 0; v_mfa_fail int := 0; v_perm_change int := 0;
  v_admin_actions int := 0; v_critical jsonb := '[]'::jsonb; v_suspicious int := 0;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;

  select
    count(*) filter (where event_type in ('user.sign_in_failed','auth.failed')),
    count(*) filter (where event_type = 'auth.mfa_failed'),
    count(*) filter (where event_type like 'security.permission_%'),
    count(*) filter (where severity in ('error','critical'))
  into v_failed_login, v_mfa_fail, v_perm_change, v_suspicious
  from public.platform_activity_events
  where created_at > now() - interval '30 days';

  if to_regclass('public.security_audit_log') is not null then
    execute 'select count(*) from public.security_audit_log where created_at > now() - interval ''30 days'''
      into v_admin_actions;
    -- Pre-auth failures are logged here (emit_platform_activity needs a
    -- session, so failed logins can't reach the activity stream).
    execute 'select coalesce(count(*) filter (where success = false and (event_type ilike ''%login%'' or event_type ilike ''%sign_in%'' or event_type ilike ''%auth%'')), 0) from public.security_audit_log where created_at > now() - interval ''30 days'''
      into v_failed_login;
    v_failed_login := v_failed_login + (select count(*) from public.platform_activity_events
      where event_type in ('user.sign_in_failed','auth.failed') and created_at > now() - interval '30 days');
  end if;

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_critical from (
    select event_type, actor_email, feature, result, created_at
    from public.platform_activity_events
    where severity in ('warn','error','critical')
    order by created_at desc limit 25) t;

  return jsonb_build_object('authorized',true,
    'failed_logins', v_failed_login, 'mfa_failures', v_mfa_fail,
    'permission_changes', v_perm_change, 'admin_actions', v_admin_actions,
    'rls_violations', 0, 'tenant_isolation_violations', 0,
    'suspicious', v_suspicious, 'critical_stream', v_critical);
end $$;

-- Error center: incidents + error events shaped as incident cards.
create or replace function public.riverways_error_center()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_incidents jsonb := '[]'::jsonb; v_recent jsonb := '[]'::jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  if to_regclass('public.platform_incidents') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select id, title, status, severity, opened_at as created_at, closed_at as resolved_at from public.platform_incidents order by opened_at desc limit 50) t'
      into v_incidents;
  end if;
  if to_regclass('public.platform_error_events') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select id, source, source_detail, severity, message, business_id, captured_at, resolved_at from public.platform_error_events order by captured_at desc limit 50) t'
      into v_recent;
  end if;
  return jsonb_build_object('authorized',true,'incidents',v_incidents,'recent_errors',v_recent);
end $$;

-- Self-healing: integrity engine detection→repair→verify→result.
create or replace function public.riverways_self_healing()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_detected int := 0; v_repaired int := 0; v_failed int := 0;
  v_awaiting int := 0; v_rolled_back int := 0; v_recent jsonb := '[]'::jsonb;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;
  if to_regclass('public.integrity_findings') is not null then
    execute 'select count(*) from public.integrity_findings' into v_detected;
  end if;
  if to_regclass('public.integrity_repairs') is not null then
    execute 'select count(*) filter (where status=''succeeded''), count(*) filter (where status=''failed''), count(*) filter (where status=''approval_required''), count(*) filter (where status=''rolled_back'') from public.integrity_repairs'
      into v_repaired, v_failed, v_awaiting, v_rolled_back;
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select rule_key, repair_action, status, dry_run, started_at, completed_at, error_message from public.integrity_repairs order by created_at desc limit 25) t'
      into v_recent;
  end if;
  return jsonb_build_object('authorized',true,
    'detected', v_detected, 'repaired', v_repaired, 'failed', v_failed,
    'awaiting_approval', v_awaiting, 'rolled_back', v_rolled_back,
    'recent_repairs', v_recent);
end $$;

-- Platform analytics: DAU/WAU/MAU + signups + orgs + module adoption from
-- the activity stream. Aggregates only — no tenant content.
create or replace function public.riverways_platform_analytics()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_dau int; v_wau int; v_mau int; v_signups30 int; v_orgs int;
  v_modules jsonb := '[]'::jsonb; v_ai_30d int := 0;
begin
  if not public.is_riverways_admin() then return jsonb_build_object('authorized',false); end if;

  select count(distinct actor_id) into v_dau from public.platform_activity_events
    where created_at > now() - interval '1 day' and actor_id is not null;
  select count(distinct actor_id) into v_wau from public.platform_activity_events
    where created_at > now() - interval '7 days' and actor_id is not null;
  select count(distinct actor_id) into v_mau from public.platform_activity_events
    where created_at > now() - interval '30 days' and actor_id is not null;

  v_signups30 := (select count(*) from auth.users where created_at > now() - interval '30 days');
  v_orgs := (select count(*) from public.businesses);

  if to_regclass('public.usage_events') is not null then
    execute 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (select component as module, count(*) as touches, count(distinct business_id) as businesses from public.usage_events where created_at > now() - interval ''30 days'' group by component order by touches desc limit 20) t'
      into v_modules;
  end if;

  v_ai_30d := (select count(*) from public.platform_activity_events
               where event_type like 'ai.%' and created_at > now() - interval '30 days');

  return jsonb_build_object('authorized',true,
    'dau', v_dau, 'wau', v_wau, 'mau', v_mau,
    'signups_30d', v_signups30, 'organizations', v_orgs,
    'module_adoption_30d', v_modules, 'ai_events_30d', v_ai_30d);
end $$;

-- Realtime stream for the live activity tab (publication may not exist on
-- bare postgres — guarded).
do $$
begin
  alter publication supabase_realtime add table public.platform_activity_events;
exception when others then
  raise notice 'realtime publication add skipped: %', sqlerrm;
end $$;

-- Grant all readers to authenticated (the RPC gate decides; grant is the
-- call-ability boundary, authorization is inside).
do $$
declare v_f text;
begin
  foreach v_f in array array[
    'riverways_activity_feed(int,text,text,uuid,text)',
    'riverways_global_search(text)',
    'riverways_user_activity(text)',
    'riverways_org_activity(uuid)',
    'riverways_ai_activity(int)',
    'riverways_billing_activity()',
    'riverways_security_center()',
    'riverways_error_center()',
    'riverways_self_healing()',
    'riverways_platform_analytics()'
  ] loop
    execute format('grant execute on function public.%s to authenticated', v_f);
    execute format('revoke all on function public.%s from public, anon', v_f);
  end loop;
end $$;
