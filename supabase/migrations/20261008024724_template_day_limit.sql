-- Validate new template writes without changing existing templates or receipts.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.save_library_entry(jsonb)'::regprocedure) into definition;
 if position('elsif kind=''template'' then' in definition)=0 then raise exception 'Missing template branch';end if;
 definition:=replace(definition,'elsif kind=''template'' then',
  'elsif kind=''template'' then
   if exists(select 1 from jsonb_array_elements(p->''document''->''weeks'') week where jsonb_array_length(week)>6) then
    raise exception ''Templates support at most 6 days per week'' using errcode=''22023'';
   end if;');
 execute definition;
end $$;
