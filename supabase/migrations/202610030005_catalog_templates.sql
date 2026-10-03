create table public.custom_exercises (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),"group" text not null check(length("group") between 1 and 80),
 equipment text not null default '',type text not null check(type in ('load_reps','reps','time')),revision bigint not null default 1,
 unique(workspace_id,id)
);
create table public.exercise_favorites (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,exercise_id text not null,primary key(workspace_id,exercise_id)
);
create table public.routine_templates (
 id uuid primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,
 document jsonb not null,revision bigint not null default 1,updated_at timestamptz not null default now()
);
create table public.admin_receipts (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,operation_id uuid not null,
 hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,operation_id)
);
do $$ declare t text;begin foreach t in array array['custom_exercises','exercise_favorites','routine_templates','admin_receipts'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(public.owns_workspace(workspace_id))',t);
end loop;end $$;
create function public.save_library_entry(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=(command->>'workspaceId')::uuid;op uuid:=(command->>'operationId')::uuid;entity uuid:=(command->>'id')::uuid;kind text:=command->>'kind';p jsonb:=command->'payload';old public.admin_receipts;hash text;result jsonb;rev bigint;
begin
 if not public.owns_workspace(w) or auth.uid() is null or op is null then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from public.workspaces where id=w for update;
 hash:=encode(extensions.digest(command::text,'sha256'),'hex');select * into old from public.admin_receipts where workspace_id=w and operation_id=op;
 if found then if old.hash<>hash then raise exception 'ID reused' using errcode='22023';end if;return old.result;end if;
 if kind='exercise' then
  select revision into rev from public.custom_exercises where id=entity and workspace_id=w;
  if coalesce(rev,0) is distinct from (command->>'expectedRevision')::bigint then raise exception 'Revision changed' using errcode='22023';end if;
  insert into public.custom_exercises(id,workspace_id,name,"group",equipment,type) values(entity,w,trim(p->>'name'),p->>'group',coalesce(p->>'equipment',''),p->>'type')
   on conflict(id) do update set name=excluded.name,"group"=excluded."group",equipment=excluded.equipment,type=excluded.type,revision=public.custom_exercises.revision+1 where public.custom_exercises.workspace_id=w returning to_jsonb(public.custom_exercises.*) into result;
 elsif kind='template' then
  perform private.validate_routine(p->'document',false);
  select revision into rev from public.routine_templates where id=entity and workspace_id=w;
  if coalesce(rev,0) is distinct from (command->>'expectedRevision')::bigint then raise exception 'Revision changed' using errcode='22023';end if;
  insert into public.routine_templates(id,workspace_id,name,document) values(entity,w,p->'document'->>'name',p->'document')
   on conflict(id) do update set name=excluded.name,document=excluded.document,revision=public.routine_templates.revision+1,updated_at=now() where public.routine_templates.workspace_id=w returning to_jsonb(public.routine_templates.*) into result;
 elsif kind='favorite' then
  if length(p->>'exerciseId') not between 1 and 100 or jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception 'Invalid' using errcode='22023';end if;
  if (p->>'enabled')::boolean then insert into public.exercise_favorites values(w,p->>'exerciseId') on conflict do nothing;
  else delete from public.exercise_favorites where workspace_id=w and exercise_id=p->>'exerciseId';end if;
  result:=p;
 else raise exception 'Invalid kind' using errcode='22023';end if;
 if result is null then raise exception 'Forbidden reference' using errcode='42501';end if;
 insert into public.admin_receipts(workspace_id,operation_id,hash,result) values(w,op,hash,result);return result;
end $$;
revoke all on function public.save_library_entry(jsonb) from public,anon;
grant execute on function public.save_library_entry(jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('exercise-media','exercise-media',false,5242880,array['image/png','image/jpeg','image/webp']) on conflict do nothing;
create policy media_read on storage.objects for select to authenticated using(bucket_id='exercise-media' and exists(select 1 from public.workspaces where id::text=(storage.foldername(name))[1] and owner_user_id=auth.uid()));
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='exercise-media' and exists(select 1 from public.workspaces where id::text=(storage.foldername(name))[1] and owner_user_id=auth.uid()));
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='exercise-media' and exists(select 1 from public.workspaces where id::text=(storage.foldername(name))[1] and owner_user_id=auth.uid()));
