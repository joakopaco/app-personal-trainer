-- Dedicated operator identities; never promote a customer account.
alter table public.platform_operators add column username text;
update public.platform_operators set username='operator_'||replace(user_id::text,'-','');
alter table public.platform_operators alter column username set not null;
alter table public.platform_operators add constraint operator_username check(username ~ '^[A-Za-z0-9_]{3,48}$');
create unique index platform_operator_username on public.platform_operators(lower(username));
alter table public.platform_operators add column must_change_password boolean not null default true;
alter table public.platform_operators add column access_after timestamptz not null default clock_timestamp();

create function private.exclusive_operator_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=coalesce(to_jsonb(new)->>'owner_user_id',to_jsonb(new)->>'user_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('identity:'||target::text,0));
 if tg_table_name='platform_operators' then
  if exists(select 1 from public.workspaces where owner_user_id=target) or exists(select 1 from public.gym_accounts where user_id=target) then
   raise exception 'Customer identities cannot be operators' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.active is distinct from old.active or new.must_change_password is distinct from old.must_change_password) then new.access_after:=clock_timestamp(); end if;
 else
  if exists(select 1 from public.platform_operators where user_id=target) or exists(select 1 from auth.users where id=target and raw_app_meta_data->>'platform_operator'='true') then
   raise exception 'Operator identity is exclusive' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.exclusive_operator_identity() from public,anon,authenticated;
create trigger operator_identity before insert or update on public.platform_operators for each row execute function private.exclusive_operator_identity();
create trigger workspace_operator_identity before insert or update of owner_user_id on public.workspaces for each row execute function private.exclusive_operator_identity();
create trigger gym_operator_identity before insert or update of user_id on public.gym_accounts for each row execute function private.exclusive_operator_identity();
-- Fail safely rather than silently converting any previously assigned customer.
do $$ begin
 if exists(select 1 from public.platform_operators o where exists(select 1 from public.workspaces w where w.owner_user_id=o.user_id) or exists(select 1 from public.gym_accounts a where a.user_id=o.user_id)) then raise exception 'Existing mixed operator identity requires explicit review'; end if;
end $$;

create function private.operator_password_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update public.platform_operators set must_change_password=false,access_after=clock_timestamp() where user_id=new.id;
 end if;
 return new;
end $$;
revoke all on function private.operator_password_changed() from public,anon,authenticated;
create trigger operator_password_changed after update of encrypted_password on auth.users for each row execute function private.operator_password_changed();

create function private.platform_actor_ready(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_operators where user_id=actor and active and not must_change_password)
 and not exists(select 1 from public.workspaces where owner_user_id=actor)
 and not exists(select 1 from public.gym_accounts where user_id=actor);
$$;
revoke all on function private.platform_actor_ready(uuid) from public,anon,authenticated;
create or replace function public.is_platform_operator() returns boolean language sql stable security definer set search_path='' as $$
 select private.platform_actor_ready(auth.uid()) and exists(
 select 1 from auth.sessions s join public.platform_operators o on o.user_id=s.user_id
 where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and s.created_at>=o.access_after);
$$;
create function public.platform_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('username',o.username,'mustChangePassword',o.must_change_password,'ready',public.is_platform_operator())
 from public.platform_operators o join auth.sessions s on s.user_id=o.user_id
 where o.user_id=auth.uid() and o.active and s.id::text=auth.jwt()->>'session_id' and s.created_at>=o.access_after;
$$;
revoke all on function public.platform_access() from public,anon;
grant execute on function public.platform_access() to authenticated;
-- Existing service-only APIs now also require completion of the operator password gate.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('gym_provision_begin','gym_provision_finish','gym_credentials_begin','gym_set_active') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'exists(select 1 from public.platform_operators where user_id=actor and active)','private.platform_actor_ready(actor)');
  execute definition;
 end loop;
end $$;

create table private.platform_login_limits(key text primary key, window_start timestamptz not null, attempts integer not null);
alter table private.platform_login_limits enable row level security;
revoke all on private.platform_login_limits from public,anon,authenticated;
create function public.platform_login_target(login_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.platform_operators; k text; attempts integer; limit_count integer; now_time timestamptz:=clock_timestamp();
begin
 select * into op from public.platform_operators where lower(username)=lower(trim(login_name));
 -- One unknown bucket prevents unlimited rows from arbitrary usernames.
 foreach k in array array['global',coalesce(op.user_id::text,'unknown')] loop
  limit_count:=case when k='global' then 100 else 10 end;
  insert into private.platform_login_limits as limits values(k,now_time,1)
  on conflict(key) do update set
   attempts=case when limits.window_start<now_time-interval '5 minutes' then 1 else limits.attempts+1 end,
   window_start=case when limits.window_start<now_time-interval '5 minutes' then now_time else limits.window_start end
  returning limits.attempts into attempts;
  if attempts>limit_count then return jsonb_build_object('limited',true); end if;
 end loop;
 if op.user_id is null or not op.active then return jsonb_build_object('limited',false); end if;
 return jsonb_build_object('limited',false,'email',(select email from auth.users where id=op.user_id),'userId',op.user_id);
end $$;
revoke all on function public.platform_login_target(text) from public,anon,authenticated;
grant execute on function public.platform_login_target(text) to service_role;
