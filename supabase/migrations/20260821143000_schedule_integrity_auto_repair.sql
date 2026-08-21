create extension if not exists pg_cron with schema pg_catalog;

update public.integrity_rules
set contract='{"object_type":"function","object_name":"meeting_analytics","signatures":["p_period_days integer"],"repairable":true}'::jsonb
where rule_key='frontend_rpc_contract';

create or replace function public.ensure_meeting_analytics_contract()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='meeting_analytics' and pg_get_function_identity_arguments(p.oid)='p_period_days integer') then
    return jsonb_build_object('status','healthy','object','meeting_analytics');
  end if;
  -- The repair body is deliberately fixed and contains no caller-controlled SQL.
  execute $fn$
    create or replace function public.meeting_analytics(p_period_days integer default 30)
    returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
    as $body$
    declare v_business_id uuid; v_start_date date := current_date - greatest(coalesce(p_period_days,30),1) + 1;
      v_total bigint; v_hours numeric; v_transcripts bigint; v_decisions bigint; v_actions bigint; v_wasted jsonb; v_staff jsonb;
    begin
      select business_id into v_business_id from public.staff where user_id=auth.uid() and is_active=true limit 1;
      if v_business_id is null then raise exception 'Not authorized' using errcode='42501'; end if;
      select count(*),coalesce(sum(extract(epoch from ((date+end_time)-(date+start_time)))/3600),0) into v_total,v_hours from public.meetings where business_id=v_business_id and date>=v_start_date and date<=current_date+1;
      select count(*) into v_transcripts from public.meeting_captures where business_id=v_business_id and created_at::date>=v_start_date and lower(capture_type) in ('transcript','transcription','meeting_transcript');
      select count(*) into v_decisions from public.meeting_captures where business_id=v_business_id and created_at::date>=v_start_date and lower(capture_type) in ('decision','decisions');
      select count(*) into v_actions from public.meeting_captures where business_id=v_business_id and created_at::date>=v_start_date and lower(capture_type) in ('action','actions','action_item','action_items');
      select coalesce(jsonb_agg(jsonb_build_object('meeting_id',m.id,'title',m.title,'date',m.date,'duration_hours',case when m.start_time is not null and m.end_time is not null then round((extract(epoch from ((m.date+m.end_time)-(m.date+m.start_time)))/3600)::numeric,2) else null end) order by m.date desc),'[]'::jsonb) into v_wasted from public.meetings m where m.business_id=v_business_id and m.date>=v_start_date and m.date<=current_date and coalesce(nullif(trim(m.notes),''),'')='' and coalesce(nullif(trim(m.agenda),''),'')='' and not exists(select 1 from public.meeting_captures c where c.meeting_id=m.id);
      select coalesce(jsonb_agg(jsonb_build_object('staff_id',s.id,'staff_name',coalesce(nullif(s.full_name,''),s.name,s.email),'meetings_created',(select count(*) from public.meetings m where m.business_id=v_business_id and m.staff_id=s.id and m.date>=v_start_date),'meetings_attended',(select count(*) from public.meetings m where m.business_id=v_business_id and m.date>=v_start_date and m.attendees is not null and m.attendees::text like '%'||s.id::text||'%')) order by coalesce(nullif(s.full_name,''),s.name,s.email)),'[]'::jsonb) into v_staff from public.staff s where s.business_id=v_business_id and s.is_active=true;
      return jsonb_build_object('period_days',greatest(coalesce(p_period_days,30),1),'totals',jsonb_build_object('total_meetings',v_total,'total_hours',round(v_hours,2),'meetings_with_transcripts',v_transcripts,'total_decisions',v_decisions,'total_actions',v_actions),'action_completion_pct',null,'wasted_meetings',v_wasted,'wasted_meetings_count',jsonb_array_length(v_wasted),'per_staff',v_staff);
    end;
    $body$;
  $fn$;
  grant execute on function public.meeting_analytics(integer) to authenticated;
  return jsonb_build_object('status','repaired','object','meeting_analytics');
end;
$$;

create or replace function public.run_integrity_repairs_internal()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  v_result := public.ensure_meeting_analytics_contract();
  if v_result->>'status'='repaired' then
    update public.integrity_findings set status='resolved',resolved_at=now(),last_seen_at=now() where rule_key='frontend_rpc_contract' and object_name='meeting_analytics' and status in ('open','failed','repairing');
  end if;
  return v_result;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname='avenize-integrity-auto-repair';
select cron.schedule('avenize-integrity-auto-repair','*/10 * * * *','select public.run_integrity_repairs_internal();');
