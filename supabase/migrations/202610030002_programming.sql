create table public.routine_periods (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,student_id uuid not null,
 month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),current_revision_id uuid,continued_from uuid,
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
 unique(workspace_id,student_id,id),unique(workspace_id,student_id,month),
 foreign key(workspace_id,student_id,continued_from) references public.routine_periods(workspace_id,student_id,id)
);
create table public.routine_revisions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,student_id uuid not null,period_id uuid not null,
 document jsonb not null,created_at timestamptz not null default now(),
 unique(workspace_id,student_id,period_id,id),unique(workspace_id,student_id,id),
 foreign key(workspace_id,student_id,period_id) references public.routine_periods(workspace_id,student_id,id) on delete cascade
);
alter table public.routine_periods add constraint current_revision_scope foreign key(workspace_id,student_id,id,current_revision_id)
 references public.routine_revisions(workspace_id,student_id,period_id,id) deferrable initially deferred;
create table public.routine_drafts (
 id uuid primary key,workspace_id uuid not null,student_id uuid not null,revision bigint not null default 1,
 base_revision_id uuid,document jsonb not null,updated_at timestamptz not null default now(),
 unique(workspace_id,student_id,id),
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
 foreign key(workspace_id,student_id,base_revision_id) references public.routine_revisions(workspace_id,student_id,id)
);
create table public.schedule_rules (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,student_id uuid not null,
 weekdays integer[] not null,time time not null,enabled boolean not null default true,
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
 unique(workspace_id,student_id,id)
);
create unique index one_enabled_schedule on public.schedule_rules(student_id) where enabled;
create table public.visits (
 id uuid primary key,workspace_id uuid not null,student_id uuid not null,
 date date not null,time time not null,status text not null default 'pending' check(status in ('pending','open','closed','absent','rescheduled','cancelled')),
 source text not null default 'extra' check(source in ('extra','scheduled','rescheduled')),rule_id uuid,rescheduled_from uuid,
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
 unique(workspace_id,student_id,id),unique(rule_id,date),
 foreign key(workspace_id,student_id,rule_id) references public.schedule_rules(workspace_id,student_id,id),
 foreign key(workspace_id,student_id,rescheduled_from) references public.visits(workspace_id,student_id,id)
);
create index visits_day on public.visits(workspace_id,date,time);
create table public.sessions (
 id uuid primary key,workspace_id uuid not null,student_id uuid not null,period_id uuid not null,routine_revision_id uuid not null,
 visit_id uuid not null,day_id uuid not null,week integer not null check(week between 1 and 4),
 status text not null default 'open' check(status in ('open','closed')),date date not null,timezone text not null,
 started_at timestamptz not null default now(),captured_at timestamptz not null,ended_at timestamptz,
 unique(workspace_id,student_id,id),
 foreign key(workspace_id,student_id) references public.students(workspace_id,id) on delete cascade,
 foreign key(workspace_id,student_id,period_id,routine_revision_id) references public.routine_revisions(workspace_id,student_id,period_id,id),
 foreign key(workspace_id,student_id,visit_id) references public.visits(workspace_id,student_id,id),
 check((status='open' and ended_at is null) or (status='closed' and ended_at is not null))
);
create unique index one_open_session_per_student on public.sessions(student_id) where status='open';
create table public.session_items (
 id uuid primary key,workspace_id uuid not null,student_id uuid not null,session_id uuid not null,
 position_id uuid not null,lineage_id uuid not null,block_id uuid not null,block_name text not null,
 exercise_id text not null,name text not null,"group" text not null,type text not null check(type in ('load_reps','reps','time')),
 warmup boolean not null,ordinal integer not null,skipped boolean not null default false,
 prescription jsonb not null,initial_prescription jsonb not null,macro_rest integer check(macro_rest between 0 and 3600),macro_target text not null check(macro_target in ('series','blocks')),
 unique(workspace_id,student_id,session_id,id),unique(session_id,position_id),unique(session_id,ordinal),
 foreign key(workspace_id,student_id,session_id) references public.sessions(workspace_id,student_id,id) on delete cascade
);
create table public.session_sets (
 id uuid primary key,workspace_id uuid not null,student_id uuid not null,session_id uuid not null,item_id uuid not null,
 ordinal integer not null check(ordinal between 1 and 50),state text not null default 'pending' check(state in ('pending','done','skipped')),
 source text not null default 'pending' check(source in ('pending','observed','quick_confirmed')),
 weight numeric check(weight between 0 and 1000 and weight=round(weight,2)),reps integer check(reps between 1 and 500),duration_sec integer check(duration_sec between 1 and 86400),
 unique(item_id,ordinal),
 foreign key(workspace_id,student_id,session_id,item_id) references public.session_items(workspace_id,student_id,session_id,id) on delete cascade
);
do $$ declare t text; begin foreach t in array array['routine_periods','routine_revisions','routine_drafts','schedule_rules','visits','sessions','session_items','session_sets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(public.owns_workspace(workspace_id))',t);
end loop;end $$;

