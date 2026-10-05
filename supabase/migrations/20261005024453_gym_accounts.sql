-- Independent gym tenancy. Existing personal-trainer data and ownership stay intact.
create table public.platform_operators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
create table public.gyms (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.gym_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 gym_id uuid not null references public.gyms(id) on delete cascade,
 role text not null check(role in ('admin','member')),
 name text not null check(length(trim(name)) between 1 and 120), email text not null,
 gender text not null default 'unspecified' check(gender in ('male','female','unspecified')),
 active boolean not null default true, must_change_password boolean not null default true,
 access_after timestamptz not null default '-infinity', credential_version integer not null default 1,
 temporary_hash text, selected_revision_id uuid, created_at timestamptz not null default now(),
 unique(gym_id,user_id)
);
create unique index gym_one_admin on public.gym_accounts(gym_id) where role='admin';
create table public.gym_member_notes (
 gym_id uuid not null, member_id uuid primary key, notes text not null default '' check(length(notes)<=4000),
 foreign key(gym_id,member_id) references public.gym_accounts(gym_id,user_id) on delete cascade
);
create table public.gym_routines (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id) on delete cascade,
 kind text not null check(kind in ('catalog','personal','own')), member_id uuid,
 name text not null check(length(trim(name)) between 1 and 120), draft jsonb,
 revision integer not null default 1, published_revision_id uuid, retired boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='catalog' and member_id is null) or (kind<>'catalog' and member_id is not null)),
 unique(gym_id,id), foreign key(gym_id,member_id) references public.gym_accounts(gym_id,user_id) on delete cascade
);
create unique index gym_one_own_routine on public.gym_routines(member_id) where kind='own';
create index gym_routines_tenant on public.gym_routines(gym_id,member_id);
create table public.gym_routine_revisions (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, routine_id uuid not null,
 document jsonb not null, created_at timestamptz not null default now(),
 unique(gym_id,id), foreign key(gym_id,routine_id) references public.gym_routines(gym_id,id) on delete cascade
);
create index gym_revision_routine on public.gym_routine_revisions(routine_id);
alter table public.gym_routines add foreign key(gym_id,published_revision_id) references public.gym_routine_revisions(gym_id,id) deferrable initially deferred;
alter table public.gym_accounts add foreign key(gym_id,selected_revision_id) references public.gym_routine_revisions(gym_id,id) deferrable initially deferred;
create table public.gym_sessions (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, member_id uuid not null,
 routine_revision_id uuid not null, routine_name text not null, week integer not null check(week between 0 and 3),
 day jsonb not null, results jsonb not null default '[]', revision integer not null default 1,
 status text not null default 'open' check(status in ('open','finished')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 foreign key(gym_id,member_id) references public.gym_accounts(gym_id,user_id) on delete cascade,
 foreign key(gym_id,routine_revision_id) references public.gym_routine_revisions(gym_id,id),
 check((status='open' and finished_at is null) or (status='finished' and finished_at is not null))
);
create unique index gym_one_open_session on public.gym_sessions(member_id) where status='open';
create index gym_session_history on public.gym_sessions(gym_id,member_id,started_at desc);
create table public.gym_audit (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id) on delete cascade,
 actor_id uuid, member_id uuid, action text not null, created_at timestamptz not null default now()
);
create index gym_audit_tenant on public.gym_audit(gym_id,member_id,created_at desc);
create table private.gym_receipts (
 actor_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
 command jsonb not null, result jsonb not null, primary key(actor_id,operation_id)
);
alter table private.gym_receipts enable row level security;

create function public.is_platform_operator() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.platform_operators where user_id=auth.uid() and active);
$$;
revoke all on function public.is_platform_operator() from public,anon;
grant execute on function public.is_platform_operator() to authenticated;

create function private.gym_account_ready(a public.gym_accounts) returns boolean language sql stable security definer set search_path='' as $$
 select a.user_id=auth.uid() and a.active and not a.must_change_password
 and exists(select 1 from public.gyms g where g.id=a.gym_id and g.active)
 and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=a.user_id and s.created_at>=a.access_after);
$$;
create function public.gym_can_read(tenant uuid,member uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gym_accounts a where a.user_id=auth.uid() and a.gym_id=tenant
 and private.gym_account_ready(a) and (a.role='admin' or member=a.user_id));
