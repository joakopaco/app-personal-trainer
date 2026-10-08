-- Optional per-series targets. Existing documents and immutable historical results remain readable.
create or replace function private.adjust_progression(rx jsonb, field text, val jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:=jsonb_set(rx,array[field],val); targets jsonb:='[]'; n integer; target jsonb;
begin
 if not (rx ? 'progression') then return result; end if;
 if field='sets' then
  if (val::text)::integer not between 1 and 4 then raise exception 'Progression supports 1 to 4 sets' using errcode='22023'; end if;
  for n in 0..(val::text)::integer-1 loop
   target:=coalesce(rx->'progression'->n,jsonb_build_object('weight',rx->'weight','reps',rx->'reps'));
   targets:=targets||jsonb_build_array(target);
  end loop;
 elsif field in ('weight','reps') then
  for target in select value from jsonb_array_elements(rx->'progression') loop
   targets:=targets||jsonb_build_array(jsonb_set(target,array[field],val));
  end loop;
 else return result;
 end if;
 return jsonb_set(result,'{progression}',targets);
end $$;

create or replace function private.validate_routine(doc jsonb,publish boolean) returns void language plpgsql set search_path='' as $$
declare wk jsonb;dy jsonb;b jsonb;e jsonb;p jsonb;ident text;ids text[]:='{}';lineages text[];cnt integer; target jsonb;
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
     if p ? 'progression' then
      if e->>'type'='time' or jsonb_typeof(p->'progression') is distinct from 'array' then raise exception 'Invalid progression' using errcode='22023';end if;
      if jsonb_array_length(p->'progression') not between 1 and 4 or jsonb_array_length(p->'progression') is distinct from (p->>'sets')::integer then raise exception 'Progression must match sets' using errcode='22023';end if;
      for target in select value from jsonb_array_elements(p->'progression') loop
       perform private.validate_numeric(target,'weight',0,1000,not publish or e->>'type'<>'load_reps',true);
       perform private.validate_numeric(target,'reps',1,500,not publish);
      end loop;
     end if;
     perform private.validate_numeric(p,'sets',1,50,not publish);
     perform private.validate_numeric(p,'weight',0,1000,not publish or e->>'type'<>'load_reps' or p ? 'progression',true);
     perform private.validate_numeric(p,'reps',1,500,not publish or e->>'type'='time' or p ? 'progression');
     perform private.validate_numeric(p,'durationSec',1,86400,not publish or e->>'type'<>'time');
     perform private.validate_numeric(p,'microRest',0,3600,true);
    end loop;
   end loop;
   if publish and cnt=0 then raise exception 'Empty day' using errcode='22023';end if;
  end loop;
 end loop;
end $$;

create or replace function private.replace_prescription(doc jsonb,lineage uuid,start_week integer,field text,value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:=doc;wi integer;di integer;bi integer;ei integer;
begin
 for wi in start_week-1..3 loop
  for di in 0..jsonb_array_length(doc->'weeks'->wi)-1 loop
   for bi in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks')-1 loop
    for ei in 0..jsonb_array_length(doc->'weeks'->wi->di->'blocks'->bi->'exercises')-1 loop
     if doc->'weeks'->wi->di->'blocks'->bi->'exercises'->ei->>'lineageId'=lineage::text then
      if field in ('macroRest','macroTarget') then result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,field],value);
      else result:=jsonb_set(result,array['weeks',wi::text,di::text,'blocks',bi::text,'exercises',ei::text,'prescription'],private.adjust_progression(doc->'weeks'->wi->di->'blocks'->bi->'exercises'->ei->'prescription',field,value));end if;
     end if;
    end loop;
   end loop;
  end loop;
 end loop;
 return result;
end $$;

-- Patch both existing executors, preserving security, skipped-result and historical guards.
do $$
declare definition text; target text;
begin
 foreach target in array array['private.apply_live_mutation(jsonb)','private.apply_historical_mutation(jsonb)'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  if position('rx:=jsonb_set(rx,array[field],val);' in definition)=0 then raise exception 'Missing prescription adjustment in %',target;end if;
  definition:=replace(definition,'rx:=jsonb_set(rx,array[field],val);','rx:=private.adjust_progression(rx,field,val);');
  definition:=replace(definition,'(rx->>''weight'')::numeric,(rx->>''reps'')::integer,(rx->>''durationSec'')::integer','(coalesce(rx->''progression''->(n-1),rx)->>''weight'')::numeric,(coalesce(rx->''progression''->(n-1),rx)->>''reps'')::integer,(rx->>''durationSec'')::integer');
  definition:=replace(definition,'update public.session_sets set weight=(rx->>''weight'')::numeric,reps=(rx->>''reps'')::integer,duration_sec=(rx->>''durationSec'')::integer where item_id=i.id and state=''pending'';',
   'update public.session_sets set weight=(coalesce(rx->''progression''->(ordinal-1),rx)->>''weight'')::numeric,reps=(coalesce(rx->''progression''->(ordinal-1),rx)->>''reps'')::integer,duration_sec=(rx->>''durationSec'')::integer where item_id=i.id and state=''pending'';');
  -- Only adjustment can use optional scalar defaults; recorded observations stay strictly validated.
  definition:=replace(definition,'perform private.validate_numeric(rx,''sets'',1,50);perform private.validate_numeric(rx,''weight'',0,1000,i.type<>''load_reps'',true);perform private.validate_numeric(rx,''reps'',1,500,i.type=''time'');',
   'perform private.validate_numeric(rx,''sets'',1,50);perform private.validate_numeric(rx,''weight'',0,1000,i.type<>''load_reps'' or rx ? ''progression'',true);perform private.validate_numeric(rx,''reps'',1,500,i.type=''time'' or rx ? ''progression'');');
  execute definition;
 end loop;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
