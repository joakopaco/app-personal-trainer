create table private.gym_provision_requests (
 id uuid primary key, actor_id uuid not null references auth.users(id) on delete cascade,
 request jsonb not null, user_id uuid, gym_id uuid, lease_until timestamptz, token uuid,
 created_at timestamptz not null default now()
);
alter table private.gym_provision_requests enable row level security;
alter table public.gym_accounts add column credential_job uuid;
alter table public.gym_accounts add column credential_job_until timestamptz;

create function private.gym_actor_admin(actor uuid,tenant uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.gym_accounts a join public.gyms g on g.id=a.gym_id where a.user_id=actor and a.gym_id=tenant and a.role='admin' and a.active and g.active and not a.must_change_password and a.credential_job is null);
$$;
create or replace function private.gym_account_ready(a public.gym_accounts) returns boolean language sql stable security definer set search_path='' as $$
 select a.user_id=auth.uid() and a.active and not a.must_change_password and a.credential_job is null
 and exists(select 1 from public.gyms g where g.id=a.gym_id and g.active)
 and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=a.user_id and s.created_at>=a.access_after);
$$;

-- Server-only endpoints. Auth Admin calls are authenticated separately by the Edge Function.
create function public.gym_provision_begin(actor uuid,request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(request->>'operationId')::uuid; a public.gym_accounts; r private.gym_provision_requests; found_user uuid; lease_token uuid:=gen_random_uuid();
begin
 if request->>'action'='create_gym' then
  if not exists(select 1 from public.platform_operators where user_id=actor and active) then raise exception 'Forbidden' using errcode='42501'; end if;
 elsif request->>'action'='create_member' then
  select * into a from public.gym_accounts where user_id=actor;
  if not coalesce(private.gym_actor_admin(actor,a.gym_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 else raise exception 'Invalid action' using errcode='22023'; end if;
 if op is null or length(trim(request->>'name')) not between 1 and 120 or request->>'name' is null or request->>'email' is null or length(request->>'email')>254 or request->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid details' using errcode='22023'; end if;
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

create function public.gym_provision_finish(actor uuid,operation uuid,lease uuid,password_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.gym_provision_requests; a public.gym_accounts; u uuid; g uuid;
begin
 select * into r from private.gym_provision_requests where id=operation and actor_id=actor and token=lease for update;
 if not found or r.user_id is not null or r.lease_until<now() then raise exception 'Invalid creation' using errcode='40001'; end if;
 select id into u from auth.users where raw_app_meta_data->>'gym_provision_id'=operation::text and raw_app_meta_data->>'gym_account'='true' and lower(email)=lower(r.request->>'email');
 if u is null then raise exception 'Missing identity' using errcode='22023'; end if;
 if r.request->>'action'='create_gym' then
  if not exists(select 1 from public.platform_operators where user_id=actor and active) then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.gyms(name) values(trim(r.request->>'name')) returning id into g;
 else
  select * into a from public.gym_accounts where user_id=actor;
  if not coalesce(private.gym_actor_admin(actor,a.gym_id),false) then raise exception 'Forbidden' using errcode='42501'; end if;
  g:=a.gym_id;
 end if;
 insert into public.gym_accounts(user_id,gym_id,role,name,email,temporary_hash) values(u,g,case when r.request->>'action'='create_gym' then 'admin' else 'member' end,trim(r.request->>'name'),lower(r.request->>'email'),password_hash);
 update private.gym_provision_requests set user_id=u,gym_id=g,lease_until=null,token=null where id=operation;
 insert into public.gym_audit(gym_id,actor_id,member_id,action) values(g,actor,case when a.user_id is not null then u end,r.request->>'action');
 return jsonb_build_object('userId',u,'gymId',g);
end $$;

create function public.gym_provision_release(actor uuid,operation uuid,lease uuid) returns void language sql security definer set search_path='' as $$
 update private.gym_provision_requests set lease_until=null,token=null where id=operation and actor_id=actor and token=lease and user_id is null;
$$;

create function public.gym_credentials_begin(actor uuid,target_id uuid,reset boolean,password_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.gym_accounts; job uuid:=gen_random_uuid();
begin
 select * into a from public.gym_accounts where user_id=target_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if reset then
  if not ((a.role='admin' and exists(select 1 from public.platform_operators where user_id=actor and active)) or (a.role='member' and private.gym_actor_admin(actor,a.gym_id))) then raise exception 'Forbidden' using errcode='42501'; end if;
 elsif actor<>target_id or not a.active or not exists(select 1 from public.gyms where id=a.gym_id and active) then raise exception 'Forbidden' using errcode='42501';
 end if;
 if a.credential_job is not null and a.credential_job_until>now() then raise exception 'Password change in progress' using errcode='40001'; end if;
 if not reset and a.temporary_hash=password_hash then raise exception 'Choose a different password' using errcode='22023'; end if;
 update public.gym_accounts set credential_job=job,credential_job_until=now()+interval '2 minutes',must_change_password=true,
 credential_version=credential_version+1,access_after=case when reset then clock_timestamp() else access_after end where user_id=target_id;
 return job;
end $$;

create function public.gym_credentials_finish(actor uuid,target_id uuid,job uuid,reset boolean,password_hash text,succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.gym_accounts;
begin
 select * into a from public.gym_accounts where user_id=target_id and credential_job=job for update;
 if not found then raise exception 'Password changed concurrently' using errcode='40001'; end if;
 update public.gym_accounts set credential_job=null,credential_job_until=null,must_change_password=(reset or not succeeded),temporary_hash=case when succeeded and reset then password_hash when succeeded then null else temporary_hash end where user_id=target_id;
 insert into public.gym_audit(gym_id,actor_id,member_id,action) values(a.gym_id,actor,case when a.role='member' then a.user_id end,case when succeeded then case when reset then 'access_reset' else 'password_changed' end else 'password_change_failed' end);
end $$;

create function public.gym_set_active(actor uuid,tenant uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.platform_operators where user_id=actor and active) then raise exception 'Forbidden' using errcode='42501'; end if;
 update public.gyms set active=enabled where id=tenant;
 if not found then raise exception 'Gym missing' using errcode='22023'; end if;
 insert into public.gym_audit(gym_id,actor_id,action) values(tenant,actor,case when enabled then 'gym_reactivated' else 'gym_suspended' end);
end $$;

revoke all on function public.gym_provision_begin(uuid,jsonb), public.gym_provision_finish(uuid,uuid,uuid,text),public.gym_provision_release(uuid,uuid,uuid),public.gym_credentials_begin(uuid,uuid,boolean,text),public.gym_credentials_finish(uuid,uuid,uuid,boolean,text,boolean),public.gym_set_active(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gym_provision_begin(uuid,jsonb),public.gym_provision_finish(uuid,uuid,uuid,text),public.gym_provision_release(uuid,uuid,uuid),public.gym_credentials_begin(uuid,uuid,boolean,text),public.gym_credentials_finish(uuid,uuid,uuid,boolean,text,boolean),public.gym_set_active(uuid,uuid,boolean) to service_role;

