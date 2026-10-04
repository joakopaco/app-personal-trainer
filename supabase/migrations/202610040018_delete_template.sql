-- Reuse the library command's ownership check, workspace lock and durable receipt.
-- Templates are independent copies; no student routines or history are deleted.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_library_entry(jsonb)'::regprocedure) into definition;
  if strpos(definition, 'elsif kind=''template'' then') = 0 then
    raise exception 'Unexpected save_library_entry definition';
  end if;
  definition := replace(definition, 'elsif kind=''template'' then', $branch$elsif kind='template_delete' then
  select revision into rev from public.routine_templates where id=entity and workspace_id=w;
  if rev is null then raise exception 'Template not found' using errcode='42501';end if;
  if rev is distinct from (command->>'expectedRevision')::bigint then raise exception 'Revision changed' using errcode='22023';end if;
  delete from public.routine_templates where id=entity and workspace_id=w;
  result:=jsonb_build_object('id',entity,'deleted',true);
 elsif kind='template' then$branch$);
  execute definition;
end $$;
