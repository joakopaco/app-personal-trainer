-- A completed trainer session updates the existing routine once, atomically with
-- its close receipt. Immutable revisions and the original session prescription
-- remain available. Historical reconciliation never changes current programming.
alter table public.session_items add column future_fields text[] not null default '{}';
alter table public.routine_revisions
  add column previous_revision_id uuid references public.routine_revisions(id) on delete set null,
  add column source_session_id uuid references public.sessions(id) on delete set null;
create unique index routine_revision_session on public.routine_revisions(source_session_id) where source_session_id is not null;
create index routine_revision_previous on public.routine_revisions(previous_revision_id) where previous_revision_id is not null;

-- Preserve legacy routines with more than four sets when measured results differ
-- by set. The editor and explicit set-count adjustment still offer 1..4 sets.
do $$
declare definition text;
begin
 select pg_get_functiondef('private.validate_routine(jsonb,boolean)'::regprocedure) into definition;
 if strpos(definition,'jsonb_array_length(p->''progression'') not between 1 and 4')=0 then
  raise exception 'Progression validator not found';
 end if;
 execute replace(definition,'jsonb_array_length(p->''progression'') not between 1 and 4','jsonb_array_length(p->''progression'') not between 1 and 50');
end $$;

create function private.session_result_prescription(rx jsonb, item public.session_items)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:=rx; targets jsonb:='[]'; target jsonb; initial jsonb;
 planned jsonb; actual public.session_sets; n integer; field text; val jsonb;
 all_equal boolean:=true; first_target jsonb; duration integer;
begin
 -- Only fields explicitly scoped to future weeks are copied from live controls.
 foreach field in array array['sets','microRest','durationSec'] loop
  if field=any(item.future_fields) then result:=jsonb_set(result,array[field],item.prescription->field); end if;
 end loop;
 if item.type='time' then
  select st.duration_sec into duration from public.session_sets st
   where st.item_id=item.id and st.state='done' and st.source='observed'
    and (st.duration_sec is distinct from (item.initial_prescription->>'durationSec')::integer or 'durationSec'=any(item.future_fields))
   order by st.ordinal desc limit 1;
  if found then result:=jsonb_set(result,'{durationSec}',to_jsonb(duration)); end if;
  return result;
 end if;
 for n in 0..(result->>'sets')::integer-1 loop
  target:=coalesce(rx->'progression'->n,jsonb_build_object('weight',rx->'weight','reps',rx->'reps'));
  -- An added set on an existing progression inherits a complete live target.
  if rx ? 'progression' and n>=jsonb_array_length(rx->'progression') then
   target:=coalesce(item.prescription->'progression'->n,jsonb_build_object('weight',item.prescription->'weight','reps',item.prescription->'reps'));
  end if;
  initial:=coalesce(item.initial_prescription->'progression'->n,item.initial_prescription);
  planned:=coalesce(item.prescription->'progression'->n,item.prescription);
  select * into actual from public.session_sets where item_id=item.id and ordinal=n+1 and state='done' and source='observed';
  foreach field in array array['weight','reps'] loop
   if field='weight' and item.type<>'load_reps' then continue; end if;
   if field=any(item.future_fields) then target:=jsonb_set(target,array[field],planned->field); end if;
   val:=case when field='weight' then to_jsonb(actual.weight) else to_jsonb(actual.reps) end;
   if actual.id is not null and (val is distinct from initial->field or field=any(item.future_fields)) then
    target:=jsonb_set(target,array[field],val);
   end if;
  end loop;
  if first_target is null then first_target:=target; elsif target<>first_target then all_equal:=false; end if;
  targets:=targets||jsonb_build_array(target);
 end loop;
 -- Keep a simple prescription simple when every target agrees. Existing
 -- progressions retain their explicit set structure even if values coincide.
 if all_equal and not (rx ? 'progression') then
  result:=result||first_target;
 else
  result:=jsonb_set(result,'{progression}',targets);
 end if;
 return result;
end $$;

create function private.carry_session_into_routine(session_id uuid)
returns void language plpgsql set search_path='' as $$
declare se public.sessions; period public.routine_periods; item public.session_items;
 source_doc jsonb; doc jsonb; result jsonb; source_day jsonb; target_day_id text;
 day_index integer; wi integer; di integer; bi integer; ei integer;
 exercise jsonb; rx jsonb; rid uuid;
