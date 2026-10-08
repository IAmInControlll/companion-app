-- Forward interesting row changes to the `notify` edge function, which sends FCM pushes.
-- The push both shows a notification and wakes the recipient's phone to refresh its widgets.
--
-- Requires two Vault secrets (see SETUP.md):
--   project_url    -> https://<project-ref>.supabase.co
--   notify_secret  -> random string, also set as NOTIFY_SECRET on the edge function

create function public.forward_to_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    return null; -- push not configured yet; never block the write
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object(
      'table', tg_table_name,
      'op', tg_op,
      'record', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      'actor', auth.uid()
    )
  );
  return null;
end $$;

create trigger posts_notify after insert on public.posts
  for each row execute function public.forward_to_notify();

create trigger nudges_notify after insert on public.nudges
  for each row execute function public.forward_to_notify();

create trigger answers_notify after insert on public.answers
  for each row execute function public.forward_to_notify();

create trigger reactions_notify after insert or update on public.reactions
  for each row execute function public.forward_to_notify();

create trigger events_notify after insert or update or delete on public.events
  for each row execute function public.forward_to_notify();

create trigger space_members_notify after insert on public.space_members
  for each row execute function public.forward_to_notify();

-- Only mood / location changes matter for widgets.
create trigger profiles_notify after update of mood_emoji, mood_text, lat, lng, display_name, avatar on public.profiles
  for each row
  when (old.mood_emoji is distinct from new.mood_emoji
     or old.mood_text is distinct from new.mood_text
     or old.lat is distinct from new.lat
     or old.lng is distinct from new.lng
     or old.display_name is distinct from new.display_name
     or old.avatar is distinct from new.avatar)
  execute function public.forward_to_notify();

create trigger spaces_notify after update of anniversary, name on public.spaces
  for each row execute function public.forward_to_notify();
