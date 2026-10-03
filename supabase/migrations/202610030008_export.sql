-- One statement snapshot for a consistent, private portable export.
create function public.export_workspace(workspace_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,'format','pulso-workspace','workspaceId',w.id,'exportedAt',now(),
 'students',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.students t where t.workspace_id=w.id),
 'routine_periods',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.routine_periods t where t.workspace_id=w.id),
 'routine_revisions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.routine_revisions t where t.workspace_id=w.id),
 'routine_drafts',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.routine_drafts t where t.workspace_id=w.id),
 'schedule_rules',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.schedule_rules t where t.workspace_id=w.id),
 'visits',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.visits t where t.workspace_id=w.id),
 'sessions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.sessions t where t.workspace_id=w.id),
 'session_items',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.session_items t where t.workspace_id=w.id),
 'session_sets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.session_sets t where t.workspace_id=w.id),
 'audit_events',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.audit_events t where t.workspace_id=w.id),
 'custom_exercises',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.custom_exercises t where t.workspace_id=w.id),
 'exercise_favorites',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.exercise_favorites t where t.workspace_id=w.id),
 'routine_templates',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.routine_templates t where t.workspace_id=w.id),
 'legacy_records',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.legacy_records t where t.workspace_id=w.id),
 'import_jobs',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.import_jobs t where t.workspace_id=w.id))
 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid();
$$;
revoke all on function public.export_workspace(uuid) from public,anon;
grant execute on function public.export_workspace(uuid) to authenticated;
