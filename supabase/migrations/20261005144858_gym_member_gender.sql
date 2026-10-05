-- Preserve existing provisioning reservations and private operator checks.
create or replace function public.gym_provision_begin(actor uuid,request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(request->>'operationId')::uuid; a public.gym_accounts; r private.gym_provision_requests; found_user uuid; lease_token uuid:=gen_random_uuid();
begin
 if request->>'action'='create_gym' then
  if not private.platform_actor_ready(actor) then raise exception 'Forbidden' using errcode='42501'; end if;
 elsif request->>'action'='create_member' then
  select * into a from public.gym_accounts where user_id=actor;
  if not coalesce(private.gym_actor_admin(actor,a.gym_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 else raise exception 'Invalid action' using errcode='22023'; end if;
 if op is null or length(trim(request->>'name')) not between 1 and 120 or request->>'name' is null or request->>'email' is null or length(request->>'email')>254 or request->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid details' using errcode='22023'; end if;
 if request->>'action'='create_member' and request ? 'gender' and (request->>'gender' is null or request->>'gender' not in ('male','female','unspecified')) then raise exception 'Invalid gender' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(request->>'email'),1));
 select * into r from private.gym_provision_requests where id=op for update;
 if found then
  if r.actor_id<>actor or r.request<>request then raise exception 'Operation reused' using errcode='22023'; end if;
  if r.user_id is not null then return jsonb_build_object('userId',r.user_id,'gymId',r.gym_id,'complete',true); end if;
  if r.lease_until>now() then raise exception 'Creation in progress. Retry shortly.' using errcode='40001'; end if;
 else
  insert into private.gym_provision_requests(id,actor_id,request) values(op,actor,request);
 end if;
 select id into found_user from auth.users where lower(email)=lower(request->>'email');
 if found_user is not null and not exists(select 1 from auth.users where id=found_user and raw_app_meta_data->>'gym_provision_id'=op::text and raw_app_meta_data->>'gym_account'='true') then raise exception 'Email already has an account' using errcode='23505'; end if;
 update private.gym_provision_requests set lease_until=now()+interval '2 minutes',token=lease_token where id=op;
 return jsonb_build_object('token',lease_token,'userId',found_user,'complete',false);
end $$;

create or replace function public.gym_provision_finish(actor uuid,operation uuid,lease uuid,password_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.gym_provision_requests; a public.gym_accounts; u uuid; g uuid;
begin
 select * into r from private.gym_provision_requests where id=operation and actor_id=actor and token=lease for update;
 if not found or r.user_id is not null or r.lease_until<now() then raise exception 'Invalid creation' using errcode='40001'; end if;
 select id into u from auth.users where raw_app_meta_data->>'gym_provision_id'=operation::text and raw_app_meta_data->>'gym_account'='true' and lower(email)=lower(r.request->>'email');
 if u is null then raise exception 'Missing identity' using errcode='22023'; end if;
 if r.request->>'action'='create_gym' then
  if not private.platform_actor_ready(actor) then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.gyms(name) values(trim(r.request->>'name')) returning id into g;
 else
  select * into a from public.gym_accounts where user_id=actor;
  if not coalesce(private.gym_actor_admin(actor,a.gym_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
  g:=a.gym_id;
 end if;
 insert into public.gym_accounts(user_id,gym_id,role,name,email,gender,temporary_hash) values(u,g,case when r.request->>'action'='create_gym' then 'admin' else 'member' end,trim(r.request->>'name'),lower(r.request->>'email'),coalesce(r.request->>'gender','unspecified'),password_hash);
 update private.gym_provision_requests set user_id=u,gym_id=g,lease_until=null,token=null where id=operation;
 insert into public.gym_audit(gym_id,actor_id,member_id,action) values(g,actor,case when a.user_id is not null then u end,r.request->>'action');
 return jsonb_build_object('userId',u,'gymId',g);
end $$;

