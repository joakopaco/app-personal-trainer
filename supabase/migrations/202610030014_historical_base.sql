-- A reviewed historical start can reference its original immutable revision,
-- even when that old month's pointer advanced before it reached the server.
do $$ declare definition text;begin
 select pg_get_functiondef('private.apply_historical_mutation(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'period.id is null or period.current_revision_id is distinct from (p->>''routineRevisionId'')::uuid','period.id is null or not exists(select 1 from public.routine_revisions rr where rr.id=(p->>''routineRevisionId'')::uuid and rr.workspace_id=w and rr.student_id=s and rr.period_id=period.id)');
 definition:=replace(definition,'select document into doc from public.routine_revisions where id=period.current_revision_id;','select document into doc from public.routine_revisions where id=(p->>''routineRevisionId'')::uuid;');
 definition:=replace(definition,'values(target_session,w,s,period.id,period.current_revision_id,target_visit','values(target_session,w,s,period.id,(p->>''routineRevisionId'')::uuid,target_visit');
 execute definition;
end $$;
