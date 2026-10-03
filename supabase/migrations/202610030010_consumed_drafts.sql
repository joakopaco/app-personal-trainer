-- Published drafts are consumed; reopening starts from the current immutable revision.
do $$ declare definition text;begin
 select pg_get_functiondef('private.apply_programming_mutation(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,E'update public.routine_periods set current_revision_id=rid where id=period.id;\n elsif kind=''ensure_period''',E'update public.routine_periods set current_revision_id=rid where id=period.id;\n  delete from public.routine_drafts where id=d.id and workspace_id=w and student_id=s;\n elsif kind=''ensure_period''');
 execute definition;
end $$;
