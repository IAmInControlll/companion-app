-- Devices that show nudge notifications themselves (Android app with local notifications).
-- They get nudges as data-only pushes and keep the "×N" count on the phone, so it restarts
-- once the notification is swiped away. Older app versions keep getting ready-made notifications.
alter table public.devices add column local_nudges boolean not null default false;

-- Replaced rather than overloaded: two versions would make 2-argument calls ambiguous.
drop function public.register_device(text, text);
create function public.register_device(p_token text, p_platform text default 'android', p_local_nudges boolean default false)
returns void
language sql security definer set search_path = public as $$
  insert into devices (token, user_id, platform, local_nudges, updated_at)
  values (p_token, auth.uid(), p_platform, p_local_nudges, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, local_nudges = excluded.local_nudges, updated_at = now();
$$;
