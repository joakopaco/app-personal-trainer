do $$ declare definition text;begin
 select pg_get_functiondef('private.apply_programming_mutation(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'kind in (''mark_absent'',''reschedule_visit'')','kind in (''mark_absent'',''reschedule_visit'',''cancel_visit'')');
 definition:=replace(definition,'case when kind=''mark_absent'' then ''absent'' else ''rescheduled'' end','case when kind=''mark_absent'' then ''absent'' when kind=''cancel_visit'' then ''cancelled'' else ''rescheduled'' end');
 execute definition;
end $$;
