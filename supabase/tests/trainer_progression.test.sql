begin;
select plan(39);

insert into auth.users(id,email,email_confirmed_at)
values ('a2800000-0000-4000-8000-000000000001','progression-fixture@pulso.local',now());
select set_config('request.jwt.claims','{"sub":"a2800000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.progression_document(days integer default 1) returns jsonb language plpgsql as $$
declare weeks jsonb:='[]'; week jsonb; wi integer; di integer;
begin
 for wi in 1..4 loop
  week:='[]';
  for di in 1..days loop
   week:=week||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Day '||di,'blocks',
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Main','type','main','macroRest',180,'macroTarget','blocks','exercises',
     jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'lineageId',extensions.uuid_generate_v5('a2800000-0000-4000-8000-000000000003',di::text),
      'exerciseId','fixture-squat','name','Squat','group','Legs','type','load_reps','warmup',false,
      'prescription',jsonb_build_object('sets',3,'weight',null,'reps',null,'durationSec',null,'microRest',30,
       'progression','[{"weight":20,"reps":10},{"weight":25,"reps":8},{"weight":30,"reps":6}]'::jsonb)))))));
  end loop;
  weeks:=weeks||jsonb_build_array(week);
 end loop;
 return jsonb_build_object('schemaVersion',1,'name','Progression fixture','weeks',weeks);
end $$;

create temp table progression_fixture as select (public.ensure_workspace()).id w,
 'a2800000-0000-4000-8000-000000000002'::uuid s,
 gen_random_uuid() draft,gen_random_uuid() session,gen_random_uuid() next_session,
 gen_random_uuid() template,gen_random_uuid() template_operation,gen_random_uuid() invalid_operation,
 pg_temp.progression_document() document, null::uuid original_revision;

create function pg_temp.training(kind text,payload jsonb) returns jsonb language sql as $$
 select public.apply_training_command(jsonb_build_object('schemaVersion',1,'workspaceId',f.w,'studentId',f.s,
  'operationId',gen_random_uuid(),'deviceId','a2800000-0000-4000-8000-000000000004','capturedAt',now(),
  'expectedRevision',coalesce((select revision from public.students where id=f.s),0),'kind',kind,'payload',payload))
 from progression_fixture f;
$$;

select is(pg_temp.training('create_student','{"name":"Progression fixture"}')->>'status','applied','creates isolated progression student');
select is(pg_temp.training('save_draft',jsonb_build_object('draftId',draft,'expectedDraftRevision',0,'baseRoutineRevisionId',null,'document',document))->>'status','applied','saves optional per-set targets with null scalar defaults') from progression_fixture;
select is(pg_temp.training('publish_routine',jsonb_build_object('draftId',draft,'expectedDraftRevision',1,'baseRoutineRevisionId',null,'targetMonth',to_char(now() at time zone 'America/Argentina/Buenos_Aires','YYYY-MM')))->>'status','applied','publishes fully specified progression') from progression_fixture;
update progression_fixture f set original_revision=(select current_revision_id from public.routine_periods where student_id=f.s);
select is((select count(*)::integer from public.routine_drafts where student_id=(select s from progression_fixture)),0,'publication consumes its draft');
select is((select document from public.routine_revisions where id=(select original_revision from progression_fixture)),(select document from progression_fixture),'published document retains all per-set targets');

