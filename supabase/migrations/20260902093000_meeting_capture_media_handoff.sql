create or replace function public.enqueue_meeting_capture_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.capture_type = 'recording' and new.storage_path is not null then
    insert into public.meeting_media (
      meeting_id, media_type, storage_path, duration_seconds, size_bytes, processing_status
    ) values (
      new.meeting_id, 'recording', new.storage_path, new.duration_seconds, new.size_bytes, 'pending'
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_meeting_capture_media_handoff on public.meeting_captures;
create trigger trg_meeting_capture_media_handoff
after insert on public.meeting_captures
for each row execute function public.enqueue_meeting_capture_media();
