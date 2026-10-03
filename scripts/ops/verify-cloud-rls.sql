-- Run as postgres in the Pulso SQL Editor. Everything is rolled back,
-- including the two synthetic identities; no passwords or real emails.
begin;
create temporary table pulso_security_check as
select gen_random_uuid() as u1, gen_random_uuid() as u2,
       gen_random_uuid() as w1, gen_random_uuid() as w2,
       gen_random_uuid() as s1, gen_random_uuid() as s2;
grant select on pulso_security_check to authenticated;
insert into auth.users(id,email_confirmed_at)
select u1,now() from pulso_security_check union all
select u2,now() from pulso_security_check;
insert into public.workspaces(id,owner_user_id)
select w1,u1 from pulso_security_check union all
select w2,u2 from pulso_security_check;
insert into public.students(id,workspace_id,name)
select s1,w1,'Temporary isolation check A' from pulso_security_check union all
select s2,w2,'Temporary isolation check B' from pulso_security_check;
select set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true) from pulso_security_check;
set local role authenticated;
do $$
declare f record; result jsonb;
begin
  select * into f from pulso_security_check;
  if (select count(*) from public.students where id in (f.s1,f.s2)) <> 1
     or not exists(select 1 from public.students where id=f.s1)
     or exists(select 1 from public.workspaces where id=f.w2) then
    raise exception 'Cross-account read isolation failed';
  end if;
  if (public.ensure_workspace()).id <> f.w1 then
    raise exception 'Workspace bootstrap changed owner';
  end if;
  result := public.apply_training_command(jsonb_build_object(
    'schemaVersion',1,'workspaceId',f.w2,'studentId',f.s2,
    'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),
    'capturedAt',now(),'expectedRevision',0,'kind','update_student',
    'payload',jsonb_build_object('name','Unauthorized change')));
  if result->>'code' is distinct from 'FORBIDDEN' then
    raise exception 'Cross-account RPC mutation was not forbidden';
  end if;
  if has_table_privilege('authenticated','public.students','UPDATE')
     or has_table_privilege('authenticated','public.audit_events','DELETE') then
    raise exception 'Direct mutation or audit deletion allowed';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true) from pulso_security_check;
set local role authenticated;
do $$
declare f record;
begin
  select * into f from pulso_security_check;
  if (select count(*) from public.students where id in (f.s1,f.s2)) <> 1
     or not exists(select 1 from public.students where id=f.s2)
     or exists(select 1 from public.workspaces where id=f.w1) then
    raise exception 'Reverse account isolation failed';
  end if;
end $$;
reset role;
rollback;
select 'PASS: both accounts isolated; foreign RPC denied; direct writes denied; all fixtures rolled back' as verification;
