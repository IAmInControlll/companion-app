-- Chalk companion app: core schema
-- Social model: a "space" is either a couple (max 2 members) or a group (max 12).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Me' check (char_length(display_name) between 1 and 40),
  avatar text not null default '🙂' check (char_length(avatar) <= 16),
  color text not null default '#F7A8C4' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  mood_emoji text check (char_length(mood_emoji) <= 16),
  mood_text text check (char_length(mood_text) <= 80),
  mood_updated_at timestamptz,
  share_location boolean not null default false,
  -- Rounded to ~1km before storage (see set_location()).
  lat double precision,
  lng double precision,
  location_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Me')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Spaces & membership
-- ---------------------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('couple', 'group')),
  invite_code text not null unique,
  timezone text not null default 'UTC',
  anniversary date,
  created_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user_idx on public.space_members (user_id);

-- SECURITY DEFINER helpers so RLS policies don't recurse into space_members.
create function public.is_member(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from space_members where space_id = p_space and user_id = auth.uid());
$$;

create function public.shares_space(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from space_members a
    join space_members b on a.space_id = b.space_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create function public.space_capacity(p_kind text) returns int
language sql immutable as $$
  select case p_kind when 'couple' then 2 else 12 end;
$$;

create function public.gen_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.spaces where invite_code = code);
  end loop;
  return code;
end $$;

create function public.create_space(p_name text, p_kind text, p_timezone text default 'UTC')
returns public.spaces
language plpgsql security definer set search_path = public as $$
declare s spaces;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into spaces (name, kind, invite_code, timezone, created_by)
  values (p_name, p_kind, gen_invite_code(), coalesce(nullif(p_timezone, ''), 'UTC'), auth.uid())
  returning * into s;
  insert into space_members (space_id, user_id) values (s.id, auth.uid());
  return s;
end $$;

create function public.join_space(p_code text) returns public.spaces
language plpgsql security definer set search_path = public as $$
declare
  s spaces;
  n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from spaces where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception 'No space found with that code'; end if;
  if exists (select 1 from space_members where space_id = s.id and user_id = auth.uid()) then
    return s;
  end if;
  select count(*) into n from space_members where space_id = s.id;
  if n >= space_capacity(s.kind) then raise exception 'This space is full'; end if;
  insert into space_members (space_id, user_id) values (s.id, auth.uid());
  return s;
end $$;

