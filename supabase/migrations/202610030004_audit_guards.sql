-- Capture closed execution separately: the lightweight live snapshot intentionally omits it.
create function private.audit_snapshot(w uuid,s uuid,c jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(private.student_snapshot(w,s),'{}'::jsonb)||jsonb_build_object('result',
  (select to_jsonb(se)||jsonb_build_object('session_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.ordinal) from public.session_items i where i.session_id=se.id),'[]'),
   'session_sets',coalesce((select jsonb_agg(to_jsonb(st) order by st.item_id,st.ordinal) from public.session_sets st where st.session_id=se.id),'[]'))
  from public.sessions se where se.workspace_id=w and se.student_id=s and se.id=(c->'payload'->>'sessionId')::uuid));
$$;
-- Rebuild dispatcher from the existing version while preserving all ownership/idempotency checks.
do $$ declare definition text;begin
 select pg_get_functiondef('public.apply_training_command(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'before_state:=private.student_snapshot(w,s);','before_state:=private.audit_snapshot(w,s,command);');
 definition:=replace(definition,'before_state,after_state,command->','before_state,private.audit_snapshot(w,s,command),command->');
 execute definition;
end $$;
create or replace function private.validate_numeric(p jsonb,k text,lo numeric,hi numeric,optional boolean default false,decimal_ok boolean default false) returns void language plpgsql set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(p) is distinct from 'object' or not(p?k) then raise exception 'Missing field' using errcode='22023';end if;
 if p->k='null'::jsonb and optional then return;end if;
 if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'Invalid number' using errcode='22023';end if;
 n:=(p->>k)::numeric;
 if n<lo or n>hi or (decimal_ok and n<>round(n,2)) or (not decimal_ok and n<>trunc(n)) then raise exception 'Out of range' using errcode='22023';end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
alter publication supabase_realtime add table public.students;
