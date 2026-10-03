begin;
select plan(6);
insert into auth.users(id,email,email_confirmed_at) values('a1700000-0000-4000-8000-000000000001','atomic-fixture@pulso.local',now());
select set_config('request.jwt.claims','{"sub":"a1700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table atomic_context as select jsonb_build_object(
 'schemaVersion',1,'workspaceId',(public.ensure_workspace()).id,'studentId','a1700000-0000-4000-8000-000000000002',
 'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),'capturedAt',now(),'expectedRevision',0,
 'kind','create_student','payload',jsonb_build_object('name','Atomic fixture')) as command;
create function private.test_fail_receipt() returns trigger language plpgsql as $$
begin
 if new.student_id='a1700000-0000-4000-8000-000000000002'::uuid then raise exception 'Injected before receipt' using errcode='23514';end if;
 return new;
end $$;
create trigger test_fail_receipt before insert on public.operation_receipts for each row execute function private.test_fail_receipt();
select is((public.apply_training_command(command)->>'status'),'rejected','injected failure rejects the whole command') from atomic_context;
select is((select count(*) from public.students where id='a1700000-0000-4000-8000-000000000002'),0::bigint,'student and revision rolled back');
select is((select count(*) from public.audit_events where student_id='a1700000-0000-4000-8000-000000000002'),0::bigint,'audit rolled back');
select is((select count(*) from public.operation_receipts where student_id='a1700000-0000-4000-8000-000000000002'),0::bigint,'no successful receipt left behind');
drop trigger test_fail_receipt on public.operation_receipts;
select is((public.apply_training_command(command)->>'status'),'applied','same command can succeed after recovery') from atomic_context;
select is((public.apply_training_command(command)->>'status'),'duplicate','successful retry is deduplicated') from atomic_context;
select * from finish();
rollback;
