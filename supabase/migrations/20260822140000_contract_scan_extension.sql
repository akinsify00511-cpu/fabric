-- ============================================================================
-- Production Contract Reconciliation — scanner extension.
--
-- Generalizes run_integrity_scan() from the single hardcoded meeting_analytics
-- check to the full Production Contract (seeded into integrity_rules by
-- 20260822160000_contract_integrity_seed.sql, which is GENERATED from the
-- canonical migration chain + the frontend's actual references).
--
-- Object kinds checked:
--   function -> pg_proc existence + identity-argument drift
--   table    -> to_regclass
--   view     -> to_regclass
--   bucket   -> storage.buckets (guarded for hosts without the storage schema)
--
-- Statuses returned: healthy | drift | missing | registered.
-- Repair policy (by design): the scanner NEVER executes DDL. Repairable
-- objects are repaired by applying the canonical migration named in
-- contract->>'defined_in'. Security-sensitive objects open a critical
-- finding (SECURITY_REPAIR_REQUIRED) for a human operator.
-- ============================================================================

-- contract_status marks a rule as contract-managed ('registered') so the seed
-- can mirror the contract exactly (update + prune) without touching bespoke
-- rules, and the self-healing console can distinguish rule classes.
alter table public.integrity_rules
  add column if not exists contract_status text;

-- Normalize an identity-argument string for drift comparison: lowercase,
-- collapse whitespace, unify common type aliases.
create or replace function public.contract_normalize_args(p_args text)
returns text
language sql
immutable
as $$
  -- Canonicalize type aliases with WORD-BOUNDARY matching ('int' must not
  -- corrupt 'integer'/'int4'). Keep in sync with normalize_type() in
  -- scripts/generate_contract_manifest.py and scripts/verify_production_contract.py.
  select trim(both ' ' from
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      lower(regexp_replace(coalesce(p_args, ''), '\s+', ' ', 'g')),
      'character varying', 'text', 'g'),
      'timestamp with time zone', 'timestamptz', 'g'),
      'timestamp without time zone', 'timestamp', 'g'),
      'double precision', 'float8', 'g'),
      '\mbigserial\M', 'int8', 'g'),
      '\mbigint\M', 'int8', 'g'),
      '\msmallint\M', 'int2', 'g'),
      '\minteger\M', 'int4', 'g'),
      '\mint\M', 'int4', 'g'),
      '\mserial\M', 'int4', 'g'),
      '\mdecimal\M', 'numeric', 'g'));
$$;

-- Compare contract signatures against live overloads. Returns:
--   'healthy'  - at least one live overload matches one contract signature
--   'drift'    - function exists but no overload matches any contract signature
--   'missing'  - function does not exist
create or replace function public.contract_function_status(p_name text, p_signatures jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_live text[];
  v_expected text;
  v_actual text;
begin
  select array_agg(public.contract_normalize_args(pg_get_function_identity_arguments(p.oid)))
    into v_live
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_name;

  if v_live is null then
    return 'missing';
  end if;

  -- No recorded signatures: existence is the whole contract.
  if p_signatures is null or jsonb_array_length(p_signatures) = 0 then
    return 'healthy';
  end if;

  for v_expected in select value #>> '{}' from jsonb_array_elements(p_signatures) loop
    v_expected := public.contract_normalize_args(v_expected);
    -- Empty contract signature matches the zero-arg overload.
    foreach v_actual in array v_live loop
      if v_actual = v_expected then
        return 'healthy';
      end if;
    end loop;
  end loop;

  return 'drift';
end;
$$;

-- Contract findings have business_id NULL; the table's unique constraint
-- includes business_id and Postgres treats NULLs as distinct, so without a
-- NULL-scoped arbiter index every scan would insert a duplicate finding.
create unique index if not exists integrity_findings_contract_object_uniq
  on public.integrity_findings (rule_key, object_type, object_name, status)
  where business_id is null;

create or replace function public.run_integrity_scan()
returns table(rule_key text, status text, object_type text, object_name text, evidence jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r record;
  v_status text;
  v_kind text;
  v_name text;
  v_finding uuid;
  v_evidence jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin required' using errcode = '42501';
  end if;

  for r in select * from public.integrity_rules where is_active loop
    v_kind := coalesce(r.contract ->> 'object_type', '');
    v_name := r.contract ->> 'object_name';

    if v_kind = 'function' then
      v_status := public.contract_function_status(v_name, r.contract -> 'signatures');
    elsif v_kind in ('table', 'view') then
      v_status := case when to_regclass('public.' || v_name) is not null then 'healthy' else 'missing' end;
    elsif v_kind = 'bucket' then
      v_status := case
        when to_regclass('storage.buckets') is null then 'registered'
        when exists (select 1 from storage.buckets b where b.name = v_name) then 'healthy'
        else 'missing'
      end;
    else
      v_status := 'registered';
    end if;

    if v_status in ('healthy', 'registered') then
      update public.integrity_findings f
         set status = 'resolved',
             resolved_at = coalesce(f.resolved_at, now()),
             last_seen_at = now()
       where f.rule_key = r.rule_key
         and f.object_name is not distinct from v_name
         and f.status in ('open', 'failed', 'repairing');
      return query select r.rule_key, v_status, nullif(v_kind, ''), v_name,
        jsonb_build_object('exists', true, 'status', v_status);
    else
      v_evidence := jsonb_build_object(
        'exists', v_status <> 'missing',
        'status', v_status,
        'auto_repair', r.auto_repair,
        'repair_action', r.repair_action,
        'defined_in', r.contract ->> 'defined_in',
        'remediation', case
          when r.repair_action = 'security_repair_required'
            then 'SECURITY_REPAIR_REQUIRED: apply the canonical migration manually after review: ' || coalesce(r.contract ->> 'defined_in', 'unknown')
          else 'Apply the canonical migration: ' || coalesce(r.contract ->> 'defined_in', 'unknown')
        end
      );
      insert into public.integrity_findings(rule_key, object_type, object_name, status, severity, evidence)
      values (r.rule_key, v_kind, v_name, 'open', r.severity, v_evidence)
      on conflict (rule_key, object_type, object_name, status) where business_id is null do update
        set last_seen_at = now(), evidence = excluded.evidence
      returning id into v_finding;
      return query select r.rule_key, v_status, nullif(v_kind, ''), v_name,
        v_evidence || jsonb_build_object('finding_id', v_finding);
    end if;
  end loop;

  -- Resolve findings whose rule left the contract (object dropped from the
  -- canonical chain) so stale findings can never linger open.
  update public.integrity_findings f
     set status = 'resolved',
         resolved_at = coalesce(f.resolved_at, now()),
         last_seen_at = now()
   where f.status in ('open', 'failed', 'repairing')
     and not exists (select 1 from public.integrity_rules ir
                      where ir.rule_key = f.rule_key and ir.is_active);
end;
$$;

grant execute on function public.run_integrity_scan() to authenticated;
grant execute on function public.contract_function_status(text, jsonb) to authenticated;
grant execute on function public.contract_normalize_args(text) to authenticated;
