alter table public.custom_exercises add column media_path text,add column media_credit text;
do $$ declare definition text;begin
 select pg_get_functiondef('public.save_library_entry(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,E'elsif kind=''favorite'' then',E'elsif kind=''media'' then
  if length(trim(p->>''credit'')) not between 3 and 300 or p->>''credit'' is null or split_part(p->>''path'',''/'',1) is distinct from w::text or split_part(p->>''path'',''/'',2) is distinct from entity::text or not exists(select 1 from storage.objects where bucket_id=''exercise-media'' and name=p->>''path'') then raise exception ''Invalid media'' using errcode=''22023'';end if;
  update public.custom_exercises set media_path=p->>''path'',media_credit=trim(p->>''credit''),revision=revision+1 where id=entity and workspace_id=w and revision=(command->>''expectedRevision'')::bigint returning to_jsonb(public.custom_exercises.*) into result;
 elsif kind=''favorite'' then');
 execute definition;
end $$;