begin
 select * into se from public.sessions where id=session_id and status='closed';
 if se.id is null then return; end if;
 select * into period from public.routine_periods
  where id=se.period_id and workspace_id=se.workspace_id and student_id=se.student_id for update;
 -- Late historical recovery is evidence, not a rewrite of a later program.
 if period.month<>to_char(now() at time zone se.timezone,'YYYY-MM') then return; end if;
 if exists(select 1 from public.routine_revisions r where r.source_session_id=se.id) then return; end if;
 select document into source_doc from public.routine_revisions where id=se.routine_revision_id;
 select document into doc from public.routine_revisions where id=period.current_revision_id;
 select value, (ordinality-1)::integer into source_day,day_index
  from jsonb_array_elements(source_doc->'weeks'->(se.week-1)) with ordinality where value->>'id'=se.day_id::text;
 if source_day is null then return; end if;
 result:=doc;
 for item in select * from public.session_items i where i.session_id=se.id and not i.skipped
  and exists(select 1 from public.session_sets st where st.item_id=i.id and st.state='done') order by i.ordinal loop
  for wi in se.week-1..3 loop
   -- Day identity prevents an exercise with the same lineage on another day,
   -- or a replacement routine, from receiving these results.
   target_day_id:=source_doc->'weeks'->wi->day_index->>'id';
   for di in 0..jsonb_array_length(doc->'weeks'->wi)-1 loop
    if doc->'weeks'->wi->di->>'id' is distinct from target_day_id then continue; end if;
    for bi in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks')-1 loop
     for ei in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks'->bi->'exercises')-1 loop
      exercise:=result->'weeks'->wi->di->'blocks'->bi->'exercises'->ei;
      if exercise->>'exerciseId'<>item.exercise_id or exercise->>'type'<>item.type then continue; end if;
      if exercise->>'lineageId'<>item.lineage_id::text then
       -- Weeks may have been authored separately rather than copied. A unique
       -- occurrence of the same exercise in the corresponding day is unambiguous.
       -- Repeated exercises require their shared lineage, never a name guess.
       if (select count(*) from jsonb_array_elements(source_day->'blocks') b,
         lateral jsonb_array_elements(b->'exercises') e where e->>'exerciseId'=item.exercise_id and e->>'type'=item.type)<>1
        or (select count(*) from jsonb_array_elements(doc->'weeks'->wi->di->'blocks') b,
         lateral jsonb_array_elements(b->'exercises') e where e->>'exerciseId'=item.exercise_id and e->>'type'=item.type)<>1 then continue; end if;
      end if;
      rx:=private.session_result_prescription(exercise->'prescription',item);
      result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,'exercises',ei::text,'prescription'],rx);
      if 'macroRest'=any(item.future_fields) then
       result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,'macroRest'],coalesce(to_jsonb(item.macro_rest),'null'::jsonb));
      end if;
      if 'macroTarget'=any(item.future_fields) then
       result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,'macroTarget'],to_jsonb(item.macro_target));
      end if;
     end loop;
    end loop;
   end loop;
  end loop;
 end loop;
 if result=doc then return; end if;
 perform private.validate_routine(result,true);
 insert into public.routine_revisions(workspace_id,student_id,period_id,document,previous_revision_id,source_session_id,created_at)
  values(se.workspace_id,se.student_id,period.id,result,period.current_revision_id,se.id,clock_timestamp()) returning id into rid;
 update public.routine_periods set current_revision_id=rid where id=period.id;
end $$;

-- Reuse all existing ownership, validation and close logic. Public command
-- handling already locks the student and records an idempotent audit receipt.
alter function private.apply_live_mutation(jsonb) rename to apply_live_mutation_before_routine_close;
create function private.apply_live_mutation(c jsonb) returns void language plpgsql set search_path='' as $$
declare edited jsonb:=c; p jsonb:=c->'payload'; item public.session_items; field text:=p->>'field';
begin
 if c->>'kind'='adjust_prescription' and p->>'scope'='session_and_future' then
  if exists(select 1 from public.sessions s join public.routine_periods rp on rp.id=s.period_id
    where s.id=(p->>'sessionId')::uuid and rp.month<>to_char(now() at time zone s.timezone,'YYYY-MM')) then
   raise exception 'Period changed' using errcode='22023';
  end if;
  edited:=jsonb_set(c,'{payload,scope}','"session_only"');
 end if;
 perform private.apply_live_mutation_before_routine_close(edited);
 if c->>'kind'='adjust_prescription' then
  select * into item from public.session_items where id=(p->>'itemId')::uuid
   and session_id=(p->>'sessionId')::uuid and workspace_id=(c->>'workspaceId')::uuid and student_id=(c->>'studentId')::uuid;
  update public.session_items i set future_fields=case when p->>'scope'='session_and_future'
    then array_append(array_remove(i.future_fields,field),field) else array_remove(i.future_fields,field) end
   where i.session_id=item.session_id and (i.id=item.id or (field in ('macroRest','macroTarget') and i.block_id=item.block_id));
 elsif c->>'kind'='finish_session' then
  perform private.carry_session_into_routine((p->>'sessionId')::uuid);
 end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