create function private.validate_numeric(p jsonb,k text,lo numeric,hi numeric,optional boolean default false,decimal_ok boolean default false) returns void language plpgsql set search_path='' as $$
declare n numeric;
begin
 if not(p?k) then raise exception 'Missing field' using errcode='22023';end if;
 if p->k='null'::jsonb and optional then return;end if;
 if jsonb_typeof(p->k)<>'number' then raise exception 'Invalid number' using errcode='22023';end if;
 n:=(p->>k)::numeric;
 if n<lo or n>hi or (decimal_ok and n<>round(n,2)) or (not decimal_ok and n<>trunc(n)) then raise exception 'Out of range' using errcode='22023';end if;
end $$;
create function private.validate_routine(doc jsonb,publish boolean) returns void language plpgsql set search_path='' as $$
declare wk jsonb;dy jsonb;b jsonb;e jsonb;p jsonb;ident text;ids text[]:='{}';lineages text[];cnt integer;
begin
 if doc->>'schemaVersion' is distinct from '1' or jsonb_typeof(doc->'weeks') is distinct from 'array' or jsonb_array_length(doc->'weeks')<>4 or length(trim(doc->>'name')) not between 1 and 120 or doc->>'name' is null then raise exception 'Invalid routine' using errcode='22023';end if;
 for wk in select value from jsonb_array_elements(doc->'weeks') loop
  if jsonb_typeof(wk)<>'array' or jsonb_array_length(wk) not between 1 and 14 then raise exception 'Invalid week' using errcode='22023';end if;
  for dy in select value from jsonb_array_elements(wk) loop
   perform (dy->>'id')::uuid;ident:=dy->>'id';if ident is null or ident=any(ids) then raise exception 'Duplicate ID' using errcode='22023';end if;ids:=array_append(ids,ident);
   if length(dy->>'name') not between 1 and 80 or dy->>'name' is null or jsonb_typeof(dy->'blocks') is distinct from 'array' or jsonb_array_length(dy->'blocks')>30 then raise exception 'Invalid day' using errcode='22023';end if;
   cnt:=0;lineages:='{}';
   for b in select value from jsonb_array_elements(dy->'blocks') loop
    perform (b->>'id')::uuid;ident:=b->>'id';if ident is null or ident=any(ids) then raise exception 'Duplicate ID' using errcode='22023';end if;ids:=array_append(ids,ident);
    if b->>'type' not in ('main','mobility','approximation') or b->>'type' is null or b->>'macroTarget' not in ('series','blocks') or b->>'macroTarget' is null or length(b->>'name') not between 1 and 80 or b->>'name' is null then raise exception 'Invalid block' using errcode='22023';end if;
    perform private.validate_numeric(b,'macroRest',0,3600,true);
    if jsonb_typeof(b->'exercises') is distinct from 'array' or jsonb_array_length(b->'exercises')>50 then raise exception 'Invalid exercises' using errcode='22023';end if;
    for e in select value from jsonb_array_elements(b->'exercises') loop
     cnt:=cnt+1;perform (e->>'id')::uuid;perform (e->>'lineageId')::uuid;ident:=e->>'id';
     if ident is null or ident=any(ids) or e->>'lineageId' is null or e->>'lineageId'=any(lineages) then raise exception 'Duplicate position' using errcode='22023';end if;
     ids:=array_append(ids,ident);lineages:=array_append(lineages,e->>'lineageId');
     if e->>'type' not in ('load_reps','reps','time') or e->>'type' is null or length(e->>'exerciseId') not between 1 and 100 or e->>'exerciseId' is null or length(e->>'name') not between 1 and 120 or e->>'name' is null or length(e->>'group') not between 1 and 80 or e->>'group' is null or jsonb_typeof(e->'warmup') is distinct from 'boolean' then raise exception 'Invalid exercise' using errcode='22023';end if;
     p:=e->'prescription';
     perform private.validate_numeric(p,'sets',1,50,not publish);
     perform private.validate_numeric(p,'weight',0,1000,not publish or e->>'type'<>'load_reps',true);
     perform private.validate_numeric(p,'reps',1,500,not publish or e->>'type'='time');
     perform private.validate_numeric(p,'durationSec',1,86400,not publish or e->>'type'<>'time');
     perform private.validate_numeric(p,'microRest',0,3600,true);
    end loop;
   end loop;
   if publish and cnt=0 then raise exception 'Empty day' using errcode='22023';end if;
  end loop;
 end loop;
