-- Qualify outer objects.name: unqualified name binds to workspaces.name.
drop policy media_read on storage.objects;
drop policy media_insert on storage.objects;
drop policy media_delete on storage.objects;
create policy media_read on storage.objects for select to authenticated using(bucket_id='exercise-media' and exists(select 1 from public.workspaces w where w.id::text=(storage.foldername(storage.objects.name))[1] and w.owner_user_id=auth.uid()));
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='exercise-media' and exists(select 1 from public.workspaces w where w.id::text=(storage.foldername(storage.objects.name))[1] and w.owner_user_id=auth.uid()));
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='exercise-media' and exists(select 1 from public.workspaces w where w.id::text=(storage.foldername(storage.objects.name))[1] and w.owner_user_id=auth.uid()));
