-- Hardening: column-level update rights, timezone validation, invite-code rate limiting,
-- account deletion, and storage cleanup when posts/spaces are deleted.

-- ---------------------------------------------------------------------------
-- Members may only rename a space or set its anniversary. Changing `kind` would bypass the
-- couple limit, and a bad `timezone` breaks every date-based RPC for the space.
-- ---------------------------------------------------------------------------
revoke update on table public.spaces from anon, authenticated;
grant update (name, anniversary) on table public.spaces to authenticated;

-- Profiles: location only changes through set_location() (which rounds it).
revoke update on table public.profiles from anon, authenticated;
grant update (display_name, avatar, color, mood_emoji, mood_text, mood_updated_at, share_location)
  on table public.profiles to authenticated;

-- A reaction can't be moved onto a post in another space.
drop policy "change own reaction" on public.reactions;
create policy "change own reaction" on public.reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and is_member(p.space_id)));

create function public.valid_timezone(p_tz text) returns boolean
language plpgsql stable as $$
begin
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end $$;

create or replace function public.create_space(p_name text, p_kind text, p_timezone text default 'UTC')
returns public.spaces
language plpgsql security definer set search_path = public as $$
declare s spaces;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into spaces (name, kind, invite_code, timezone, created_by)
  values (
    p_name, p_kind, gen_invite_code(),
    case when coalesce(p_timezone, '') <> '' and valid_timezone(p_timezone) then p_timezone else 'UTC' end,
    auth.uid()
  )
  returning * into s;
  insert into space_members (space_id, user_id) values (s.id, auth.uid());
  return s;
end $$;

-- A space outlives its creator's account (the partner keeps it).
alter table public.spaces alter column created_by drop not null;
alter table public.spaces drop constraint spaces_created_by_fkey;
alter table public.spaces add constraint spaces_created_by_fkey
  foreign key (created_by) references public.profiles on delete set null;

-- ---------------------------------------------------------------------------
-- Invite codes: limit wrong guesses so open group spaces can't be found by brute force.
-- A wrong code returns an empty row instead of raising, so the attempt record isn't rolled back.
-- ---------------------------------------------------------------------------
create table public.join_attempts (
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index join_attempts_user_idx on public.join_attempts (user_id, created_at desc);
alter table public.join_attempts enable row level security; -- no policies: only join_space() touches it

create or replace function public.join_space(p_code text) returns public.spaces
language plpgsql security definer set search_path = public as $$
declare
  s spaces;
  n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Too many wrong codes. Wait a bit, then double-check the code with them.';
  end if;
  select * into s from spaces where invite_code = upper(trim(p_code)) for update;
  if not found then
    delete from join_attempts where created_at < now() - interval '1 day';
    insert into join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  if exists (select 1 from space_members where space_id = s.id and user_id = auth.uid()) then
    return s;
  end if;
  select count(*) into n from space_members where space_id = s.id;
  if n >= space_capacity(s.kind) then raise exception 'This space is full'; end if;
  insert into space_members (space_id, user_id) values (s.id, auth.uid());
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion (required by Google Play). Leaves every space (deleting ones that become
-- empty), then deletes the auth user; profiles, posts, answers etc. cascade from there.
-- ---------------------------------------------------------------------------
create function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  sid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  for sid in select space_id from space_members where user_id = me loop
    delete from space_members where space_id = sid and user_id = me;
    delete from spaces where id = sid and not exists (select 1 from space_members where space_id = sid);
  end loop;
  delete from auth.users where id = me;
end $$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage cleanup: Supabase blocks deleting storage objects from SQL, so deletes are forwarded
-- to the `notify` edge function, which removes the files with the service role.
-- ---------------------------------------------------------------------------
create trigger posts_cleanup after delete on public.posts
  for each row execute function public.forward_to_notify();

create trigger spaces_cleanup after delete on public.spaces
  for each row execute function public.forward_to_notify();
