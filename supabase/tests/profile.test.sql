begin;
select plan(4);
select has_function('public','update_my_profile',array['text'],'profile mutation exists');
select ok(not has_function_privilege('anon','public.update_my_profile(text)','EXECUTE'),'anonymous cannot edit profiles');
select ok(not has_table_privilege('authenticated','public.profiles','UPDATE'),'direct cross-profile updates forbidden');
select ok(has_function_privilege('authenticated','public.update_my_profile(text)','EXECUTE'),'trainer can update own name through scoped RPC');
select * from finish();
rollback;
