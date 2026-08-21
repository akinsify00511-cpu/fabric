alter table public.integrity_rules add column if not exists contract jsonb not null default '{}'::jsonb;

update public.integrity_rules
set contract='{"object_type":"function","object_name":"meeting_analytics","signatures":["","p_business_id uuid"],"repairable":true}'::jsonb
where rule_key='frontend_rpc_contract';

create or replace function public.run_integrity_scan()
returns table(rule_key text, status text, object_type text, object_name text, evidence jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record; v_exists boolean; v_finding uuid;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin required' using errcode='42501'; end if;
  for r in select * from public.integrity_rules where is_active loop
    if coalesce(r.contract->>'object_type','')='function' then
      select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.contract->>'object_name') into v_exists;
      if v_exists then
        return query select r.rule_key,'healthy',r.contract->>'object_type',r.contract->>'object_name',jsonb_build_object('exists',true);
        update public.integrity_findings set status='resolved',resolved_at=coalesce(resolved_at,now()),last_seen_at=now() where rule_key=r.rule_key and object_name=r.contract->>'object_name' and status in ('open','failed','repairing');
      else
        insert into public.integrity_findings(rule_key,object_type,object_name,status,severity,evidence)
        values(r.rule_key,r.contract->>'object_type',r.contract->>'object_name','open',r.severity,jsonb_build_object('exists',false,'auto_repair',r.auto_repair))
        returning id into v_finding;
        return query select r.rule_key,'missing',r.contract->>'object_type',r.contract->>'object_name',jsonb_build_object('exists',false,'auto_repair',r.auto_repair,'finding_id',v_finding);
      end if;
    else
      return query select r.rule_key,'registered',null::text,null::text,r.contract;
    end if;
  end loop;
end;
$$;

grant execute on function public.run_integrity_scan() to authenticated;