$$;
create function public.gym_can_view_catalog(tenant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gym_accounts a where a.user_id=auth.uid() and a.gym_id=tenant and private.gym_account_ready(a));
$$;
revoke all on function public.gym_can_read(uuid,uuid),public.gym_can_view_catalog(uuid) from public,anon;
grant execute on function public.gym_can_read(uuid,uuid),public.gym_can_view_catalog(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['platform_operators','gyms','gym_accounts','gym_member_notes','gym_routines','gym_routine_revisions','gym_sessions','gym_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.gyms,public.gym_member_notes,public.gym_routines,public.gym_routine_revisions,public.gym_sessions,public.gym_audit to authenticated;
-- Credential hashes and access thresholds are never returned by the Data API.
grant select(user_id,gym_id,role,name,email,gender,active,must_change_password,selected_revision_id,created_at) on public.gym_accounts to authenticated;
create policy gym_read on public.gyms for select to authenticated using(public.gym_can_view_catalog(id) or public.is_platform_operator());
create policy account_read on public.gym_accounts for select to authenticated using(public.gym_can_read(gym_id,user_id) or (role='admin' and public.is_platform_operator()));
create policy notes_read on public.gym_member_notes for select to authenticated using(public.gym_can_read(gym_id));
create policy routine_read on public.gym_routines for select to authenticated using(public.gym_can_read(gym_id,member_id) or (kind='catalog' and published_revision_id is not null and not retired and public.gym_can_view_catalog(gym_id)));
create policy revision_read on public.gym_routine_revisions for select to authenticated using(exists(select 1 from public.gym_routines r where r.id=routine_id and (public.gym_can_read(r.gym_id,r.member_id) or (r.kind='catalog' and public.gym_can_view_catalog(r.gym_id)))));
create policy session_read on public.gym_sessions for select to authenticated using(public.gym_can_read(gym_id,member_id));
create policy audit_read on public.gym_audit for select to authenticated using(public.gym_can_read(gym_id,member_id));

create function public.gym_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.gym_accounts; g public.gyms; expired boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into a from public.gym_accounts where user_id=auth.uid();
 if not found then
  if exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'gym_account'='true') then
   return jsonb_build_object('mode','pending','blocked',true);
  end if;
  return jsonb_build_object('mode','trainer','operator',public.is_platform_operator());
 end if;
 select * into g from public.gyms where id=a.gym_id;
 expired:=not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=a.user_id and s.created_at>=a.access_after);
 return jsonb_build_object('mode',a.role,'gymId',a.gym_id,'gymName',g.name,'userId',a.user_id,'name',a.name,'gender',a.gender,'email',a.email,'selectedRevisionId',a.selected_revision_id,
  'mustChangePassword',a.must_change_password,'blocked',not a.active or not g.active or expired,'operator',public.is_platform_operator());
end $$;
revoke all on function public.gym_access() from public,anon;
grant execute on function public.gym_access() to authenticated;

-- Guard only new gym identities; trainer bootstrap body and semantics are unchanged.
create or replace function public.ensure_workspace() returns public.workspaces language plpgsql security definer set search_path='' as $$
declare w public.workspaces;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Authentication required' using errcode='42501'; end if;
 if exists(select 1 from public.gym_accounts where user_id=auth.uid()) or exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'gym_account'='true') then raise exception 'Gym account' using errcode='42501'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.workspaces(owner_user_id) values(auth.uid()) on conflict do nothing;
 select * into w from public.workspaces where owner_user_id=auth.uid(); return w;
end $$;

create function public.gym_command(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.gym_accounts; target public.gym_accounts; p jsonb:=command->'payload'; k text:=command->>'kind';
 op uuid:=(command->>'operationId')::uuid; receipt private.gym_receipts; result jsonb;
begin
 select * into a from public.gym_accounts where user_id=auth.uid();
 if a.user_id is null or not private.gym_account_ready(a) then raise exception 'Forbidden' using errcode='42501'; end if;
 if op is null or jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into receipt from private.gym_receipts where actor_id=auth.uid() and operation_id=op;
 if found then
  if receipt.command<>command then raise exception 'Operation reused' using errcode='22023'; end if;
  return receipt.result;
 end if;
 if k='set_member_active' then
  select * into target from public.gym_accounts where user_id=(p->>'userId')::uuid and gym_id=a.gym_id and role='member' for update;
  if a.role<>'admin' or target.user_id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception 'Invalid state' using errcode='22023'; end if;
  update public.gym_accounts set active=(p->>'active')::boolean where user_id=target.user_id;
  result:=jsonb_build_object('id',target.user_id);
 else
  raise exception 'Unknown command' using errcode='22023';
 end if;
 insert into public.gym_audit(gym_id,actor_id,member_id,action) values(a.gym_id,a.user_id,target.user_id,k);
 insert into private.gym_receipts values(a.user_id,op,command,result);
 return result;
end $$;
revoke all on function public.gym_command(jsonb) from public,anon;
grant execute on function public.gym_command(jsonb) to authenticated;
