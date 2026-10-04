-- Extend existing students without guessing how to split legacy full names.
alter table public.students add column first_name text not null default '' check(length(first_name)<=100);
alter table public.students add column last_name text not null default '' check(length(last_name)<=100);
alter table public.students add column gender text not null default 'no_especificado'
 check(gender in ('masculino','femenino','otro','no_especificado'));
alter table public.schedule_rules add column day_times jsonb not null default '{}' check(jsonb_typeof(day_times)='object');
alter table public.schedule_rules add column effective_from date not null default '-infinity';

alter function private.student_snapshot(uuid,uuid) rename to student_snapshot_before_details;
create function private.student_snapshot(w uuid,s uuid) returns jsonb language sql stable set search_path='' as $$
 select private.student_snapshot_before_details(w,s) || jsonb_build_object('schedule',
 (select jsonb_build_object('weekdays',r.weekdays,'time',r.time,'day_times',r.day_times)
 from public.schedule_rules r where r.workspace_id=w and r.student_id=s and r.enabled));
$$;

create or replace function private.generate_visits(w uuid,s uuid,month_key text) returns void language plpgsql set search_path='' as $$
begin
 insert into public.visits(id,workspace_id,student_id,date,time,source,rule_id)
 select gen_random_uuid(),w,s,d::date,coalesce((r.day_times->>extract(isodow from d)::integer::text)::time,r.time),'scheduled',r.id
 from public.schedule_rules r join public.workspaces ws on ws.id=r.workspace_id
 cross join generate_series((month_key||'-01')::date,((month_key||'-01')::date+interval '1 month - 1 day')::date,interval '1 day') d
 where r.workspace_id=w and r.student_id=s and r.enabled and extract(isodow from d)::integer=any(r.weekdays)
 and d::date>=r.effective_from
 and not exists(select 1 from public.visits old where old.workspace_id=w and old.student_id=s and old.date=d::date
 and old.rule_id is distinct from r.id and ((old.source='scheduled' and old.status in ('open','closed','absent','rescheduled')) or (old.source='rescheduled' and old.status<>'cancelled')))
 on conflict(rule_id,date) do nothing;
end $$;

create function private.save_student_schedule(w uuid,s uuid,p jsonb) returns void language plpgsql set search_path='' as $$
declare days integer[]; times jsonb; day integer; today date; month_key text; fallback text; new_rule uuid;
begin
 if jsonb_typeof(p->'weekdays') is distinct from 'array' then raise exception 'Invalid weekdays' using errcode='22023'; end if;
 select coalesce(array_agg(value::integer order by value::integer),'{}') into days from jsonb_array_elements_text(p->'weekdays');
 if cardinality(days)>7 or exists(select 1 from unnest(days) x where x not between 1 and 7)
 or cardinality(days)<>(select count(distinct x) from unnest(days) x) then raise exception 'Invalid weekdays' using errcode='22023'; end if;
 times:=coalesce(p->'dayTimes','{}'::jsonb); fallback:=p->>'time';
 if jsonb_typeof(times) is distinct from 'object' then raise exception 'Invalid times' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(times) k where not(k=any(array(select x::text from unnest(days) x)))) then raise exception 'Unexpected day' using errcode='22023'; end if;
 foreach day in array days loop
  if coalesce(times->>day::text,fallback,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time' using errcode='22023'; end if;
  times:=jsonb_set(times,array[day::text],to_jsonb(coalesce(times->>day::text,fallback)));
 end loop;
 select (now() at time zone timezone)::date,to_char(now() at time zone timezone,'YYYY-MM') into today,month_key from public.workspaces where id=w;
 -- A profile-only edit must not recreate visits or touch their attendance.
 if exists(select 1 from public.schedule_rules r where r.workspace_id=w and r.student_id=s and r.enabled and r.weekdays @> days and r.weekdays <@ days
 and not exists(select 1 from unnest(days) x where coalesce(r.day_times->>x::text,to_char(r.time,'HH24:MI')) is distinct from times->>x::text)) then return; end if;
 update public.schedule_rules set enabled=false where workspace_id=w and student_id=s and enabled;
 update public.visits set status='cancelled' where workspace_id=w and student_id=s and source='scheduled' and status='pending' and date>=today;
 if cardinality(days)>0 then
  insert into public.schedule_rules(workspace_id,student_id,weekdays,time,day_times,effective_from) values(w,s,days,(times->>days[1]::text)::time,times,today) returning id into new_rule;
 end if;
 perform private.generate_visits(w,s,month_key);
 -- Only discard newly generated entries: a newly assigned schedule is not past attendance.
 delete from public.visits v where v.rule_id=new_rule and v.status='pending' and
 (v.date<today or exists(select 1 from public.visits old where old.student_id=s and old.workspace_id=w
 and old.date=v.date and old.rule_id is distinct from new_rule and ((old.source='scheduled' and old.status in ('open','closed','absent','rescheduled')) or (old.source='rescheduled' and old.status<>'cancelled'))));
end $$;

alter function private.apply_student_mutation(jsonb) rename to apply_student_mutation_before_details;
create function private.apply_student_mutation(c jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb:=c->'payload'; w uuid:=(c->>'workspaceId')::uuid;s uuid:=(c->>'studentId')::uuid;kind text:=c->>'kind';
begin
 if kind='save_schedule' then
  if exists(select 1 from public.students where workspace_id=w and id=s and archived) then raise exception 'Archived student' using errcode='22023'; end if;
  perform private.save_student_schedule(w,s,p); return;
 end if;
 if kind in ('create_student','update_student') and (p ? 'firstName' or p ? 'lastName') then
  if length(trim(coalesce(p->>'firstName','')))=0 or length(trim(coalesce(p->>'firstName','')))>100 or length(trim(coalesce(p->>'lastName','')))>100 then raise exception 'Invalid name' using errcode='22023'; end if;
  p:=p||jsonb_build_object('name',trim(trim(p->>'firstName')||' '||trim(coalesce(p->>'lastName',''))));
  c:=jsonb_set(c,'{payload}',p);
 end if;
 perform private.apply_student_mutation_before_details(c);
 if kind in ('create_student','update_student') then
  update public.students set
   first_name=case when p ? 'firstName' then trim(p->>'firstName') else first_name end,
   last_name=case when p ? 'lastName' then trim(p->>'lastName') else last_name end,
   gender=case when p ? 'gender' then p->>'gender' else gender end
  where workspace_id=w and id=s;
  if p ? 'schedule' then perform private.save_student_schedule(w,s,p->'schedule'); end if;
 end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;


