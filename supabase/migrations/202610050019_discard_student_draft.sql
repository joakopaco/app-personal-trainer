-- Discard only an owned draft at the version the trainer reviewed.
-- Serialize with student commands; published routines and history are untouched.
create function public.discard_student_draft(workspace_id uuid, student_id uuid, draft_id uuid, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  if auth.uid() is null or not public.owns_workspace(workspace_id) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  perform 1 from public.students s where s.workspace_id=discard_student_draft.workspace_id and s.id=student_id for update;
  if not found then raise exception 'Student not found' using errcode='42501'; end if;
  select d.revision into current_revision from public.routine_drafts d
    where d.workspace_id=discard_student_draft.workspace_id and d.student_id=discard_student_draft.student_id and d.id=draft_id for update;
  -- Retrying after a lost acknowledgement is harmless.
  if not found then return; end if;
  if current_revision is distinct from expected_revision then
    raise exception 'El borrador cambió. Volvé a abrirlo antes de descartarlo.' using errcode='22023';
  end if;
  delete from public.routine_drafts d where d.workspace_id=discard_student_draft.workspace_id and d.student_id=discard_student_draft.student_id and d.id=draft_id;
end $$;
revoke all on function public.discard_student_draft(uuid,uuid,uuid,bigint) from public,anon;
grant execute on function public.discard_student_draft(uuid,uuid,uuid,bigint) to authenticated;
