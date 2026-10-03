create function private.validate_legacy_source(src jsonb) returns void language plpgsql set search_path='' as $$
declare db jsonb:=src->'data'->'db';people jsonb:=db->'people';person jsonb;r jsonb;records jsonb;key text;ids text[]:='{}';seen text[];
begin
 if src->>'format' is distinct from 'pulso-backup' or src->'data'->>'version' is distinct from '6' or jsonb_typeof(people) is distinct from 'array' or jsonb_array_length(people) not between 1 and 100 then raise exception 'Invalid backup' using errcode='22023';end if;
 foreach key in array array['templates','library','visits','sessions'] loop if jsonb_typeof(db->key) is distinct from 'array' then raise exception 'Missing legacy collection' using errcode='22023';end if;end loop;
 for person in select value from jsonb_array_elements(people) loop
  if person->>'id' is null or length(person->>'id') not between 1 and 100 or person->>'id'=any(ids) or person->>'name' is null or length(trim(person->>'name')) not between 1 and 100 then raise exception 'Invalid legacy identity' using errcode='22023';end if;
  ids:=array_append(ids,person->>'id');
  foreach key in array array['weekdays','archives','history','records'] loop if jsonb_typeof(person->key) is distinct from 'array' then raise exception 'Invalid legacy collection' using errcode='22023';end if;end loop;
  if jsonb_array_length(person->'records')>10000 then raise exception 'Too many legacy records' using errcode='22023';end if;
  for r in select value from jsonb_array_elements(person->'records') loop
   if r->>'date' is null or r->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(r->'name') is distinct from 'string' or jsonb_typeof(r->'group') is distinct from 'string' then raise exception 'Invalid legacy record' using errcode='22023';end if;
   perform (r->>'date')::date;
   perform private.validate_numeric(r,'weight',0,1000,false,true);perform private.validate_numeric(r,'sets',0,10000);perform private.validate_numeric(r,'reps',0,10000);
  end loop;
 end loop;
 foreach key in array array['visits','sessions'] loop
  seen:='{}';
  for r in select value from jsonb_array_elements(db->key) loop
   if r->>'id' is null or r->>'id'=any(seen) or r->>'personId' is null or not(r->>'personId'=any(ids)) then raise exception 'Invalid legacy reference' using errcode='22023';end if;
   seen:=array_append(seen,r->>'id');
   if key='visits' then if r->>'date' is null then raise exception 'Missing date' using errcode='22023';end if;perform (r->>'date')::date;
   elsif r->>'status' is null or r->>'status' not in ('open','closed') then raise exception 'Invalid legacy session' using errcode='22023';end if;
  end loop;
 end loop;
end $$;
do $$ declare definition text;begin
 select pg_get_functiondef('public.import_legacy_v6(uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'src:=source_text::jsonb;','src:=source_text::jsonb; perform private.validate_legacy_source(src);');
 execute definition;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
