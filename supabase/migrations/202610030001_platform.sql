create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(length(display_name)<=100)
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Mi espacio',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100),
  alias text not null default '' check(length(alias)<=80),
  notes text not null default '' check(length(notes)<=2000),
  archived boolean not null default false,
  revision bigint not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create index students_workspace on public.students(workspace_id,archived,name);
create table public.operation_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null, student_id uuid not null,
  actor_id uuid not null references auth.users(id), command_hash text not null,
  reply jsonb not null, created_at timestamptz not null default now(),
  primary key(workspace_id,operation_id),
  foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null,
  student_id uuid not null,operation_id uuid not null,actor_id uuid not null references auth.users(id),
  kind text not null,before_data jsonb,after_data jsonb,reason text,
  captured_at timestamptz not null,created_at timestamptz not null default now(),
  foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
  unique(workspace_id,operation_id)
);
create index audit_student on public.audit_events(workspace_id,student_id,created_at desc,id);
create table public.deletion_requests (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create function public.owns_workspace(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspaces where id=target and owner_user_id=auth.uid());
$$;
revoke all on function public.owns_workspace(uuid) from public,anon;
grant execute on function public.owns_workspace(uuid) to authenticated;
alter table public.profiles enable row level security;
create policy profile_owner on public.profiles for select to authenticated using(id=auth.uid());
alter table public.workspaces enable row level security;
create policy workspace_owner on public.workspaces for select to authenticated using(owner_user_id=auth.uid());
do $$ declare t text; begin
  foreach t in array array['students','operation_receipts','audit_events','deletion_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using(public.owns_workspace(workspace_id))',t);
  end loop;
end $$;
revoke all on public.profiles,public.workspaces,public.students,public.operation_receipts,public.audit_events,public.deletion_requests from anon,authenticated;
grant select on public.profiles,public.workspaces,public.students,public.operation_receipts,public.audit_events,public.deletion_requests to authenticated;

create function public.ensure_workspace() returns public.workspaces
language plpgsql security definer set search_path='' as $$
declare w public.workspaces;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
  insert into public.workspaces(owner_user_id) values(auth.uid()) on conflict do nothing;
  select * into w from public.workspaces where owner_user_id=auth.uid();
  return w;
end $$;
revoke all on function public.ensure_workspace() from public,anon;
grant execute on function public.ensure_workspace() to authenticated;

create function private.student_snapshot(w uuid,s uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('student',to_jsonb(st),'revision',st.revision,'period',null,'routine',null,'sessions','[]'::jsonb,'visits','[]'::jsonb)
 from public.students st where workspace_id=w and id=s;
$$;

create function private.apply_student_mutation(c jsonb) returns void
language plpgsql set search_path='' as $$
declare p jsonb:=c->'payload'; w uuid:=(c->>'workspaceId')::uuid; s uuid:=(c->>'studentId')::uuid;
begin
  if c->>'kind'='create_student' then
    insert into public.students(id,workspace_id,name,alias,notes) values(s,w,trim(p->>'name'),coalesce(p->>'alias',''),coalesce(p->>'notes',''));
  elsif c->>'kind'='update_student' then
    update public.students set name=trim(p->>'name'),alias=coalesce(p->>'alias',''),notes=coalesce(p->>'notes','') where workspace_id=w and id=s;
  elsif c->>'kind'='archive_student' then
    update public.students set archived=(p->>'archived')::boolean where workspace_id=w and id=s;
  else
    raise exception 'Unsupported command' using errcode='22023';
  end if;
end $$;

create function public.apply_training_command(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  w uuid; s uuid; op uuid; rev bigint; fingerprint text; old public.operation_receipts;
  before_state jsonb; after_state jsonb; reply jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','rejected','code','FORBIDDEN','message','Acceso requerido'); end if;
  if command->>'schemaVersion' is distinct from '1' or jsonb_typeof(command->'payload') is distinct from 'object'
     or command->>'expectedRevision' is null or command->>'capturedAt' is null or command->>'deviceId' is null
     or command->>'kind' is null then raise exception 'Invalid envelope' using errcode='22023'; end if;
  w:=(command->>'workspaceId')::uuid; s:=(command->>'studentId')::uuid; op:=(command->>'operationId')::uuid;
  perform (command->>'deviceId')::uuid; perform (command->>'capturedAt')::timestamptz;
  if w is null or s is null or op is null or not public.owns_workspace(w) then
    return jsonb_build_object('status','rejected','code','FORBIDDEN','message','No tenés acceso');
  end if;
  if command->>'kind'='create_student' then
    perform 1 from public.workspaces where id=w for update;
  end if;
  select revision into rev from public.students where workspace_id=w and id=s for update;
  if not found and command->>'kind'<>'create_student' then
    return jsonb_build_object('status','rejected','code','FORBIDDEN','message','Alumno no disponible');
  end if;
  fingerprint:=encode(extensions.digest(command::text,'sha256'),'hex');
  select * into old from public.operation_receipts where workspace_id=w and operation_id=op;
  if found then
    if old.command_hash<>fingerprint then return jsonb_build_object('status','rejected','code','ID_REUSED','message','La operación ya tiene otro contenido'); end if;
    return old.reply||jsonb_build_object('status','duplicate');
  end if;
  if coalesce(rev,0)<>(command->>'expectedRevision')::bigint then
    return jsonb_build_object('status','conflict','revision',rev,'current',private.student_snapshot(w,s));
  end if;
  before_state:=private.student_snapshot(w,s);
  perform private.apply_student_mutation(command);
  update public.students set revision=revision+1 where workspace_id=w and id=s returning revision into rev;
  after_state:=private.student_snapshot(w,s);
  insert into public.audit_events(workspace_id,student_id,operation_id,actor_id,kind,before_data,after_data,reason,captured_at)
    values(w,s,op,auth.uid(),command->>'kind',before_state,after_state,command->'payload'->>'reason',(command->>'capturedAt')::timestamptz);
  reply:=jsonb_build_object('status','applied','operationId',op,'revision',rev,'patch',after_state);
  insert into public.operation_receipts(workspace_id,operation_id,student_id,actor_id,command_hash,reply) values(w,op,s,auth.uid(),fingerprint,reply);
  return reply;
exception when invalid_text_representation or check_violation or not_null_violation or foreign_key_violation or unique_violation or invalid_parameter_value or datetime_field_overflow then
  return jsonb_build_object('status','rejected','code','INVALID','message','Datos inválidos o estado incompatible. Revisá los valores.');
end $$;
revoke all on function public.apply_training_command(jsonb) from public,anon;
grant execute on function public.apply_training_command(jsonb) to authenticated;

create function public.request_account_deletion() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.deletion_requests(workspace_id,requested_by)
    select id,auth.uid() from public.workspaces where owner_user_id=auth.uid() on conflict do nothing;
end $$;
revoke all on function public.request_account_deletion() from public,anon;
grant execute on function public.request_account_deletion() to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
