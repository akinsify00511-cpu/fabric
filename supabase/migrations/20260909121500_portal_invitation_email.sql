insert into public.transactional_email_templates(key,subject,body_html,body_text,active)
values('portal_invitation','You have been invited to a client portal','<p>Hello {{name}},</p><p>You have been invited to access your client portal.</p><p><a href="{{url}}">Open your portal invitation</a></p><p>This invitation expires at {{expires_at}}.</p>','Hello {{name}},\n\nYou have been invited to access your client portal.\nOpen your portal invitation: {{url}}\nThis invitation expires at {{expires_at}}.','true')
on conflict (key) do update set subject=excluded.subject,body_html=excluded.body_html,body_text=excluded.body_text,active=true;

create or replace function public.queue_portal_invitation_email(p_invitation_id uuid,p_base_url text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_inv public.portal_invitations%rowtype;v_event uuid;v_staff_id uuid;
begin
 select * into v_inv from public.portal_invitations where id=p_invitation_id;
 if not found then raise exception 'invitation not found';end if;
 select id into v_staff_id from public.staff where business_id=v_inv.business_id and user_id=auth.uid() and coalesce(active,is_active,true)=true limit 1;
 if v_staff_id is null then raise exception 'not authorized';end if;
 insert into public.email_events(business_id,recipient,template,subject,payload,status,created_at)
 values(v_inv.business_id,v_inv.email,'portal_invitation','You have been invited to a client portal',jsonb_build_object('name',coalesce(v_inv.name,'there'),'url',rtrim(p_base_url,'/')||'/portal/invite/'||v_inv.token,'expires_at',v_inv.expires_at),'queued',now()) returning id into v_event;
 return v_event;
end;$$;
revoke all on function public.queue_portal_invitation_email(uuid,text) from public;
grant execute on function public.queue_portal_invitation_email(uuid,text) to authenticated;
