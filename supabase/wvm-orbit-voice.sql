-- World VR Mall · Orbit voice rate limits (Oct 25 2026). Run once in the Supabase SQL editor (same project as allofus.one).
-- Used only by the orbit-voice edge function (service role). No audio and no transcripts are stored: just counts.
-- Limits: 4 questions a minute and 40 a day per person; 2,000 a day for the whole mall.
create table if not exists public.orbit_voice_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  talks int not null default 0,
  minute_start timestamptz not null default now(),
  minute_n int not null default 0,
  primary key (user_id, day)
);
alter table public.orbit_voice_usage enable row level security;   -- no policies: clients can't read or write it

create or replace function public.orbit_voice_take(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.orbit_voice_usage%rowtype; total int;
begin
  select coalesce(sum(talks), 0) into total from public.orbit_voice_usage where day = current_date;
  if total >= 2000 then return jsonb_build_object('ok', false, 'why', 'mall_daily'); end if;
  insert into public.orbit_voice_usage (user_id, day) values (p_user, current_date) on conflict (user_id, day) do nothing;
  select * into r from public.orbit_voice_usage where user_id = p_user and day = current_date for update;
  if r.minute_start < now() - interval '1 minute' then r.minute_start := now(); r.minute_n := 0; end if;
  if r.minute_n >= 4 then return jsonb_build_object('ok', false, 'why', 'slow_down'); end if;
  if r.talks >= 40 then return jsonb_build_object('ok', false, 'why', 'daily'); end if;
  update public.orbit_voice_usage set talks = r.talks + 1, minute_start = r.minute_start, minute_n = r.minute_n + 1
   where user_id = p_user and day = current_date;
  return jsonb_build_object('ok', true, 'left_today', 39 - r.talks);
end $$;
revoke all on function public.orbit_voice_take(uuid) from public, anon, authenticated;
grant execute on function public.orbit_voice_take(uuid) to service_role;

-- housekeeping: keep 30 days of counts
delete from public.orbit_voice_usage where day < current_date - 30;
