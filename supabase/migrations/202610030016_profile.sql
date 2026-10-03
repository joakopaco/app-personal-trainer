-- A trainer can edit only their own display name. No caller-supplied user id.
create or replace function public.update_my_profile(p_display_name text)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 100 then
    raise exception 'INVALID_NAME';
  end if;
  insert into public.profiles(id, display_name)
    values (auth.uid(), btrim(p_display_name))
    on conflict (id) do update set display_name = excluded.display_name
    returning * into result;
  return result;
end;
$$;
revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;
