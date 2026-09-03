-- Harden SECURITY DEFINER RPCs that mutate or expose business data.

create or replace function public.get_space_pages(p_space_id uuid)
returns table(id uuid,parent_id uuid,title text,icon_emoji text,slug text,is_archived boolean,created_by uuid,updated_at timestamptz,depth integer)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (select 1 from public.kb_spaces s join public.get_current_staff() cs on cs.business_id=s.business_id where s.id=p_space_id) then raise exception 'Forbidden'; end if;
  return query with recursive page_tree as (
    select p.id,p.parent_id,p.title,p.icon_emoji,p.slug,p.is_archived,p.created_by,p.updated_at,0
    from public.kb_pages p where p.space_id=p_space_id and p.parent_id is null and not p.is_archived
    union all
    select p.id,p.parent_id,p.title,p.icon_emoji,p.slug,p.is_archived,p.created_by,p.updated_at,pt.depth+1
    from public.kb_pages p join page_tree pt on p.parent_id=pt.id where not p.is_archived
  ) select * from page_tree order by depth,title;
end; $$;

create or replace function public.check_in_attendee(p_registration_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_staff record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff.business_id is null or not exists (select 1 from public.event_registrations er where er.id=p_registration_id) or v_staff.role not in ('owner','admin','manager') then raise exception 'Not authorized'; end if;
  update public.event_registrations set checked_in=true,checked_in_at=now(),status='attended',updated_at=now() where id=p_registration_id;
end; $$;

create or replace function public.rsvp_event(p_registration_id uuid,p_rsvp_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if p_rsvp_status not in ('yes','no','maybe') then raise exception 'Invalid RSVP status'; end if;
  if not exists (select 1 from public.event_registrations er where er.id=p_registration_id and er.user_id=auth.uid()) then raise exception 'Not authorized'; end if;
  update public.event_registrations set rsvp_status=p_rsvp_status,rsvp_responded_at=now(),updated_at=now() where id=p_registration_id;
end; $$;

create or replace function public.send_follow_up(p_requisition_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_req record; v_staff record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  select * into v_req from public.requisitions where id=p_requisition_id;
  if v_staff.business_id is null or v_req.business_id is null or v_req.business_id<>v_staff.business_id or v_staff.role not in ('owner','admin','manager') then raise exception 'Not authorized'; end if;
  update public.requisitions set follow_up_count=follow_up_count+1,follow_up_sent=true,last_follow_up_at=now(),updated_at=now() where id=p_requisition_id;
  insert into public.requisition_follow_ups(requisition_id,target_id,target_type,type,subject,message,follow_up_number)
  select p_requisition_id,s.id,'approver','reminder','Reminder: Approval pending for "'||v_req.title||'"','This is a reminder that requisition "'||v_req.title||'" is awaiting your approval.',v_req.follow_up_count+1
  from public.staff s where s.business_id=v_req.business_id and s.role in ('manager','owner');
  insert into public.approval_workflow_log(requisition_id,action,actor_type,details) values(p_requisition_id,'reminder_sent','system',jsonb_build_object('count',v_req.follow_up_count+1));
end; $$;

create or replace function public.save_transcript(p_meeting_id uuid,p_full_text text,p_language text default 'en',p_duration_seconds integer default null,p_segments jsonb default null,p_summary text default null,p_key_points text[] default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_staff record; v_transcript_id uuid; v_summary_id uuid; v_seg jsonb; v_segment_index int:=0; v_business_id uuid;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  select business_id into v_business_id from public.meetings where id=p_meeting_id;
  if v_staff.business_id is null or v_business_id is null or v_business_id<>v_staff.business_id then raise exception 'Not authorized'; end if;
  insert into public.meeting_transcripts(meeting_id,full_text,language,duration_seconds,word_count,processing_status) values(p_meeting_id,p_full_text,p_language,p_duration_seconds,array_length(regexp_split_to_array(p_full_text,'\\s+'),1),'completed') returning id into v_transcript_id;
  if p_segments is not null then for v_seg in select * from jsonb_array_elements(p_segments) loop
    insert into public.transcript_segments(transcript_id,segment_index,start_time_ms,end_time_ms,text,speaker,confidence) values(v_transcript_id,v_segment_index,coalesce((v_seg->>'start_time_ms')::bigint,0),coalesce((v_seg->>'end_time_ms')::bigint,0),v_seg->>'text',nullif(v_seg->>'speaker',''),nullif((v_seg->>'confidence')::real,null));
    v_segment_index:=v_segment_index+1;
  end loop; end if;
  if p_summary is not null and p_summary<>'' then insert into public.meeting_summaries(meeting_id,transcript_id,summary,key_points,processing_status) values(p_meeting_id,v_transcript_id,p_summary,p_key_points,'completed') returning id into v_summary_id; end if;
  update public.meetings set transcript_status='completed' where id=p_meeting_id;
  begin perform public.emit_business_event(v_business_id,'meeting_transcribed',p_meeting_id,jsonb_build_object('transcript_id',v_transcript_id,'segments',v_segment_index)); exception when others then null; end;
  return jsonb_build_object('transcript_id',v_transcript_id,'summary_id',v_summary_id);
end; $$;

-- reset_auth_rate_limit is owned by zzz_auth_protocol_repair (defined + granted there);revoking here would be a forward reference the owning file already grants anon+authenticated intentionally.
