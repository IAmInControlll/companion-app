-- Boards are kept for the memories: nobody can delete a post any more.
-- (Deleting your account still removes what you posted; that runs as security definer.)
drop policy "authors delete posts" on public.posts;

-- Scoreboard: how many of each nudge every member has sent, since a given time (or ever).
-- Runs as the caller, so the usual "members read nudges" policy applies.
create function public.nudge_scores(p_space uuid, p_since timestamptz default null)
returns table (sender_id uuid, kind text, n bigint)
language sql stable security invoker set search_path = public as $$
  select sender_id, kind, count(*)
  from nudges
  where space_id = p_space and (p_since is null or created_at >= p_since)
  group by sender_id, kind;
$$;

revoke execute on function public.nudge_scores(uuid, timestamptz) from public, anon;
grant execute on function public.nudge_scores(uuid, timestamptz) to authenticated;
