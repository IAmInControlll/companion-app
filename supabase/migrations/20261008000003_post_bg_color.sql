-- Boards can now have any background colour; widgets use it to fill around the image.
alter table public.posts add column bg_color text check (bg_color is null or bg_color ~ '^#[0-9A-Fa-f]{6}$');
