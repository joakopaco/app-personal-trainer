alter table public.gym_routines add column has_draft boolean generated always as (draft is not null) stored;
grant select(has_draft) on public.gym_routines to authenticated;
create index gym_accounts_selection on public.gym_accounts(gym_id,selected_revision_id);
create index gym_routines_publication on public.gym_routines(gym_id,published_revision_id);
create index gym_sessions_revision on public.gym_sessions(gym_id,routine_revision_id);

drop policy revision_read on public.gym_routine_revisions;
create policy revision_read on public.gym_routine_revisions for select to authenticated using(
 exists(select 1 from public.gym_routines r where r.id=gym_routine_revisions.routine_id)
 or exists(select 1 from public.gym_accounts a where a.selected_revision_id=gym_routine_revisions.id and a.user_id=auth.uid() and public.gym_can_read(a.gym_id,a.user_id))
 or exists(select 1 from public.gym_sessions s where s.routine_revision_id=gym_routine_revisions.id and public.gym_can_read(s.gym_id,s.member_id))
);
create or replace function public.gym_credentials_begin(actor uuid,target_id uuid,reset boolean,password_hash text) returns uuid language plpgsql security definer set search_path='' as $$
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
 credential_version=credential_version+1,access_after=clock_timestamp() where user_id=target_id;
 return job;
end $$;
create or replace function public.gym_command(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.gym_accounts; p jsonb:=command->'payload'; k text:=command->>'kind'; op uuid:=(command->>'operationId')::uuid; receipt private.gym_receipts; result jsonb; target uuid;
begin
 select * into a from public.gym_accounts where user_id=auth.uid();
 if a.user_id is null or not private.gym_account_ready(a) then raise exception 'Forbidden' using errcode='42501'; end if;
 if op is null or jsonb_typeof(p) is distinct from 'object' or pg_column_size(command)>2000000 then raise exception 'Invalid command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into a from public.gym_accounts where user_id=auth.uid() for share;
 perform 1 from public.gyms where id=a.gym_id for share;
 if not private.gym_account_ready(a) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into receipt from private.gym_receipts where actor_id=auth.uid() and operation_id=op;
 if found then
  if receipt.command<>command then raise exception 'Operation reused' using errcode='22023'; end if;
  return receipt.result;
 end if;
 result:=private.gym_apply(a,k,p);
 target:=case when a.role='member' then a.user_id when k in ('update_member','set_member_active') then (p->>'userId')::uuid else (select member_id from public.gym_routines where id=(result->>'id')::uuid and gym_id=a.gym_id) end;
 insert into public.gym_audit(gym_id,actor_id,member_id,action) values(a.gym_id,a.user_id,target,k);
 insert into private.gym_receipts values(a.user_id,op,command,result);
 return result;
end $$;
