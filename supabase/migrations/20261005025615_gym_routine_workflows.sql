revoke select on public.gym_routines from authenticated;
grant select(id,gym_id,kind,member_id,name,revision,published_revision_id,retired,created_at,updated_at) on public.gym_routines to authenticated;
drop policy routine_read on public.gym_routines;
create policy routine_read on public.gym_routines for select to authenticated using(
 public.gym_can_read(gym_id) or (kind='own' and public.gym_can_read(gym_id,member_id))
 or (published_revision_id is not null and not retired and ((kind='catalog' and public.gym_can_view_catalog(gym_id)) or public.gym_can_read(gym_id,member_id)))
);
drop policy revision_read on public.gym_routine_revisions;
create policy revision_read on public.gym_routine_revisions for select to authenticated using(
 exists(select 1 from public.gym_routines r where r.id=routine_id)
 or exists(select 1 from public.gym_accounts a where a.selected_revision_id=id and a.user_id=auth.uid() and public.gym_can_read(a.gym_id,a.user_id))
 or exists(select 1 from public.gym_sessions s where s.routine_revision_id=id and public.gym_can_read(s.gym_id,s.member_id))
);

create function public.gym_edit_routine(routine_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.gym_accounts; r public.gym_routines;
begin
 select * into a from public.gym_accounts where user_id=auth.uid();
 select * into r from public.gym_routines where id=routine_id and gym_id=a.gym_id;
 if not coalesce(private.gym_account_ready(a),false) or r.id is null or not ((a.role='admin' and r.kind<>'own') or (a.role='member' and r.kind='own' and r.member_id=a.user_id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 return to_jsonb(r)||jsonb_build_object('document',coalesce(r.draft,(select document from public.gym_routine_revisions where id=r.published_revision_id)));
end $$;
revoke all on function public.gym_edit_routine(uuid) from public,anon;
grant execute on function public.gym_edit_routine(uuid) to authenticated;

create function private.gym_validate_results(day jsonb,results jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb; item_set jsonb; position jsonb; seen text[]:='{}';
begin
 if jsonb_typeof(results) is distinct from 'array' or jsonb_array_length(results)>1500 then raise exception 'Invalid results' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(results) loop
  select e into position from jsonb_array_elements(day->'blocks') b cross join lateral jsonb_array_elements(b->'exercises') e where e->>'id'=item->>'positionId';
  if position is null or item->>'positionId'=any(seen) or jsonb_typeof(item->'skipped') is distinct from 'boolean' or jsonb_typeof(item->'sets') is distinct from 'array' or jsonb_array_length(item->'sets')>50 then raise exception 'Invalid result position' using errcode='22023'; end if;
  seen:=array_append(seen,item->>'positionId');
  for item_set in select value from jsonb_array_elements(item->'sets') loop
   if jsonb_typeof(item_set->'confirmed') is distinct from 'boolean' then raise exception 'Invalid confirmation' using errcode='22023'; end if;
   perform private.validate_numeric(item_set,'weight',0,1000,not (item_set->>'confirmed')::boolean or position->>'type'<>'load_reps',true);
   perform private.validate_numeric(item_set,'reps',1,500,not (item_set->>'confirmed')::boolean or position->>'type'='time');
   perform private.validate_numeric(item_set,'durationSec',1,86400,not (item_set->>'confirmed')::boolean or position->>'type'<>'time');
  end loop;
 end loop;
end $$;

create function private.gym_apply(a public.gym_accounts,k text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r public.gym_routines; rr public.gym_routine_revisions; s public.gym_sessions;
 target uuid; new_id uuid; doc jsonb; w integer; d integer; result jsonb;
begin
 if k='save_routine' then
  perform private.validate_routine(p->'document',false);
  if p->>'id' is null then
   if (a.role='member' and p->>'kind' is distinct from 'own') or (a.role='admin' and (p->>'kind' is null or p->>'kind' not in ('catalog','personal'))) then raise exception 'Forbidden' using errcode='42501'; end if;
   target:=case when a.role='member' then a.user_id when p->>'kind'='personal' then (p->>'memberId')::uuid end;
   if p->>'kind'<>'catalog' and not exists(select 1 from public.gym_accounts where user_id=target and gym_id=a.gym_id and role='member') then raise exception 'Forbidden' using errcode='42501'; end if;
   insert into public.gym_routines(gym_id,kind,member_id,name,draft) values(a.gym_id,p->>'kind',target,p->'document'->>'name',p->'document') returning * into r;
   return jsonb_build_object('id',r.id,'revision',r.revision);
  end if;
 end if;
 if k in ('save_routine','publish_routine','discard_routine','retire_routine') then
  select * into r from public.gym_routines where id=(p->>'id')::uuid and gym_id=a.gym_id for update;
  if r.id is null or not ((a.role='admin' and r.kind<>'own') or (a.role='member' and r.kind='own' and r.member_id=a.user_id)) then raise exception 'Forbidden' using errcode='42501'; end if;
  if (p->>'expectedRevision')::integer is distinct from r.revision then raise exception 'Routine changed' using errcode='40001'; end if;
  if k='save_routine' then
   update public.gym_routines set draft=p->'document',revision=revision+1,updated_at=now() where id=r.id;
  elsif k='publish_routine' then
   perform private.validate_routine(r.draft,true);
   insert into public.gym_routine_revisions(gym_id,routine_id,document) values(a.gym_id,r.id,r.draft) returning id into new_id;
   update public.gym_routines set published_revision_id=new_id,name=r.draft->>'name',draft=null,retired=false,revision=revision+1,updated_at=now() where id=r.id;
  elsif k='discard_routine' then
   if r.published_revision_id is null then delete from public.gym_routines where id=r.id;
   else update public.gym_routines set draft=null,revision=revision+1,updated_at=now() where id=r.id; end if;
  else
   update public.gym_routines set retired=true,revision=revision+1,updated_at=now() where id=r.id;
  end if;
  return jsonb_build_object('id',r.id,'revision',r.revision+1,'publishedRevisionId',new_id);
 elsif k='select_routine' then
  if a.role<>'member' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into rr from public.gym_routine_revisions where id=(p->>'revisionId')::uuid and gym_id=a.gym_id;
  select * into r from public.gym_routines where id=rr.routine_id and published_revision_id=rr.id and not retired;
  if r.id is null or not (r.kind='catalog' or r.member_id=a.user_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.gym_accounts set selected_revision_id=rr.id where user_id=a.user_id;
  return jsonb_build_object('id',rr.id);
 elsif k='start_session' then
  if a.role<>'member' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into s from public.gym_sessions where member_id=a.user_id and status='open';
  if found then return jsonb_build_object('id',s.id,'revision',s.revision); end if;
  select selected_revision_id into new_id from public.gym_accounts where user_id=a.user_id;
  select * into rr from public.gym_routine_revisions where id=new_id and gym_id=a.gym_id;
  select * into r from public.gym_routines where id=rr.routine_id and not retired;
  if r.id is null or not (r.kind='catalog' or r.member_id=a.user_id) then raise exception 'Select an available routine' using errcode='22023'; end if;
  w:=(p->>'week')::integer; d:=(p->>'day')::integer;
  if w is null or d is null or w not between 0 and 3 or d<0 or d>=jsonb_array_length(rr.document->'weeks'->w) then raise exception 'Invalid day' using errcode='22023'; end if;
  insert into public.gym_sessions(gym_id,member_id,routine_revision_id,routine_name,week,day) values(a.gym_id,a.user_id,rr.id,rr.document->>'name',w,rr.document->'weeks'->w->d) returning * into s;
  return jsonb_build_object('id',s.id,'revision',s.revision);
 elsif k in ('save_session','finish_session') then
  select * into s from public.gym_sessions where id=(p->>'id')::uuid and gym_id=a.gym_id and member_id=a.user_id and a.role='member' for update;
  if s.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if s.status<>'open' or (p->>'expectedRevision')::integer is distinct from s.revision then raise exception 'Session changed' using errcode='40001'; end if;
  perform private.gym_validate_results(s.day,p->'results');
  update public.gym_sessions set results=p->'results',revision=revision+1,status=case when k='finish_session' then 'finished' else 'open' end,finished_at=case when k='finish_session' then now() end where id=s.id;
  return jsonb_build_object('id',s.id,'revision',s.revision+1);
 elsif k='update_gym' and a.role='admin' then
  update public.gyms set name=trim(p->>'name') where id=a.gym_id;
  return jsonb_build_object('id',a.gym_id);
 elsif k='update_member' and a.role='admin' then
  select user_id into target from public.gym_accounts where user_id=(p->>'userId')::uuid and gym_id=a.gym_id and role='member' for update;
  if target is null then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.gym_accounts set name=trim(p->>'name'),gender=p->>'gender' where user_id=target;
  insert into public.gym_member_notes(gym_id,member_id,notes) values(a.gym_id,target,coalesce(p->>'notes','')) on conflict(member_id) do update set notes=excluded.notes;
  return jsonb_build_object('id',target);
 elsif k='set_member_active' and a.role='admin' then
  if jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception 'Invalid state' using errcode='22023'; end if;
  update public.gym_accounts set active=(p->>'active')::boolean where user_id=(p->>'userId')::uuid and gym_id=a.gym_id and role='member' returning user_id into target;
  if target is null then raise exception 'Forbidden' using errcode='42501'; end if;
  return jsonb_build_object('id',target);
 end if;
 raise exception 'Invalid action' using errcode='22023';
end $$;

create or replace function public.gym_command(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.gym_accounts; p jsonb:=command->'payload'; k text:=command->>'kind'; op uuid:=(command->>'operationId')::uuid; receipt private.gym_receipts; result jsonb; target uuid;
begin
 select * into a from public.gym_accounts where user_id=auth.uid();
 if a.user_id is null or not private.gym_account_ready(a) then raise exception 'Forbidden' using errcode='42501'; end if;
 if op is null or jsonb_typeof(p) is distinct from 'object' or pg_column_size(command)>2000000 then raise exception 'Invalid command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
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
