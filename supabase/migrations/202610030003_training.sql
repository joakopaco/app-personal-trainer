create function private.replace_prescription(doc jsonb,lineage uuid,start_week integer,field text,value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:=doc;wi integer;di integer;bi integer;ei integer;
begin
 for wi in start_week-1..3 loop
  for di in 0..jsonb_array_length(doc->'weeks'->wi)-1 loop
   for bi in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks')-1 loop
    for ei in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks'->bi->'exercises')-1 loop
     if doc->'weeks'->wi->di->'blocks'->bi->'exercises'->ei->>'lineageId'=lineage::text then
      if field in ('macroRest','macroTarget') then result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,field],value);
      else result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,'exercises',ei::text,'prescription',field],value);end if;
     end if;
    end loop;
   end loop;
  end loop;
 end loop;
 return result;
end $$;
alter function private.apply_student_mutation(jsonb) rename to apply_programming_mutation;
create function private.apply_student_mutation(c jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb:=c->'payload';w uuid:=(c->>'workspaceId')::uuid;s uuid:=(c->>'studentId')::uuid;kind text:=c->>'kind';
 se public.sessions;i public.session_items;ss public.session_sets;period public.routine_periods;
 doc jsonb;day_doc jsonb;b jsonb;e jsonb;rx jsonb;newdoc jsonb;field text;val jsonb;
 target_session uuid:=(p->>'sessionId')::uuid;target_item uuid;target_visit uuid;rid uuid;ord integer:=0;n integer;set_count integer;
begin
 if kind not in ('start_session','adjust_prescription','record_set','skip_item','finish_session','correct_result') then perform private.apply_programming_mutation(c);return;end if;
 if exists(select 1 from public.students where id=s and archived) then raise exception 'Archived' using errcode='22023';end if;
 if kind='start_session' then
  if exists(select 1 from public.sessions where student_id=s and status='open') then raise exception 'Session already open' using errcode='22023';end if;
  select * into period from public.routine_periods where id=(p->>'periodId')::uuid and workspace_id=w and student_id=s for update;
  if period.id is null or period.current_revision_id is distinct from (p->>'routineRevisionId')::uuid then raise exception 'Routine changed' using errcode='22023';end if;
  if period.month<>to_char(now() at time zone (select timezone from public.workspaces where id=w),'YYYY-MM') then raise exception 'Period changed' using errcode='22023';end if;
  if p->>'timezone' is distinct from (select timezone from public.workspaces where id=w) or p->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'date')::date>current_date+1 or left(p->>'date',7)<>period.month or p->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid local time' using errcode='22023';end if;
  select document into doc from public.routine_revisions where id=period.current_revision_id;
  select value into day_doc from jsonb_array_elements(doc->'weeks'->((p->>'week')::integer-1)) where value->>'id'=p->>'dayId';
  if day_doc is null then raise exception 'Day not found' using errcode='22023';end if;
  target_visit:=(p->>'visitId')::uuid;
  if target_visit is null then target_visit:=extensions.uuid_generate_v5(target_session,'visit');insert into public.visits(id,workspace_id,student_id,date,time) values(target_visit,w,s,(p->>'date')::date,(p->>'time')::time);
  elsif not exists(select 1 from public.visits where id=target_visit and workspace_id=w and student_id=s and status='pending' and date=(p->>'date')::date) then raise exception 'Visit unavailable' using errcode='22023';end if;
  update public.visits set status='open' where id=target_visit;
  insert into public.sessions(id,workspace_id,student_id,period_id,routine_revision_id,visit_id,day_id,week,date,timezone,captured_at)
   values(target_session,w,s,period.id,period.current_revision_id,target_visit,(p->>'dayId')::uuid,(p->>'week')::integer,(p->>'date')::date,p->>'timezone',(c->>'capturedAt')::timestamptz);
  for b in select value from jsonb_array_elements(day_doc->'blocks') loop
   for e in select value from jsonb_array_elements(b->'exercises') loop
    ord:=ord+1;target_item:=extensions.uuid_generate_v5(target_session,e->>'id');rx:=e->'prescription';
    insert into public.session_items(id,workspace_id,student_id,session_id,position_id,lineage_id,block_id,block_name,exercise_id,name,"group",type,warmup,ordinal,prescription,initial_prescription,macro_rest,macro_target)
     values(target_item,w,s,target_session,(e->>'id')::uuid,(e->>'lineageId')::uuid,(b->>'id')::uuid,b->>'name',e->>'exerciseId',e->>'name',e->>'group',e->>'type',(e->>'warmup')::boolean,ord,rx,rx,(b->>'macroRest')::integer,b->>'macroTarget');
    for n in 1..(rx->>'sets')::integer loop
     insert into public.session_sets(id,workspace_id,student_id,session_id,item_id,ordinal,weight,reps,duration_sec)
      values(extensions.uuid_generate_v5(target_item,n::text),w,s,target_session,target_item,n,(rx->>'weight')::numeric,(rx->>'reps')::integer,(rx->>'durationSec')::integer);
    end loop;
   end loop;
  end loop;
  return;
 end if;
 select * into se from public.sessions where id=target_session and workspace_id=w and student_id=s for update;
 if se.id is null or (se.status<>'open' and kind<>'correct_result') then raise exception 'Session closed or missing' using errcode='22023';end if;
 if kind='finish_session' then
  if jsonb_typeof(p->'quickConfirmItemIds') is distinct from 'array' then raise exception 'Invalid quick confirm' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(p->'quickConfirmItemIds') x where not exists(select 1 from public.session_items where id=x::uuid and session_id=se.id and not skipped)) then raise exception 'Invalid item' using errcode='22023';end if;
  update public.session_sets st set state='done',source='quick_confirmed' from public.session_items it
   where st.item_id=it.id and it.session_id=se.id and not it.skipped and st.state='pending' and p->'quickConfirmItemIds' ? it.id::text;
  if exists(select 1 from public.session_sets st join public.session_items it on it.id=st.item_id where it.session_id=se.id and not it.skipped and st.state='pending') then raise exception 'Pending sets' using errcode='22023';end if;
  if not coalesce((p->>'allowEmpty')::boolean,false) and not exists(select 1 from public.session_sets st join public.session_items it on it.id=st.item_id where it.session_id=se.id and not it.skipped and st.state='done') then raise exception 'Empty session' using errcode='22023';end if;
  update public.sessions set status='closed',ended_at=now() where id=se.id;
  update public.visits set status='closed' where id=se.visit_id;
  return;
 end if;
 select * into i from public.session_items where id=(p->>'itemId')::uuid and session_id=se.id and workspace_id=w and student_id=s;
 if i.id is null then raise exception 'Item not found' using errcode='22023';end if;
 if kind='skip_item' then
  if jsonb_typeof(p->'skipped') is distinct from 'boolean' then raise exception 'Invalid skip' using errcode='22023';end if;
  update public.session_items set skipped=(p->>'skipped')::boolean where id=i.id;
 elsif kind='adjust_prescription' then
  field:=p->>'field';val:=p->'value';rx:=i.prescription;
  if field not in ('weight','reps','sets','durationSec','microRest','macroRest','macroTarget') or field is null or val is null or p->>'scope' not in ('session_only','session_and_future') or p->>'scope' is null then raise exception 'Invalid adjustment' using errcode='22023';end if;
  if field in ('macroRest','macroTarget') then
   if field='macroRest' then perform private.validate_numeric(jsonb_build_object('macroRest',val),'macroRest',0,3600,true);
    update public.session_items set macro_rest=(p->>'value')::integer where session_id=se.id and block_id=i.block_id;
   else if p->>'value' not in ('series','blocks') then raise exception 'Invalid target' using errcode='22023';end if;update public.session_items set macro_target=p->>'value' where session_id=se.id and block_id=i.block_id;end if;
  else
   rx:=jsonb_set(rx,array[field],val);
   perform private.validate_numeric(rx,'sets',1,50);perform private.validate_numeric(rx,'weight',0,1000,i.type<>'load_reps',true);perform private.validate_numeric(rx,'reps',1,500,i.type='time');perform private.validate_numeric(rx,'durationSec',1,86400,i.type<>'time');perform private.validate_numeric(rx,'microRest',0,3600,true);
   set_count:=(rx->>'sets')::integer;
   if exists(select 1 from public.session_sets where item_id=i.id and ordinal>set_count and state<>'pending') then raise exception 'Cannot remove observed sets' using errcode='22023';end if;
   delete from public.session_sets where item_id=i.id and ordinal>set_count and state='pending';
   update public.session_items set prescription=rx where id=i.id;
   update public.session_sets set weight=(rx->>'weight')::numeric,reps=(rx->>'reps')::integer,duration_sec=(rx->>'durationSec')::integer where item_id=i.id and state='pending';
   for n in 1..set_count loop insert into public.session_sets(id,workspace_id,student_id,session_id,item_id,ordinal,weight,reps,duration_sec)
    values(extensions.uuid_generate_v5(i.id,n::text),w,s,se.id,i.id,n,(rx->>'weight')::numeric,(rx->>'reps')::integer,(rx->>'durationSec')::integer) on conflict(item_id,ordinal) do nothing;end loop;
  end if;
  if p->>'scope'='session_and_future' then
   select * into period from public.routine_periods where id=se.period_id for update;
   if period.month<>to_char(now() at time zone se.timezone,'YYYY-MM') then raise exception 'Period changed' using errcode='22023';end if;
   select document into doc from public.routine_revisions where id=period.current_revision_id;
   newdoc:=private.replace_prescription(doc,i.lineage_id,se.week,field,val);perform private.validate_routine(newdoc,true);
   insert into public.routine_revisions(workspace_id,student_id,period_id,document) values(w,s,period.id,newdoc) returning id into rid;
   update public.routine_periods set current_revision_id=rid where id=period.id;
  end if;
 elsif kind in ('record_set','correct_result') then
  select * into ss from public.session_sets where id=(p->>'setId')::uuid and item_id=i.id;
  if ss.id is null then raise exception 'Set missing' using errcode='22023';end if;
  if kind='record_set' then
   if ss.state<>'pending' or ss.ordinal is distinct from (p->>'ordinal')::integer or p->>'state' not in ('done','skipped') or p->>'state' is null then raise exception 'Explicit correction required' using errcode='22023';end if;
   rx:=p;
  else
   if length(trim(p->>'reason')) not between 3 and 500 or p->>'reason' is null or ss.state<>'done' or p->>'field' not in ('weight','reps','durationSec') or p->>'field' is null then raise exception 'Invalid correction' using errcode='22023';end if;
   rx:=jsonb_set(jsonb_build_object('weight',ss.weight,'reps',ss.reps,'durationSec',ss.duration_sec),array[p->>'field'],p->'value');
  end if;
  perform private.validate_numeric(rx,'weight',0,1000,i.type<>'load_reps',true);perform private.validate_numeric(rx,'reps',1,500,i.type='time');perform private.validate_numeric(rx,'durationSec',1,86400,i.type<>'time');
  update public.session_sets set weight=(rx->>'weight')::numeric,reps=(rx->>'reps')::integer,duration_sec=(rx->>'durationSec')::integer,
   state=case when kind='record_set' then p->>'state' else state end,source=case when kind='record_set' then 'observed' else source end where id=ss.id;
 end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
