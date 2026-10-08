-- The skipped-result migration wrapped numeric validation, so the original
-- progression patch did not match its adjustment block. Patch only that block;
-- observed/corrected results must still supply their own required measurements.
do $$
declare definition text; target text; start_at integer; block_length integer;
 adjustment text; patched text;
begin
 foreach target in array array['private.apply_live_mutation(jsonb)','private.apply_historical_mutation(jsonb)'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  start_at:=strpos(definition,'rx:=private.adjust_progression(rx,field,val);');
  if start_at=0 then raise exception 'Missing progression adjustment in %',target;end if;
  block_length:=strpos(substr(definition,start_at),'set_count:=')-1;
  if block_length<1 then raise exception 'Missing adjustment boundary in %',target;end if;
  adjustment:=substr(definition,start_at,block_length);
  patched:=replace(adjustment,
   'private.validate_numeric(rx,''weight'',0,1000,i.type<>''load_reps'',true)',
   'private.validate_numeric(rx,''weight'',0,1000,i.type<>''load_reps'' or rx ? ''progression'',true)');
  patched:=replace(patched,
   'private.validate_numeric(rx,''reps'',1,500,i.type=''time'')',
   'private.validate_numeric(rx,''reps'',1,500,i.type=''time'' or rx ? ''progression'')');
  if patched=adjustment then raise exception 'Expected adjustment validators missing in %',target;end if;
  execute overlay(definition placing patched from start_at for block_length);
 end loop;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