select is(pg_temp.training('start_session',jsonb_build_object('sessionId',f.session,'periodId',p.id,'routineRevisionId',p.current_revision_id,
 'week',2,'dayId',f.document#>>'{weeks,1,0,id}','date',to_char(now() at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),'time','12:00','timezone','America/Argentina/Buenos_Aires'))->>'status','applied','starts week two from the published progression')
from progression_fixture f join public.routine_periods p on p.student_id=f.s;
select is((select jsonb_agg(jsonb_build_array(weight,reps) order by ordinal) from public.session_sets where session_id=(select session from progression_fixture)),
 '[[20,10],[25,8],[30,6]]'::jsonb,'session seeds each set from its own weight and reps, not scalar nulls');

select is(pg_temp.training('record_set',jsonb_build_object('sessionId',f.session,'itemId',st.item_id,'setId',st.id,'ordinal',1,'state','done','weight',35,'reps',9,'durationSec',null))->>'status','applied','records the first observed set')
from progression_fixture f join public.session_sets st on st.session_id=f.session and st.ordinal=1;
select is(pg_temp.training('adjust_prescription',jsonb_build_object('sessionId',f.session,'itemId',i.id,'field','microRest','value',60,'scope','session_only'))->>'status','applied','rest adjustment accepts progression without scalar weight/reps')
from progression_fixture f join public.session_items i on i.session_id=f.session;
select is((select jsonb_agg(jsonb_build_array(weight,reps) order by ordinal) from public.session_sets where session_id=(select session from progression_fixture)),
 '[[35,9],[25,8],[30,6]]'::jsonb,'rest adjustment preserves the observed result and all pending per-set targets');
select is((select prescription->>'microRest' from public.session_items where session_id=(select session from progression_fixture)),'60','rest adjustment changes only requested rest');

select is(pg_temp.training('adjust_prescription',jsonb_build_object('sessionId',f.session,'itemId',i.id,'field','weight','value',42,'scope','session_and_future'))->>'status','applied','weight adjustment propagates from selected week onward')
from progression_fixture f join public.session_items i on i.session_id=f.session;
select is((select jsonb_agg(jsonb_build_array(weight,reps) order by ordinal) from public.session_sets where session_id=(select session from progression_fixture)),
 '[[35,9],[42,8],[42,6]]'::jsonb,'future adjustment retains observed weight and pending repetition progression');
select is((select r.document#>'{weeks,0,0,blocks,0,exercises,0,prescription,progression}' from public.routine_periods p join public.routine_revisions r on r.id=p.current_revision_id where p.student_id=(select s from progression_fixture)),
 '[{"weight":20,"reps":10},{"weight":25,"reps":8},{"weight":30,"reps":6}]'::jsonb,'week before the selected week is unchanged');
select ok((select bool_and((week->0#>'{blocks,0,exercises,0,prescription,progression}')='[{"weight":42,"reps":10},{"weight":42,"reps":8},{"weight":42,"reps":6}]'::jsonb)
 from public.routine_periods p join public.routine_revisions r on r.id=p.current_revision_id,
 lateral jsonb_array_elements(r.document->'weeks') with ordinality as weeks(week,ordinal)
 where p.student_id=(select s from progression_fixture) and ordinal>=2),'selected and later weeks retain distinct reps with new weight');
select is((select document from public.routine_revisions where id=(select original_revision from progression_fixture)),(select document from progression_fixture),'future adjustment does not rewrite historical routine revision');

select is(pg_temp.training('adjust_prescription',jsonb_build_object('sessionId',f.session,'itemId',i.id,'field','sets','value',5,'scope','session_and_future'))->>'status','rejected','progression rejects a fifth set atomically')
from progression_fixture f join public.session_items i on i.session_id=f.session;
select is((select count(*)::integer from public.session_sets where session_id=(select session from progression_fixture)),3,'rejected resize leaves existing sets intact');
select is(pg_temp.training('finish_session',jsonb_build_object('sessionId',f.session,'quickConfirmItemIds',jsonb_build_array(i.id),'allowEmpty',false))->>'status','applied','quick confirmation closes remaining per-set targets')
from progression_fixture f join public.session_items i on i.session_id=f.session;
select is((select jsonb_agg(jsonb_build_array(weight,reps,state,source) order by ordinal) from public.session_sets where session_id=(select session from progression_fixture)),
 '[[35,9,"done","observed"],[42,8,"done","quick_confirmed"],[42,6,"done","quick_confirmed"]]'::jsonb,'closing preserves observed data and confirms each pending target');

select is(pg_temp.training('start_session',jsonb_build_object('sessionId',f.next_session,'periodId',p.id,'routineRevisionId',p.current_revision_id,
 'week',3,'dayId',f.document#>>'{weeks,2,0,id}','date',to_char(now() at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),'time','13:00','timezone','America/Argentina/Buenos_Aires'))->>'status','applied','next session uses revised future prescription')
from progression_fixture f join public.routine_periods p on p.student_id=f.s;
select is((select jsonb_agg(jsonb_build_array(weight,reps) order by ordinal) from public.session_sets where session_id=(select next_session from progression_fixture)),
 '[[42,10],[42,8],[42,6]]'::jsonb,'future session seeds propagated progression without historical observations');
select is(pg_temp.training('record_set',jsonb_build_object('sessionId',f.next_session,'itemId',st.item_id,'setId',st.id,'ordinal',1,'state','done','weight',null,'reps',null,'durationSec',null))->>'status','rejected','observed results still require measurements even with progression')
from progression_fixture f join public.session_sets st on st.session_id=f.next_session and st.ordinal=1;
select is(pg_temp.training('record_set',jsonb_build_object('sessionId',f.next_session,'itemId',st.item_id,'setId',st.id,'ordinal',1,'state','skipped','weight',99,'reps',99,'durationSec',null))->>'status','applied','skipped-set guard still accepts an unperformed result')
from progression_fixture f join public.session_sets st on st.session_id=f.next_session and st.ordinal=1;
select is((select jsonb_build_array(weight,reps,state) from public.session_sets where session_id=(select next_session from progression_fixture) and ordinal=1),
 '[null,null,"skipped"]'::jsonb,'skipped result does not retain fictitious measurements');
select lives_ok(format('select private.apply_historical_mutation(%L::jsonb)',jsonb_build_object('workspaceId',f.w,'studentId',f.s,'kind','adjust_prescription',
 'payload',jsonb_build_object('sessionId',f.next_session,'itemId',i.id,'field','microRest','value',180,'scope','session_only'))),'historical executor also accepts nullable scalar progression during rest replay')
from progression_fixture f join public.session_items i on i.session_id=f.next_session;
select is((select jsonb_agg(jsonb_build_array(weight,reps) order by ordinal) from public.session_sets where session_id=(select next_session from progression_fixture)),
 '[[null,null],[42,8],[42,6]]'::jsonb,'historical rest replay preserves skipped result and pending targets');
select ok(not has_function_privilege('authenticated','private.apply_live_mutation(jsonb)','execute'),'live private executor remains inaccessible to authenticated clients');
select ok(not has_function_privilege('authenticated','private.apply_historical_mutation(jsonb)','execute'),'historical private executor remains inaccessible to authenticated clients');

create temp table template_fixture as select jsonb_build_object('workspaceId',w,'id',template,'operationId',template_operation,
 'kind','template','expectedRevision',0,'payload',jsonb_build_object('document',pg_temp.progression_document(6))) command from progression_fixture;
create temp table template_saved as select public.save_library_entry(command) result from template_fixture;
select is((select result->>'revision' from template_saved),'1','six-day template saves successfully');
select is(public.save_library_entry(command),(select result from template_saved),'same template operation returns identical receipt') from template_fixture;
select is((select revision::integer from public.routine_templates where id=(select template from progression_fixture)),1,'template retry does not increment revision');
select throws_ok(format('select public.save_library_entry(%L::jsonb)',command||jsonb_build_object('operationId',(select invalid_operation from progression_fixture),'expectedRevision',1,'payload',jsonb_build_object('document',pg_temp.progression_document(7)))),
 '22023','Templates support at most 6 days per week','seventh template day is rejected before modification') from template_fixture;
select is((select document from public.routine_templates where id=(select template from progression_fixture)),(select command#>'{payload,document}' from template_fixture),'rejected seventh day preserves complete saved template');
select is((select count(*)::integer from public.admin_receipts where operation_id=(select invalid_operation from progression_fixture)),0,'invalid template creates no successful receipt');
select throws_ok(format('select public.save_library_entry(%L::jsonb)',command||jsonb_build_object('payload',jsonb_build_object('document',pg_temp.progression_document(1)))),
 '22023','ID reused','idempotency still rejects reusing an operation for different content') from template_fixture;
select throws_ok(format('select public.save_library_entry(%L::jsonb)',command||jsonb_build_object('operationId',gen_random_uuid())),
 '22023','Revision changed','stale template revision still cannot overwrite a newer version') from template_fixture;

-- Simulate a receipt issued before the six-day cap. Replaying a confirmed
-- operation must recover its exact acknowledgement before newer validation.
create temp table legacy_template as select command||jsonb_build_object('id',gen_random_uuid(),'operationId',gen_random_uuid(),
 'payload',jsonb_build_object('document',pg_temp.progression_document(7))) command from template_fixture;
insert into public.admin_receipts(workspace_id,operation_id,hash,result)
select (command->>'workspaceId')::uuid,(command->>'operationId')::uuid,encode(extensions.digest(command::text,'sha256'),'hex'),'{"legacyReceipt":true,"revision":1}'::jsonb from legacy_template;
select is(public.save_library_entry(command),'{"legacyReceipt":true,"revision":1}'::jsonb,'legacy seven-day receipt still replays before new template validation') from legacy_template;
select is((select count(*)::integer from public.routine_templates where id=(select (command->>'id')::uuid from legacy_template)),0,'receipt replay never recreates a consumed or deleted legacy template');

select * from finish();
rollback;
