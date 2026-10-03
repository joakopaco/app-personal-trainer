-- An unperformed set has no measured result. Keep this contract identical for
-- live execution and reviewed historical recovery.
do $$
declare definition text; target text; validation text := 'perform private.validate_numeric(rx,''weight'',0,1000,i.type<>''load_reps'',true);perform private.validate_numeric(rx,''reps'',1,500,i.type=''time'');perform private.validate_numeric(rx,''durationSec'',1,86400,i.type<>''time'');';
begin
 foreach target in array array['private.apply_live_mutation(jsonb)','private.apply_historical_mutation(jsonb)'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  if position(validation in definition)=0 then raise exception 'Expected numeric validator missing in %',target;end if;
  definition:=replace(definition,validation,
   'if kind=''record_set'' and p->>''state''=''skipped'' then rx:=jsonb_build_object(''weight'',null,''reps'',null,''durationSec'',null);else '||validation||' end if;');
  execute definition;
 end loop;
end $$;
