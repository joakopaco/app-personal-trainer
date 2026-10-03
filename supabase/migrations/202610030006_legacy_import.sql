create table public.import_jobs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source_hash text not null,source_text text not null,result jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,source_hash)
);
create table public.legacy_records (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,student_id uuid not null,job_id uuid not null references public.import_jobs(id),
 source_id text not null,original_person jsonb not null,original_sessions jsonb not null,original_visits jsonb not null,
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,unique(workspace_id,student_id)
);
do $$declare t text;begin foreach t in array array['import_jobs','legacy_records'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy owner_read on public.%I for select to authenticated using(public.owns_workspace(workspace_id))',t);
end loop;end $$;
create function public.import_legacy_v6(workspace_id uuid,source_text text,prepared jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=workspace_id;src jsonb;hash text;existing public.import_jobs;job uuid;person jsonb;entry jsonb;sid uuid;import_result jsonb;mapping jsonb:='[]';cnt integer:=0;
begin
 if not public.owns_workspace(w) or auth.uid() is null then raise exception 'Forbidden' using errcode='42501';end if;
 if octet_length(source_text)>2000000 then raise exception 'Import too large' using errcode='22023';end if;
 src:=source_text::jsonb;
 if src->>'format' is distinct from 'pulso-backup' or src->'data'->>'version' is distinct from '6' or jsonb_typeof(src->'data'->'db'->'people') is distinct from 'array' or jsonb_array_length(src->'data'->'db'->'people') not between 1 and 100 then raise exception 'Invalid source' using errcode='22023';end if;
 if jsonb_typeof(prepared) is distinct from 'array' or jsonb_array_length(prepared)<>jsonb_array_length(src->'data'->'db'->'people') then raise exception 'Invalid mapping' using errcode='22023';end if;
 perform 1 from public.workspaces where id=w for update;
 hash:=encode(extensions.digest(source_text,'sha256'),'hex');select * into existing from public.import_jobs j where j.workspace_id=w and j.source_hash=hash;
 if found then return existing.result||jsonb_build_object('duplicate',true);end if;
 insert into public.import_jobs(workspace_id,source_hash,source_text,result) values(w,hash,source_text,'{}') returning id into job;
 for person in select value from jsonb_array_elements(src->'data'->'db'->'people') loop
  if person->>'id' is null or length(trim(person->>'name')) not between 1 and 100 or jsonb_typeof(person->'records') is distinct from 'array' or jsonb_typeof(person->'archives') is distinct from 'array' or jsonb_typeof(person->'history') is distinct from 'array' then raise exception 'Invalid person' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(person->'records') r where r->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(r->'weight') is distinct from 'number' or (r->>'weight')::numeric<0 or jsonb_typeof(r->'reps') is distinct from 'number' or jsonb_typeof(r->'sets') is distinct from 'number') then raise exception 'Invalid records' using errcode='22023';end if;
  select value into entry from jsonb_array_elements(prepared) where value->>'sourceId'=person->>'id';
  if entry is null then raise exception 'Mapping missing' using errcode='22023';end if;
  sid:=extensions.uuid_generate_v5(w,'legacy:'||(person->>'id'));
  if exists(select 1 from public.students where id=sid) then raise exception 'This legacy student already exists; do not duplicate a modified source' using errcode='22023';end if;
  insert into public.students(id,workspace_id,name,notes,revision) values(sid,w,person->>'name','Importado desde la demo. Revisar rutina y horarios antes de entrenar.',1);
  if entry->'routine' is not null and entry->'routine'<>'null'::jsonb then
   perform private.validate_routine(entry->'routine',false);
   insert into public.routine_drafts(id,workspace_id,student_id,document) values(gen_random_uuid(),w,sid,entry->'routine');
  end if;
  insert into public.legacy_records(workspace_id,student_id,job_id,source_id,original_person,original_sessions,original_visits)
   values(w,sid,job,person->>'id',person,
    coalesce((select jsonb_agg(value) from jsonb_array_elements(src->'data'->'db'->'sessions') where value->>'personId'=person->>'id'),'[]'),
    coalesce((select jsonb_agg(value) from jsonb_array_elements(src->'data'->'db'->'visits') where value->>'personId'=person->>'id'),'[]'));
  insert into public.audit_events(workspace_id,student_id,operation_id,actor_id,kind,after_data,captured_at) values(w,sid,gen_random_uuid(),auth.uid(),'import_legacy',jsonb_build_object('sourceId',person->>'id','sourceHash',hash,'origin','legacy_aggregate'),now());
  mapping:=mapping||jsonb_build_array(jsonb_build_object('sourceId',person->>'id','studentId',sid));cnt:=cnt+1;
 end loop;
 import_result:=jsonb_build_object('jobId',job,'students',cnt,'mapping',mapping,'sourceHash',hash,'duplicate',false);
 update public.import_jobs j set result=import_result where j.id=job;
 return import_result;
end $$;
revoke all on function public.import_legacy_v6(uuid,text,jsonb) from public,anon;
grant execute on function public.import_legacy_v6(uuid,text,jsonb) to authenticated;
