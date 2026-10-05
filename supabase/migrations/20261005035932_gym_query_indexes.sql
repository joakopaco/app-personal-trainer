create index gym_provision_actor on private.gym_provision_requests(actor_id);
create index gym_notes_member on public.gym_member_notes(gym_id,member_id);
create index gym_revisions_parent on public.gym_routine_revisions(gym_id,routine_id);

alter policy revision_read on public.gym_routine_revisions using(
 exists(select 1 from public.gym_routines r where r.id=gym_routine_revisions.routine_id)
 or exists(select 1 from public.gym_accounts a where a.selected_revision_id=gym_routine_revisions.id and a.user_id=(select auth.uid()) and public.gym_can_read(a.gym_id,a.user_id))
 or exists(select 1 from public.gym_sessions s where s.routine_revision_id=gym_routine_revisions.id and public.gym_can_read(s.gym_id,s.member_id))
);
