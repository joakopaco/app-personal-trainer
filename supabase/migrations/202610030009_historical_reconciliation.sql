-- The private executor remains inaccessible to clients. Only a reviewed, audited
-- reconciliation can replay historical operations, always session_only.
alter function private.apply_student_mutation(jsonb) rename to apply_live_mutation;
do $$ declare definition text;begin
 select pg_get_functiondef('private.apply_live_mutation(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'apply_live_mutation(c jsonb)','apply_historical_mutation(c jsonb)');
 definition:=replace(definition,'if period.month<>to_char(now() at time zone (select timezone from public.workspaces where id=w),''YYYY-MM'') then','if period.month>=to_char(now() at time zone (select timezone from public.workspaces where id=w),''YYYY-MM'') then');
 execute definition;
end $$;
create function private.apply_student_mutation(c jsonb) returns void language plpgsql set search_path='' as $$
declare w uuid:=(c->>'workspaceId')::uuid;s uuid:=(c->>'studentId')::uuid;p jsonb:=c->'payload';sid uuid:=(p->>'sessionId')::uuid;
 step jsonb;edited jsonb;old public.operation_receipts;originals jsonb:='[]';seen uuid[]:='{}';op uuid;hash text;before_state jsonb;rev bigint;patch jsonb;period_month text;
begin
 if c->>'kind'<>'reconcile_offline_session' then perform private.apply_live_mutation(c);return;end if;
 if length(trim(p->>'reason')) not between 3 and 500 or p->>'reason' is null or sid is null or jsonb_typeof(p->'operations') is distinct from 'array' or jsonb_array_length(p->'operations') not between 1 and 1000 then raise exception 'Invalid reconciliation' using errcode='22023';end if;
 select rp.month into period_month from public.sessions se join public.routine_periods rp on rp.id=se.period_id where se.id=sid and se.workspace_id=w and se.student_id=s;
 if period_month is null then
  select rp.month into period_month from public.routine_periods rp where rp.id=(p->'operations'->0->'payload'->>'periodId')::uuid and rp.workspace_id=w and rp.student_id=s;
 end if;
 if period_month is null or period_month>=to_char(now() at time zone (select timezone from public.workspaces where id=w),'YYYY-MM') then raise exception 'Not a historical period' using errcode='22023';end if;
 for step in select value from jsonb_array_elements(p->'operations') loop
  op:=(step->>'operationId')::uuid;
  if op is null or op=any(seen) or op=(c->>'operationId')::uuid or step->>'workspaceId' is distinct from w::text or step->>'studentId' is distinct from s::text or step->'payload'->>'sessionId' is distinct from sid::text or step->>'kind' not in ('start_session','adjust_prescription','record_set','skip_item','finish_session') or step->>'kind' is null then raise exception 'Invalid recovery operation' using errcode='22023';end if;
  seen:=array_append(seen,op);hash:=encode(extensions.digest(step::text,'sha256'),'hex');
  select * into old from public.operation_receipts where workspace_id=w and operation_id=op;
  if found then if old.command_hash<>hash then raise exception 'Reused operation' using errcode='22023';end if;continue;end if;
  before_state:=private.audit_snapshot(w,s,step);edited:=step;
  if step->>'kind'='adjust_prescription' then edited:=jsonb_set(step,'{payload,scope}','"session_only"');end if;
  perform private.apply_historical_mutation(edited);
  insert into public.audit_events(workspace_id,student_id,operation_id,actor_id,kind,before_data,after_data,reason,captured_at)
   values(w,s,op,auth.uid(),step->>'kind',before_state,private.audit_snapshot(w,s,step),p->>'reason',(step->>'capturedAt')::timestamptz);
  originals:=originals||jsonb_build_array(step);
 end loop;
 if exists(select 1 from public.sessions where id=sid and workspace_id=w and student_id=s and status='open') then
  perform private.apply_live_mutation(c||jsonb_build_object('kind','finish_session','payload',jsonb_build_object('sessionId',sid,'quickConfirmItemIds',p->'quickConfirmItemIds','allowEmpty',coalesce(p->'allowEmpty','false'::jsonb))));
 end if;
 if not exists(select 1 from public.sessions where id=sid and workspace_id=w and student_id=s and status='closed') then raise exception 'Recovery did not close' using errcode='22023';end if;
 select revision+1 into rev from public.students where id=s and workspace_id=w;
 patch:=jsonb_set(private.student_snapshot(w,s),'{revision}',to_jsonb(rev));
 patch:=jsonb_set(patch,'{student,revision}',to_jsonb(rev));
 for step in select value from jsonb_array_elements(originals) loop
  op:=(step->>'operationId')::uuid;
  insert into public.operation_receipts(workspace_id,operation_id,student_id,actor_id,command_hash,reply)
   values(w,op,s,auth.uid(),encode(extensions.digest(step::text,'sha256'),'hex'),jsonb_build_object('status','applied','operationId',op,'revision',rev,'patch',patch));
 end loop;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
