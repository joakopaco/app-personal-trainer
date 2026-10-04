begin;
select plan(14);
insert into auth.users(id,email,email_confirmed_at) values('a1800000-0000-4000-8000-000000000001','details-fixture@pulso.local',now());
select set_config('request.jwt.claims','{"sub":"a1800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table details_context as select jsonb_build_object(
 'schemaVersion',1,'workspaceId',(public.ensure_workspace()).id,'studentId','a1800000-0000-4000-8000-000000000002',
 'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),'capturedAt',now(),'expectedRevision',0,'kind','create_student',
 'payload',jsonb_build_object('firstName','Ana María','lastName','Del Valle','gender','femenino','schedule',
 jsonb_build_object('weekdays',array[1,3],'dayTimes',jsonb_build_object('1','09:30','3','18:45')))) as command;
select is(public.apply_training_command(command)->>'status','applied','creates complete profile and schedule atomically') from details_context;
select is((select name from public.students where id='a1800000-0000-4000-8000-000000000002'),'Ana María Del Valle','preserves compound names');
select is((select gender from public.students where id='a1800000-0000-4000-8000-000000000002'),'femenino','persists gender');
select is(public.apply_training_command(command)->>'status','duplicate','retry does not create another student or schedule') from details_context;
select is((select count(*)::integer from public.schedule_rules where student_id='a1800000-0000-4000-8000-000000000002'),1,'one schedule after retry');
select is((private.student_snapshot((command->>'workspaceId')::uuid,(command->>'studentId')::uuid)#>>'{schedule,day_times,3}'),'18:45','canonical snapshot returns separate weekday time') from details_context;
select private.generate_visits((command->>'workspaceId')::uuid,(command->>'studentId')::uuid,to_char(now()+interval '1 month','YYYY-MM')) from details_context;
select ok(not exists(select 1 from public.visits where student_id='a1800000-0000-4000-8000-000000000002' and time<>case extract(isodow from date) when 1 then time '09:30' else time '18:45' end),'generated visits retain individual weekday times');
select ok(not exists(select 1 from public.visits where student_id='a1800000-0000-4000-8000-000000000002' and date<(now() at time zone 'America/Argentina/Buenos_Aires')::date),'new schedule does not invent past attendance');
select is(public.apply_training_command(command||jsonb_build_object('operationId',gen_random_uuid(),'kind','update_student','expectedRevision',1,
 'payload',jsonb_build_object('firstName','Wrong','lastName','Name','gender','otro','schedule',jsonb_build_object('weekdays',array[1,1],'time','09:00'))))->>'status','rejected','invalid schedule rejects entire profile update') from details_context;
select is((select name from public.students where id='a1800000-0000-4000-8000-000000000002'),'Ana María Del Valle','failed schedule cannot partially change profile');
select is((select revision::integer from public.students where id='a1800000-0000-4000-8000-000000000002'),1,'failed update leaves revision unchanged');
update public.schedule_rules set weekdays=array[3,1] where student_id='a1800000-0000-4000-8000-000000000002';
select private.save_student_schedule((command->>'workspaceId')::uuid,(command->>'studentId')::uuid,command#>'{payload,schedule}') from details_context;
select is((select count(*)::integer from public.schedule_rules where student_id='a1800000-0000-4000-8000-000000000002'),1,'weekday order alone does not replace the schedule');
insert into public.visits(id,workspace_id,student_id,date,time,source)
select gen_random_uuid(),(command->>'workspaceId')::uuid,(command->>'studentId')::uuid,(now() at time zone 'America/Argentina/Buenos_Aires')::date,time '12:00','rescheduled' from details_context;
select private.save_student_schedule((command->>'workspaceId')::uuid,(command->>'studentId')::uuid,jsonb_build_object('weekdays',array[1,2,3,4,5,6,7],'time','12:00')) from details_context;
select private.generate_visits((command->>'workspaceId')::uuid,(command->>'studentId')::uuid,to_char(now(),'YYYY-MM')) from details_context;
select is((select count(*)::integer from public.visits where student_id='a1800000-0000-4000-8000-000000000002' and date=(now() at time zone 'America/Argentina/Buenos_Aires')::date and status='pending'),1,'schedule generation preserves rescheduled destination without a duplicate');
select is(public.apply_training_command(command||jsonb_build_object('operationId',gen_random_uuid(),'kind','update_student','expectedRevision',0,'payload',jsonb_build_object('name','Stale name')))->>'status','conflict','stale profile edit cannot overwrite the latest revision') from details_context;
select * from finish();
rollback;