end $$;

create or replace function private.student_snapshot(w uuid,s uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('student',to_jsonb(st),'revision',st.revision,
 'period',(select to_jsonb(p) from public.routine_periods p where p.workspace_id=w and p.student_id=s and p.month<=to_char(now() at time zone ws.timezone,'YYYY-MM') order by month desc limit 1),
 'routine',(select to_jsonb(r) from public.routine_periods p join public.routine_revisions r on r.id=p.current_revision_id where p.workspace_id=w and p.student_id=s and p.month<=to_char(now() at time zone ws.timezone,'YYYY-MM') order by p.month desc limit 1),
 'visits',coalesce((select jsonb_agg(to_jsonb(v) order by v.date,v.time,v.id) from public.visits v where v.workspace_id=w and v.student_id=s and v.date between (now() at time zone ws.timezone)::date-35 and (now() at time zone ws.timezone)::date+62),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(se)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('sets',coalesce((select jsonb_agg(to_jsonb(ss) order by ss.ordinal) from public.session_sets ss where ss.item_id=i.id),'[]')) order by i.ordinal) from public.session_items i where i.session_id=se.id),'[]')) order by se.started_at) from public.sessions se where se.workspace_id=w and se.student_id=s and se.status='open'),'[]'))
 from public.students st join public.workspaces ws on ws.id=st.workspace_id where st.workspace_id=w and st.id=s;