create function public.leave_space(p_space uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from space_members where space_id = p_space and user_id = auth.uid();
  -- Clean up empty spaces.
  delete from spaces where id = p_space and not exists (select 1 from space_members where space_id = p_space);
end $$;

create function public.regenerate_invite_code(p_space uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_member(p_space) then raise exception 'Not a member'; end if;
  code := gen_invite_code();
  update spaces set invite_code = code where id = p_space;
  return code;
end $$;

-- ---------------------------------------------------------------------------
-- Board posts (drawings, notes, photos) + reactions
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null check (kind in ('drawing', 'note', 'photo')),
  -- Rendered image shown on widgets (JPEG for drawings/notes/photos).
  image_path text not null,
  -- Vector document (strokes, text, stamps) for drawings & notes: enables replay and "draw over".
  doc_path text,
  body text check (char_length(body) <= 500),
  board text not null default 'classic',
  aspect real not null default 1 check (aspect between 0.25 and 4),
  created_at timestamptz not null default now()
);
create index posts_space_created_idx on public.posts (space_id, created_at desc);
create index posts_space_kind_created_idx on public.posts (space_id, kind, created_at desc);

create table public.reactions (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Nudges ("miss you", hugs, kisses...)
-- ---------------------------------------------------------------------------
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null check (kind in ('miss_you', 'hug', 'kiss', 'poke', 'high_five', 'love')),
  created_at timestamptz not null default now()
);
create index nudges_space_created_idx on public.nudges (space_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Countdowns / events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '📅' check (char_length(emoji) <= 16),
  date date not null,
  yearly boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index events_space_idx on public.events (space_id);

-- ---------------------------------------------------------------------------
-- Daily questions & This-or-That
-- ---------------------------------------------------------------------------
create table public.questions (
  id serial primary key,
  body text not null unique,
  category text not null default 'fun',
  audience text not null default 'any' check (audience in ('any', 'couple', 'group'))
);

create table public.daily_questions (
  space_id uuid not null references public.spaces on delete cascade,
  day date not null,
  question_id int not null references public.questions,
  primary key (space_id, day)
);

create table public.answers (
  space_id uuid not null references public.spaces on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (space_id, day, user_id),
  foreign key (space_id, day) references public.daily_questions on delete cascade
);

create table public.tot_prompts (
  id serial primary key,
  option_a text not null,
  option_b text not null,
  unique (option_a, option_b)
);

create table public.tot_answers (
  space_id uuid not null references public.spaces on delete cascade,
  prompt_id int not null references public.tot_prompts,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  choice smallint not null check (choice in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (space_id, prompt_id, user_id)
);

create function public.has_answered(p_space uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from answers where space_id = p_space and day = p_day and user_id = auth.uid());
$$;

create function public.has_tot_answered(p_space uuid, p_prompt int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tot_answers where space_id = p_space and prompt_id = p_prompt and user_id = auth.uid());
$$;

create function public.space_today(p_space uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from spaces where id = p_space;
$$;

-- Returns today's question for the space, picking (and persisting) one if needed.
create function public.get_daily_question(p_space uuid)
returns table (day date, question_id int, body text, category text)
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_kind text;
  v_qid int;
begin
  if not is_member(p_space) then raise exception 'Not a member'; end if;
  select (now() at time zone s.timezone)::date, s.kind into v_day, v_kind from spaces s where s.id = p_space;

  select dq.question_id into v_qid from daily_questions dq where dq.space_id = p_space and dq.day = v_day;
  if v_qid is null then
    select q.id into v_qid from questions q
    where q.audience in ('any', v_kind)
      and not exists (select 1 from daily_questions d where d.space_id = p_space and d.question_id = q.id)
    order by random() limit 1;
    if v_qid is null then -- every question used: start recycling
      select q.id into v_qid from questions q where q.audience in ('any', v_kind) order by random() limit 1;
    end if;
    insert into daily_questions (space_id, day, question_id) values (p_space, v_day, v_qid)
    on conflict on constraint daily_questions_pkey do nothing;
    select dq.question_id into v_qid from daily_questions dq where dq.space_id = p_space and dq.day = v_day;
  end if;

  return query select v_day, q.id, q.body, q.category from questions q where q.id = v_qid;
end $$;

-- Next This-or-That prompt the caller hasn't answered in this space.
create function public.next_tot_prompt(p_space uuid)
returns setof public.tot_prompts
language sql stable security definer set search_path = public as $$
  select p.* from tot_prompts p
  where is_member(p_space)
    and not exists (select 1 from tot_answers a where a.space_id = p_space and a.prompt_id = p.id and a.user_id = auth.uid())
  order by
    -- Prefer prompts someone else in the space has already answered, so matches show up fast.
    (exists (select 1 from tot_answers a where a.space_id = p_space and a.prompt_id = p.id)) desc,
    p.id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Streaks: a day counts when at least 2 members did something (post, nudge, answer, game).
-- ---------------------------------------------------------------------------
create function public.get_streak(p_space uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text;
  today date;
  d date;
  streak int := 0;
  qualifying date[];
  active_today uuid[];
begin
  if not is_member(p_space) then raise exception 'Not a member'; end if;
  select timezone into tz from spaces where id = p_space;
  today := (now() at time zone tz)::date;

  with activity as (
    select author_id as uid, created_at from posts where space_id = p_space and created_at > now() - interval '400 days'
    union all
    select sender_id, created_at from nudges where space_id = p_space and created_at > now() - interval '400 days'
    union all
    select user_id, created_at from answers where space_id = p_space and created_at > now() - interval '400 days'
    union all
    select user_id, created_at from tot_answers where space_id = p_space and created_at > now() - interval '400 days'
  ), per_day as (
    select (created_at at time zone tz)::date as day, array_agg(distinct uid) as uids
    from activity group by 1
  )
  select
    coalesce(array_agg(day) filter (where cardinality(uids) >= 2), '{}'),
    (select uids from per_day where day = today)
  into qualifying, active_today
  from per_day;

  d := today;
  if not (today = any(qualifying)) then d := today - 1; end if;
  while d = any(qualifying) loop
    streak := streak + 1;
    d := d - 1;
  end loop;

  return jsonb_build_object(
    'streak', streak,
    'today_complete', today = any(qualifying),
    'active_today', coalesce(to_jsonb(active_today), '[]'::jsonb),
    'best', (
      -- longest run of consecutive qualifying days (gaps-and-islands)
      select coalesce(max(cnt), 0) from (
        select count(*) as cnt from (
          select q, q - (row_number() over (order by q))::int as grp from unnest(qualifying) as q
        ) t group by grp
      ) runs
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Location (rounded for privacy) & devices
-- ---------------------------------------------------------------------------
create function public.set_location(p_lat double precision, p_lng double precision) returns void
language sql security definer set search_path = public as $$
  update profiles
  set lat = round(p_lat::numeric, 2)::double precision,
      lng = round(p_lng::numeric, 2)::double precision,
      location_updated_at = now()
  where id = auth.uid() and share_location;
$$;

create table public.devices (
  token text primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

-- Upsert a push token, re-assigning it if another account used this device before.
create function public.register_device(p_token text, p_platform text default 'android') returns void
language sql security definer set search_path = public as $$
  insert into devices (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.nudges enable row level security;
alter table public.events enable row level security;
alter table public.questions enable row level security;
alter table public.daily_questions enable row level security;
alter table public.answers enable row level security;
alter table public.tot_prompts enable row level security;
alter table public.tot_answers enable row level security;
alter table public.devices enable row level security;

create policy "read own and co-member profiles" on public.profiles
  for select using (id = auth.uid() or shares_space(id));
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Hide location columns from co-members unless the owner opted in.
create function public.clear_location_when_disabled() returns trigger
language plpgsql as $$
begin
  if not new.share_location then
    new.lat := null; new.lng := null; new.location_updated_at := null;
  end if;
  return new;
end $$;
create trigger profiles_clear_location before update on public.profiles
  for each row execute function public.clear_location_when_disabled();

create policy "members read space" on public.spaces for select using (is_member(id));
create policy "members update space" on public.spaces for update using (is_member(id)) with check (is_member(id));

create policy "members read membership" on public.space_members for select using (is_member(space_id));

create policy "members read posts" on public.posts for select using (is_member(space_id));
create policy "members create posts" on public.posts for insert with check (is_member(space_id) and author_id = auth.uid());
create policy "authors delete posts" on public.posts for delete using (author_id = auth.uid());

create policy "members read reactions" on public.reactions for select
  using (exists (select 1 from posts p where p.id = post_id and is_member(p.space_id)));
create policy "members react" on public.reactions for insert
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and is_member(p.space_id)));
create policy "change own reaction" on public.reactions for update using (user_id = auth.uid());
create policy "remove own reaction" on public.reactions for delete using (user_id = auth.uid());

create policy "members read nudges" on public.nudges for select using (is_member(space_id));
create policy "members send nudges" on public.nudges for insert with check (is_member(space_id) and sender_id = auth.uid());

create policy "members read events" on public.events for select using (is_member(space_id));
create policy "members create events" on public.events for insert with check (is_member(space_id) and created_by = auth.uid());
create policy "members update events" on public.events for update using (is_member(space_id));
create policy "members delete events" on public.events for delete using (is_member(space_id));

create policy "anyone signed in reads questions" on public.questions for select to authenticated using (true);
create policy "anyone signed in reads prompts" on public.tot_prompts for select to authenticated using (true);
create policy "members read daily questions" on public.daily_questions for select using (is_member(space_id));

-- Answers stay hidden until you've answered yourself.
create policy "read answers after answering" on public.answers for select
  using (is_member(space_id) and (user_id = auth.uid() or has_answered(space_id, day)));
create policy "answer today's question" on public.answers for insert
  with check (user_id = auth.uid() and is_member(space_id) and day = space_today(space_id));
create policy "edit own answer today" on public.answers for update
  using (user_id = auth.uid() and day = space_today(space_id));

create policy "read tot after answering" on public.tot_answers for select
  using (is_member(space_id) and (user_id = auth.uid() or has_tot_answered(space_id, prompt_id)));
create policy "answer tot" on public.tot_answers for insert
  with check (user_id = auth.uid() and is_member(space_id));

create policy "own devices" on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.posts, public.reactions, public.nudges, public.events, public.answers,
  public.tot_answers, public.profiles, public.space_members;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects stored as <space_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/json'])
on conflict (id) do nothing;

create policy "members read media" on storage.objects for select
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "members upload media" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "owners delete media" on storage.objects for delete
  using (bucket_id = 'media' and owner = auth.uid());
