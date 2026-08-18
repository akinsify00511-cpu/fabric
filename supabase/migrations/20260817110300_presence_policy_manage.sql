grant insert, update, delete on public.attendance_policies to authenticated;
drop policy if exists attendance_policies_manage on public.attendance_policies;
create policy attendance_policies_manage on public.attendance_policies
for all to authenticated
using (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=attendance_policies.business_id and s.role in ('owner','admin')))
with check (exists (select 1 from public.staff s where s.user_id=(select auth.uid()) and s.business_id=attendance_policies.business_id and s.role in ('owner','admin')));