$$;
create function public.fetch_student(workspace_id uuid,student_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not public.owns_workspace(workspace_id) then raise exception 'Forbidden' using errcode='42501';end if;return private.student_snapshot(workspace_id,student_id);end $$;
revoke all on function public.fetch_student(uuid,uuid) from public,anon;
grant execute on function public.fetch_student(uuid,uuid) to authenticated;

create function private.generate_visits(w uuid,s uuid,month_key text) returns void language plpgsql set search_path='' as $$
begin
 insert into public.visits(id,workspace_id,student_id,date,time,source,rule_id)
 select gen_random_uuid(),w,s,d::date,r.time,'scheduled',r.id from public.schedule_rules r
 cross join generate_series((month_key||'-01')::date,((month_key||'-01')::date+interval '1 month - 1 day')::date,interval '1 day') d
 where r.workspace_id=w and r.student_id=s and r.enabled and extract(isodow from d)::integer=any(r.weekdays)
 on conflict(rule_id,date) do nothing;
end $$;
alter function private.apply_student_mutation(jsonb) rename to apply_roster_mutation;
create function private.apply_student_mutation(c jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb:=c->'payload'; w uuid:=(c->>'workspaceId')::uuid;s uuid:=(c->>'studentId')::uuid;
 kind text:=c->>'kind';d public.routine_drafts;period public.routine_periods;latest public.routine_periods;
 month_key text;current_month text;rid uuid;v public.visits;weekday_values integer[];
begin
 select to_char(now() at time zone timezone,'YYYY-MM') into current_month from public.workspaces where id=w;
 if kind in ('create_student','update_student','archive_student') then
  if kind='archive_student' and exists(select 1 from public.sessions where student_id=s and status='open') then raise exception 'Close training first' using errcode='22023';end if;
  perform private.apply_roster_mutation(c);return;
 end if;
 if exists(select 1 from public.students where id=s and archived) then raise exception 'Archived student' using errcode='22023';end if;
 if kind='save_draft' then
  perform private.validate_routine(p->'document',false);
  select * into d from public.routine_drafts where id=(p->>'draftId')::uuid and workspace_id=w and student_id=s;
  if coalesce(d.revision,0)<>(p->>'expectedDraftRevision')::bigint or p->>'expectedDraftRevision' is null then raise exception 'Stale draft' using errcode='22023';end if;
  if d.id is null then insert into public.routine_drafts(id,workspace_id,student_id,base_revision_id,document) values((p->>'draftId')::uuid,w,s,(p->>'baseRoutineRevisionId')::uuid,p->'document');
  else update public.routine_drafts set document=p->'document',revision=revision+1,base_revision_id=(p->>'baseRoutineRevisionId')::uuid,updated_at=now() where id=d.id;end if;
 elsif kind='publish_routine' then
  if exists(select 1 from public.sessions where student_id=s and status='open') then raise exception 'Open session' using errcode='22023';end if;
  select * into d from public.routine_drafts where id=(p->>'draftId')::uuid and workspace_id=w and student_id=s;
  if d.id is null or d.revision is distinct from (p->>'expectedDraftRevision')::bigint then raise exception 'Stale draft' using errcode='22023';end if;
  perform private.validate_routine(d.document,true);month_key:=p->>'targetMonth';
  if month_key not in(current_month,to_char((current_month||'-01')::date+interval '1 month','YYYY-MM')) or month_key is null then raise exception 'Invalid month' using errcode='22023';end if;
  select * into period from public.routine_periods where workspace_id=w and student_id=s and month=month_key;
  if period.current_revision_id is distinct from (p->>'baseRoutineRevisionId')::uuid or d.base_revision_id is distinct from (p->>'baseRoutineRevisionId')::uuid then raise exception 'Base changed' using errcode='22023';end if;
  if period.id is null then insert into public.routine_periods(workspace_id,student_id,month) values(w,s,month_key) returning * into period;end if;
  insert into public.routine_revisions(workspace_id,student_id,period_id,document) values(w,s,period.id,d.document) returning id into rid;
  update public.routine_periods set current_revision_id=rid where id=period.id;
 elsif kind='ensure_period' then
  month_key:=p->>'requestedMonth';if month_key is distinct from current_month then raise exception 'Invalid month' using errcode='22023';end if;
  perform private.generate_visits(w,s,month_key);
  if exists(select 1 from public.routine_periods where workspace_id=w and student_id=s and month=month_key) or exists(select 1 from public.sessions where student_id=s and status='open') then return;end if;
  select * into latest from public.routine_periods where workspace_id=w and student_id=s and month<month_key order by month desc limit 1;
  if latest.id is null then return;end if;
  insert into public.routine_periods(workspace_id,student_id,month,continued_from) values(w,s,month_key,latest.id) returning * into period;
  insert into public.routine_revisions(workspace_id,student_id,period_id,document) select w,s,period.id,document from public.routine_revisions where id=latest.current_revision_id returning id into rid;
  update public.routine_periods set current_revision_id=rid where id=period.id;
 elsif kind='create_visit' then
  if p->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
  insert into public.visits(id,workspace_id,student_id,date,time) values((p->>'visitId')::uuid,w,s,(p->>'date')::date,(p->>'time')::time);
 elsif kind in ('mark_absent','reschedule_visit') then
  select * into v from public.visits where id=(p->>'visitId')::uuid and workspace_id=w and student_id=s;
  if v.id is null or v.status<>'pending' then raise exception 'Visit unavailable' using errcode='22023';end if;
  update public.visits set status=case when kind='mark_absent' then 'absent' else 'rescheduled' end where id=v.id;
  if kind='reschedule_visit' then
   if p->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time' using errcode='22023';end if;
   insert into public.visits(id,workspace_id,student_id,date,time,source,rescheduled_from) values((p->>'newVisitId')::uuid,w,s,(p->>'date')::date,(p->>'time')::time,'rescheduled',v.id);
  end if;
 elsif kind='save_schedule' then
  select array_agg(value::integer) into weekday_values from jsonb_array_elements_text(p->'weekdays');
  if cardinality(weekday_values)>7 or exists(select 1 from unnest(weekday_values) x where x not between 1 and 7) then raise exception 'Invalid weekdays' using errcode='22023';end if;
  update public.schedule_rules set enabled=false where workspace_id=w and student_id=s and enabled;
  update public.visits set status='cancelled' where workspace_id=w and student_id=s and source='scheduled' and status='pending' and date>=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
  if cardinality(weekday_values)>0 then insert into public.schedule_rules(workspace_id,student_id,weekdays,time) values(w,s,weekday_values,(p->>'time')::time);end if;
  perform private.generate_visits(w,s,current_month);
 else raise exception 'Unsupported command' using errcode='22023';end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
