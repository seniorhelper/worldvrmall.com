-- ============================================================
-- World VR Mall v40 · THE SHIELD (Oct 25 2026)
-- Run once in Supabase → SQL Editor (the same allofus.one project), AFTER:
--   allofus v26-safety … v30-rooms-constellations (all on production) and v31-age-assurance.sql (shared, in this folder).
-- Additive and idempotent: safe to run twice. Drops no tables. The ONE data change is section 6c (strips
-- unscanned data: selfie faces out of profiles.avatar; read it before running).
-- No secrets in here: fine to keep in the public repo.
--
-- Zach's rule (Oct 25): the mall is open to everyone with no gate, but LIVE SOCIAL is 18+ only, same as allofus.one.
-- Seeing live players, hugs, messages, voice, video, rooms: signed-in adult allofus accounts only. Everyone else
-- (guests, under-18s, accounts without a DOB, held / banned) explores solo and never sees or hears live people.
--
-- What it adds (details + test steps in SHIELD.md)
--   1. One live band: adults. Feature levels come from v31: text / hugs / rooms need adult_self; voice / video / fire need
--      adult_verified once an age-check provider is configured (adult_self until then).
--   2. Realtime Authorization for the mall: private topics wvm:a:* for adults only; wvm:u:<id> is a private inbox only
--      the server writes; room topics wvm:a:room-<slug>[:voice] only for current, non-kicked room members.
--   3. wvm_send(): person-to-person events (hugs with consent, voice / video signaling, waves, messages, friend requests)
--      are stamped by the server with the real sender, checked for level, blocks (both ways), mute/hold, rate limits,
--      size and text filtering. Logged in wvm_events (30 days) for the evidence chain.
--   4. Reports on live players: auto-mute at 2 reporters in 24 h, hold at 3 (allofus rule), child-safety = instant hold,
--      may-be-a-minor = hold + forced age re-check (v31); every report snapshots the server-side event log into mod_evidence.
--   5. Selfie faces: profiles.avatar.face only ever holds a picture the Hive media-scan function cleared.
--   6. Reserved names (no staff look-alikes) + no phone/email/link names.
--   7. Prize claims: one per person (account, normalized email, phone, household address), per-IP limits, no minors.
--   8. Rooms (gathering room): per-room cap, host kick / lock, join / leave / heartbeat.
--   9. RLS audit of the mall tables + an audit query you can run any time.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0 · flags (safety_settings from allofus v27; admin / SQL editor only)
-- ─────────────────────────────────────────────────────────────
insert into public.safety_settings (key, value, secret) values
  ('wvm_auto_mute_reporters', '2'::jsonb, false),    -- distinct reporters in 24 h that auto-mute someone in the mall
  ('wvm_event_days', '30'::jsonb, false),            -- how long wvm_events keeps person-to-person logs
  ('wvm_room_cap', '16'::jsonb, false)               -- default people per room (a host can set lower, never higher)
on conflict (key) do nothing;
-- the teen band of the first draft is gone (Zach, Oct 25): remove its flags if an earlier draft was ever run
delete from public.safety_settings where key in ('wvm_teens_live', 'wvm_teen_voice');
do $$ begin execute 'drop function if exists public.wvm_is_teen(uuid)'; exception when others then null; end $$;

create or replace function public.wvm_setting_int(k text, d int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::int end from public.safety_settings s where s.key = k), d);
$$;
revoke all on function public.wvm_setting_int(text, int) from public, anon, authenticated;

-- generic counter for rate limits (keys: 'u:<uid>:<bucket>' or 'ip:<hash>:<bucket>')
create table if not exists public.wvm_rate (key text primary key, win timestamptz not null default now(), n int not null default 0);
alter table public.wvm_rate enable row level security;
revoke all on public.wvm_rate from anon, authenticated;
-- true = allowed (and counted). At most p_max hits per p_secs window.
create or replace function public.wvm_rate_hit(p_key text, p_max int, p_secs int) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.wvm_rate%rowtype;
begin
  insert into public.wvm_rate as w (key, win, n) values (p_key, now(), 1)
  on conflict (key) do update set
    n = case when w.win < now() - make_interval(secs => p_secs) then 1 else w.n + 1 end,
    win = case when w.win < now() - make_interval(secs => p_secs) then now() else w.win end
  returning * into r;
  if random() < 0.002 then delete from public.wvm_rate where win < now() - interval '1 day'; end if;
  return r.n <= p_max;
end $$;
revoke all on function public.wvm_rate_hit(text, int, int) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 1 · who is in the live mall: adults only (v31 safety_age_level / safety_can decide the feature level)
-- ─────────────────────────────────────────────────────────────
create or replace function public.wvm_band(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when uid is not null and (uid = public.founder_id() or public.safety_is_adult(uid)) then 'adult' end;
$$;
revoke all on function public.wvm_band(uuid) from public, anon;
grant execute on function public.wvm_band(uuid) to authenticated;

-- distinct members who reported this person in the mall in the last 24 h (open reports)
create or replace function public.wvm_reporters_24h(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct r.reporter)::int from public.reports r
   where r.reported = uid and r.target_kind = 'wvm_player' and coalesce(r.status, 'open') = 'open' and r.created_at > now() - interval '24 hours';
$$;
revoke all on function public.wvm_reporters_24h(uuid) from public, anon, authenticated;

create or replace function public.wvm_auto_muted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and uid <> public.founder_id() and (
    coalesce((select s.held or s.banned from public.member_safety s where s.user_id = uid), false)
    or public.wvm_reporters_24h(uid) >= public.wvm_setting_int('wvm_auto_mute_reporters', 2));
$$;
revoke all on function public.wvm_auto_muted(uuid) from public, anon, authenticated;

-- both people may interact: both adults, neither blocked the other
create or replace function public.wvm_pair_ok(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce: a NULL here would read as "not refused" in callers (if not ... then)
  select coalesce(a is not null and b is not null and a <> b
     and public.wvm_band(a) is not distinct from 'adult' and public.wvm_band(b) is not distinct from 'adult'
     and not public.safety_blocked(a, b) and not public.safety_blocked(b, a), false);
$$;
revoke all on function public.wvm_pair_ok(uuid, uuid) from public, anon;
grant execute on function public.wvm_pair_ok(uuid, uuid) to authenticated;

-- what the mall client needs to know about me
create or replace function public.wvm_shield_status() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); s public.member_safety%rowtype; v_created timestamptz;
begin
  if uid is null then return jsonb_build_object('sql', 40, 'signed_in', false, 'level', 'guest', 'provider', public.safety_age_provider()); end if;
  perform public.safety_capture_dob(uid);
  select * into s from public.member_safety where user_id = uid;
  select created_at into v_created from auth.users where id = uid;
  return jsonb_build_object('sql', 40, 'signed_in', true, 'band', public.wvm_band(uid),
    'level', case when uid = public.founder_id() and public.safety_age_level(uid) = 'guest' then 'adult_self' else public.safety_age_level(uid) end,
    'provider', public.safety_age_provider(), 'check_url', (select v.value #>> '{}' from public.safety_settings v where v.key = 'age_check_url'),
    'can', jsonb_build_object('text', public.safety_can(uid, 'text'), 'voice', public.safety_can(uid, 'voice'), 'video', public.safety_can(uid, 'video'), 'fire', public.safety_can(uid, 'fire')),
    'needs', jsonb_build_object('text', public.safety_required_level('text'), 'voice', public.safety_required_level('voice'), 'video', public.safety_required_level('video'), 'fire', public.safety_required_level('fire')),
    'dob_set', s.dob is not null, 'minor', coalesce(s.restricted, false) or (s.dob is not null and s.dob > (current_date - interval '18 years')::date),
    'held', coalesce(s.held, false), 'recheck', coalesce(s.age_recheck, false), 'banned', coalesce(s.banned, false) or coalesce(public.is_banned(uid), false),
    'muted', public.wvm_auto_muted(uid), 'admin', public.is_admin(), 'can_upload', public.safety_can_upload(uid),
    'new_account', coalesce(v_created > now() - interval '72 hours', true));
end $$;
revoke all on function public.wvm_shield_status() from public, anon;
grant execute on function public.wvm_shield_status() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 1b · rooms (the gathering room and any later ones): cap, host, kick, lock
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wvm_rooms (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,18}$'),
  name text check (char_length(name) <= 60),
  host uuid references auth.users(id) on delete set null,
  locked boolean not null default false,
  cap int not null default 16 check (cap between 2 and 50),
  feature text not null default 'text' check (feature in ('text', 'voice', 'video', 'fire')),   -- the level needed to join
  created_at timestamptz default now());
create table if not exists public.wvm_room_members (
  slug text references public.wvm_rooms(slug) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  last_seen timestamptz default now(),
  kicked boolean not null default false,
  kicked_at timestamptz,
  primary key (slug, user_id));
alter table public.wvm_rooms enable row level security;
alter table public.wvm_room_members enable row level security;
revoke all on public.wvm_rooms from anon, authenticated;
revoke all on public.wvm_room_members from anon, authenticated;
grant select on public.wvm_rooms to authenticated;
drop policy if exists "wvm rooms adults read" on public.wvm_rooms;
create policy "wvm rooms adults read" on public.wvm_rooms for select to authenticated using (public.wvm_band(auth.uid()) = 'adult');

create or replace function public.wvm_room_active(p_slug text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.wvm_room_members m where m.slug = p_slug and not m.kicked and m.last_seen > now() - interval '90 seconds';
$$;
revoke all on function public.wvm_room_active(text) from public, anon, authenticated;

create or replace function public.wvm_room_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.wvm_rooms%rowtype; uid uuid := auth.uid(); m public.wvm_room_members%rowtype;
begin
  select * into r from public.wvm_rooms where slug = p_slug;
  if r.slug is null then return jsonb_build_object('ok', false, 'error', 'no such room'); end if;
  select * into m from public.wvm_room_members where slug = p_slug and user_id = uid;
  return jsonb_build_object('ok', true, 'slug', r.slug, 'name', r.name, 'host', r.host, 'i_am_host', r.host = uid, 'locked', r.locked, 'cap', r.cap,
    'feature', r.feature, 'needs', public.safety_required_level(r.feature), 'count', public.wvm_room_active(p_slug),
    'member', m.user_id is not null and not m.kicked, 'kicked', coalesce(m.kicked, false));
end $$;
revoke all on function public.wvm_room_info(text) from public, anon;
grant execute on function public.wvm_room_info(text) to authenticated;

-- create a room (or take an empty one over as host). Admin can create any; members may create one they host.
create or replace function public.wvm_room_open(p_slug text, p_name text default null, p_cap int default null, p_feature text default 'text') returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wvm_rooms%rowtype; cap int := least(coalesce(p_cap, public.wvm_setting_int('wvm_room_cap', 16)), public.wvm_setting_int('wvm_room_cap', 16));
begin
  if uid is null or public.wvm_band(uid) is distinct from 'adult' then return jsonb_build_object('ok', false, 'error', 'Rooms are for signed-in adults.'); end if;
  if p_slug !~ '^[a-z0-9-]{2,18}$' then return jsonb_build_object('ok', false, 'error', 'bad room name'); end if;
  if p_feature not in ('text', 'voice', 'video', 'fire') then p_feature := 'text'; end if;
  if not public.wvm_rate_hit('u:' || uid || ':room_open', 10, 3600) then return jsonb_build_object('ok', false, 'error', 'Slow down a little.'); end if;
  select * into r from public.wvm_rooms where slug = p_slug for update;
  if r.slug is null then
    insert into public.wvm_rooms (slug, name, host, cap, feature) values (p_slug, left(coalesce((public.wvm_filter_text(p_name)->>'text'), p_slug), 60), uid, greatest(2, cap), p_feature);
  elsif r.host is null or (r.host <> uid and public.wvm_room_active(p_slug) = 0) or public.is_admin() then
    update public.wvm_rooms set host = uid, locked = false where slug = p_slug;
  end if;
  return public.wvm_room_info(p_slug);
end $$;
revoke all on function public.wvm_room_open(text, text, int, text) from public, anon;
grant execute on function public.wvm_room_open(text, text, int, text) to authenticated;

create or replace function public.wvm_room_join(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wvm_rooms%rowtype; m public.wvm_room_members%rowtype;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Sign in with allofus to join rooms.'); end if;
  select * into r from public.wvm_rooms where slug = p_slug for update;
  if r.slug is null then return jsonb_build_object('ok', false, 'error', 'no such room'); end if;
  if not public.safety_can(uid, r.feature) then
    return jsonb_build_object('ok', false, 'error', case when public.wvm_band(uid) is null then 'Rooms are for signed-in adults.' else 'This room needs a one-time age check.' end, 'needs', public.safety_required_level(r.feature)); end if;
  if public.wvm_auto_muted(uid) then return jsonb_build_object('ok', false, 'error', 'You are muted for now while a moderator reviews reports.'); end if;
  select * into m from public.wvm_room_members where slug = p_slug and user_id = uid;
  if coalesce(m.kicked, false) and m.kicked_at > now() - interval '24 hours' and not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'The host asked you to leave this room. Try again tomorrow.'); end if;
  if r.host is not null and r.host <> uid and (public.safety_blocked(r.host, uid) or public.safety_blocked(uid, r.host)) then return jsonb_build_object('ok', false, 'error', 'not available'); end if;
  if r.locked and r.host is distinct from uid and not (m.user_id is not null and not m.kicked and m.last_seen > now() - interval '90 seconds') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'This room is locked by its host.'); end if;
  if public.wvm_room_active(p_slug) >= r.cap and not (m.user_id is not null and not m.kicked and m.last_seen > now() - interval '90 seconds') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'This room is full (' || r.cap || ' people).'); end if;
  insert into public.wvm_room_members (slug, user_id) values (p_slug, uid)
  on conflict (slug, user_id) do update set last_seen = now(), joined_at = case when public.wvm_room_members.kicked then now() else public.wvm_room_members.joined_at end, kicked = false, kicked_at = null;
  return public.wvm_room_info(p_slug);
end $$;
revoke all on function public.wvm_room_join(text) from public, anon;
grant execute on function public.wvm_room_join(text) to authenticated;

-- heartbeat every ~30 s while inside (a member who stops pinging drops out of the count after 90 s)
create or replace function public.wvm_room_ping(p_slug text) returns boolean
language sql security definer set search_path = public as $$
  update public.wvm_room_members set last_seen = now() where slug = p_slug and user_id = auth.uid() and not kicked returning true;
$$;
revoke all on function public.wvm_room_ping(text) from public, anon;
grant execute on function public.wvm_room_ping(text) to authenticated;

create or replace function public.wvm_room_leave(p_slug text) returns void
language sql security definer set search_path = public as $$
  update public.wvm_room_members set last_seen = now() - interval '1 hour' where slug = p_slug and user_id = auth.uid();
$$;
revoke all on function public.wvm_room_leave(text) from public, anon;
grant execute on function public.wvm_room_leave(text) to authenticated;

-- host (or admin): kick someone (out for 24 h; their realtime access to the room ends at once) or lock / unlock / re-cap
create or replace function public.wvm_room_kick(p_slug text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.wvm_rooms%rowtype; uid uuid := auth.uid();
begin
  select * into r from public.wvm_rooms where slug = p_slug;
  if r.slug is null or uid is null or not (r.host = uid or public.is_admin()) then return jsonb_build_object('ok', false, 'error', 'Only the host can do that.'); end if;
  if p_user = uid or p_user = public.founder_id() then return jsonb_build_object('ok', false, 'error', 'not allowed'); end if;
  insert into public.wvm_room_members (slug, user_id, kicked, kicked_at, last_seen) values (p_slug, p_user, true, now(), now() - interval '1 hour')
  on conflict (slug, user_id) do update set kicked = true, kicked_at = now(), last_seen = now() - interval '1 hour';
  insert into public.wvm_events (sender, recipient, event, band, body, page) values (uid, p_user, 'room_kick', 'adult', null, left(p_slug, 40));
  begin perform realtime.send(jsonb_build_object('from', uid, 'room', p_slug, 'v', 'srv', 'at', now()), 'room_kick', 'wvm:u:' || p_user::text, true); exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.wvm_room_kick(text, uuid) from public, anon;
grant execute on function public.wvm_room_kick(text, uuid) to authenticated;

create or replace function public.wvm_room_set(p_slug text, p_locked boolean default null, p_cap int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.wvm_rooms%rowtype; uid uuid := auth.uid();
begin
  select * into r from public.wvm_rooms where slug = p_slug;
  if r.slug is null or uid is null or not (r.host = uid or public.is_admin()) then return jsonb_build_object('ok', false, 'error', 'Only the host can do that.'); end if;
  update public.wvm_rooms set locked = coalesce(p_locked, locked),
         cap = case when p_cap is null then cap else greatest(2, least(p_cap, public.wvm_setting_int('wvm_room_cap', 16))) end where slug = p_slug;
  return public.wvm_room_info(p_slug);
end $$;
revoke all on function public.wvm_room_set(text, boolean, int) from public, anon;
grant execute on function public.wvm_room_set(text, boolean, int) to authenticated;

-- is this member inside the room right now (not kicked, pinged in the last 90 s)?
create or replace function public.wvm_room_member(p_slug text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wvm_room_members m where m.slug = p_slug and m.user_id = uid and not m.kicked and m.last_seen > now() - interval '90 seconds');
$$;
revoke all on function public.wvm_room_member(text, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2 · Realtime Authorization for the mall (private channels only; the client never falls back to public)
--     wvm:a:<page>[:pos:<area>|:voice]   adults      wvm:a:room-<slug>[:voice]   room members      wvm:u:<uid>   my inbox
--     These policies are added NEXT TO allofus's "v27 rt adults read/write" and the social bridge's "wvm social rt read/write"
--     (permissive policies are ORed; each function returns false for topics it does not own).
-- ─────────────────────────────────────────────────────────────
create or replace function public.wvm_rt_allowed(t text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); pg text;
begin
  if uid is null or t is null or t not like 'wvm:%' then return false; end if;
  if t like 'wvm:u:%' then return not p_write and t = 'wvm:u:' || uid::text; end if;
  if t !~ '^wvm:a:[a-z0-9-]{1,24}(:pos:[0-9_-]{1,24}|:voice)?$' then return false; end if;
  if public.wvm_band(uid) is distinct from 'adult' then return false; end if;
  pg := split_part(t, ':', 3);
  if pg like 'room-%' and not (public.wvm_room_member(substr(pg, 6), uid) or public.is_admin()) then return false; end if;
  if t like '%:voice' and not public.safety_can(uid, 'voice') then return false; end if;
  -- auto-muted: may still walk around (positions), may not broadcast on the main / voice / room channels
  if p_write and t not like '%:pos:%' and public.wvm_auto_muted(uid) then return false; end if;
  return true;
end $$;
revoke all on function public.wvm_rt_allowed(text, boolean) from public, anon;
grant execute on function public.wvm_rt_allowed(text, boolean) to authenticated;

do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "wvm rt read" on realtime.messages';
    execute 'create policy "wvm rt read" on realtime.messages for select to authenticated using (public.wvm_rt_allowed(realtime.topic(), false))';
    execute 'drop policy if exists "wvm rt write" on realtime.messages';
    execute 'create policy "wvm rt write" on realtime.messages for insert to authenticated with check (public.wvm_rt_allowed(realtime.topic(), true))';
  else
    raise notice 'realtime.messages not present here; mall realtime policies skipped (Supabase has it).';
  end if;
exception when others then raise warning 'wvm realtime policies: %', sqlerrm; end $$;

-- ─────────────────────────────────────────────────────────────
-- 3 · text filter (same rules as js/wvm-shield.js filterText) + reserved names
-- ─────────────────────────────────────────────────────────────
create or replace function public.wvm_filter_text(p text) returns jsonb
language plpgsql stable set search_path = public as $$
declare t text := left(coalesce(p, ''), 1000); probe text; hits text[] := '{}'; r record;
begin
  t := regexp_replace(t, '[​-‏⁠﻿]', '', 'g');
  probe := lower(t);
  probe := regexp_replace(probe, '\yzero\y|\yoh\y', '0', 'g'); probe := regexp_replace(probe, '\yone\y', '1', 'g'); probe := regexp_replace(probe, '\ytwo\y', '2', 'g');
  probe := regexp_replace(probe, '\ythree\y', '3', 'g'); probe := regexp_replace(probe, '\yfour\y', '4', 'g'); probe := regexp_replace(probe, '\yfive\y', '5', 'g');
  probe := regexp_replace(probe, '\ysix\y', '6', 'g'); probe := regexp_replace(probe, '\yseven\y', '7', 'g'); probe := regexp_replace(probe, '\yeight\y', '8', 'g'); probe := regexp_replace(probe, '\ynine\y', '9', 'g');
  for r in select * from (values
    ('phone', '(\+?[0-9][[:space:]().\-_/*]{0,3}){7,}'),
    ('email', '[a-z0-9._%+-]+[[:space:]]*(@|\(at\)|\[at\]|[[:space:]]at[[:space:]])[[:space:]]*[a-z0-9-]+([[:space:]]*(\.|\(dot\)|\[dot\]|[[:space:]]dot[[:space:]])[[:space:]]*[a-z]{2,})+'),
    ('link', '(https?://|www\.)[^[:space:]]+|\y[a-z0-9-]{2,}(\.|[[:space:]]?\(dot\)[[:space:]]?|[[:space:]]?\[dot\][[:space:]]?|[[:space:]]dot[[:space:]])(com|net|org|io|me|gg|ly|co|app|xyz|link|site|online|live|tv|us|ru|cn|biz|info|to|cc|club|shop|store)\y'),
    ('handle', '(^|[[:space:]])@[a-z0-9_.]{3,}'),
    ('payment', '(^|[[:space:]])\$[a-z][a-z0-9_]{2,20}|\y(cash ?app|venmo|zelle|pay ?pal|apple ?pay|google ?pay|gift ?cards?|itunes cards?|steam cards?|google play cards?|bitcoin|btc|eth|crypto|usdt|wallet address|western union|moneygram|wire (me|transfer|the money)|send (me )?(money|cash|funds)|pay (me|first|upfront|up front)|robux|v-?bucks|bank (login|account|details)|card number|cvv|ssn)\y'),
    ('offsite', '\y(snap ?chat|snap|sc|insta(gram)?|ig|tik ?tok|discord|telegram|whats ?app|kik|wickr|signal app|facebook|fb|dm me|text me|call me (at|on|tonight)|add me on|my number|ur number|your number|phone number|meet (up )?(irl|in person|in real life|offline)|what school|which school|where do (you|u) live|your address|home alone|parents (home|away)|keep (this|it) (a )?secret|don''?t tell (your|ur|anyone)|our (little )?secret|send (me )?(a )?(pic|pics|photo|selfie)s?)\y')
  ) as x(id, rx) loop
    if probe ~* r.rx or t ~* r.rx then hits := hits || r.id; t := regexp_replace(t, r.rx, '•••', 'gi'); end if;
  end loop;
  -- the severe allofus Match Shield categories when v29 is installed (not drugs / weapons / knockoffs: those words
  -- turn up in normal mall talk, e.g. "rounds of golf", "laser guns")
  begin
    if to_regprocedure('public.match_screen(text)') is not null then
      execute 'select $1 || coalesce((select array_agg(h) from unnest(public.match_screen($2)) h where h in (''sex'', ''minors'', ''trafficking'', ''fraud'', ''hate'')), ''{}''::text[])' into hits using hits, coalesce(p, '');
    end if;
  exception when others then null; end;
  return jsonb_build_object('ok', cardinality(hits) = 0, 'text', btrim(t), 'hits', to_jsonb(hits));
end $$;
grant execute on function public.wvm_filter_text(text) to anon, authenticated;

create or replace function public.wvm_reserved_name(n text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(regexp_replace(translate(lower(coalesce(n, '')), '0@1!|345$7', 'oaiiieasst'), '[_.\-]+', ' ', 'g')
    ~ '(admin|moderat|\ymod\y|staff|support|official|security|helpdesk|customer ?service|world ?vr ?mall|worldvrmall|all ?of ?us|allofus|eye ?to ?ad|eyetoad|search ?converts|wennstedt|founder|\yceo\y|\yowner\y|police|sheriff|\yfbi\y|ncmec|anthropic|claude)', false);
$$;
grant execute on function public.wvm_reserved_name(text) to anon, authenticated;

-- names: nobody but the founder wears a staff look-alike, and a name cannot carry a phone number / link / handle.
-- New profiles get a safe placeholder instead of an error (so sign-up never breaks); renames are refused with a message.
create or replace function public.wvm_name_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare bad boolean;
begin
  if new.id = public.founder_id() or public.is_admin() or public.safety_is_service() then return new; end if;
  if tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name and new.username is not distinct from old.username then return new; end if;
  bad := public.wvm_reserved_name(new.display_name) or public.wvm_reserved_name(new.username)
      or not coalesce((public.wvm_filter_text(new.display_name)->>'ok')::boolean, true);
  if not bad then return new; end if;
  if tg_op = 'INSERT' then
    new.display_name := 'Member ' || left(new.id::text, 4);
    if public.wvm_reserved_name(new.username) then new.username := null; end if;
    return new;
  end if;
  raise exception 'That name is not allowed (staff look-alikes, phone numbers, emails, links and handles are reserved or blocked). Please pick another.' using errcode = 'P0001';
end $$;
drop trigger if exists wvm_name_guard_v40 on public.profiles;
create trigger wvm_name_guard_v40 before insert or update of display_name, username on public.profiles
  for each row execute function public.wvm_name_guard();

-- ─────────────────────────────────────────────────────────────
-- 4 · server-stamped person-to-person events + the evidence log
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wvm_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  sender uuid not null,
  recipient uuid not null,
  event text not null,
  band text,
  body text,                 -- message text (filtered) or a short summary; never voice audio, never SDP
  page text);
create index if not exists wvm_events_pair_v40 on public.wvm_events (sender, recipient, at desc);
create index if not exists wvm_events_recipient_v40 on public.wvm_events (recipient, at desc);
alter table public.wvm_events enable row level security;
revoke all on public.wvm_events from anon, authenticated;
grant select on public.wvm_events to authenticated;
drop policy if exists "wvm events admin read" on public.wvm_events;
create policy "wvm events admin read" on public.wvm_events for select to authenticated using (public.is_admin());

create or replace function public.wvm_send(p_to uuid, p_event text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b text; nm text; f jsonb; body jsonb := coalesce(p_payload, '{}'::jsonb); lim int; secs int; maxb int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  if p_event is null or p_event not in ('hug_req', 'hug_ok', 'hug_no', 'wave', 'emote', 'sig', 'msg', 'friend_req', 'friend_ok') then
    return jsonb_build_object('ok', false, 'error', 'unknown event'); end if;
  maxb := 4096; if p_event = 'sig' then maxb := 12000; end if;   -- voice offers / answers carry SDP
  if jsonb_typeof(body) <> 'object' or octet_length(body::text) > maxb then return jsonb_build_object('ok', false, 'error', 'too big'); end if;
  -- same band + not blocked either way (one generic answer: nobody learns they were blocked)
  if not public.wvm_pair_ok(uid, p_to) then return jsonb_build_object('ok', false, 'error', 'not available'); end if;
  b := public.wvm_band(uid);
  if public.wvm_auto_muted(uid) and p_event in ('sig', 'msg', 'hug_req', 'wave', 'emote', 'friend_req') then
    return jsonb_build_object('ok', false, 'error', 'You are muted for now because several people reported you. A moderator will review it.'); end if;
  -- feature level (v31): voice / video signaling may need a verified age; everything else needs adult_self
  if p_event = 'sig' and not public.safety_can(uid, case when body->>'kind' = 'video' then 'video' else 'voice' end) then
    return jsonb_build_object('ok', false, 'error', 'Voice and video need a one-time age check.', 'needs', 'adult_verified'); end if;
  if p_event <> 'sig' and not public.safety_can(uid, 'text') then return jsonb_build_object('ok', false, 'error', 'not available'); end if;
  -- rate limits (per sender, per pair, overall)
  select x.l, x.s into lim, secs from (values ('hug_req', 6, 300), ('hug_ok', 10, 300), ('hug_no', 10, 300), ('wave', 20, 60), ('emote', 20, 60), ('sig', 240, 60), ('msg', 20, 60), ('friend_req', 10, 3600), ('friend_ok', 20, 3600)) as x(e, l, s) where x.e = p_event;
  if not public.wvm_rate_hit('u:' || uid || ':' || p_event, lim, secs) then return jsonb_build_object('ok', false, 'error', 'Slow down a little.'); end if;
  if p_event in ('hug_req', 'friend_req') and not public.wvm_rate_hit('u:' || uid || ':' || p_event || ':' || p_to, 1, 30) then return jsonb_build_object('ok', false, 'error', 'Give them a moment.'); end if;
  if not public.wvm_rate_hit('u:' || uid || ':all', 400, 60) then return jsonb_build_object('ok', false, 'error', 'Slow down a little.'); end if;
  if p_event = 'msg' then
    f := public.wvm_filter_text(body->>'text');
    if not (f->>'ok')::boolean then
      insert into public.wvm_events (sender, recipient, event, band, body, page) values (uid, p_to, 'msg_blocked', b, left(coalesce(body->>'text', ''), 500), left(body->>'page', 40));
      return jsonb_build_object('ok', false, 'error', 'For everyone''s safety, phone numbers, emails, links, social handles and money talk are not allowed.', 'hits', f->'hits'); end if;
    body := body || jsonb_build_object('text', left(f->>'text', 500));
  end if;
  if p_event <> 'sig' then
    insert into public.wvm_events (sender, recipient, event, band, body, page) values (uid, p_to, p_event, b, case when p_event = 'msg' then body->>'text' end, left(body->>'page', 40));
  end if;
  if random() < 0.01 then delete from public.wvm_events where at < now() - make_interval(days => public.wvm_setting_int('wvm_event_days', 30)); end if;
  select coalesce(nullif(display_name, ''), username, 'Someone') into nm from public.profiles where id = uid;
  begin
    perform realtime.send(body || jsonb_build_object('from', uid, 'name', left(coalesce(nm, 'Someone'), 40), 'v', 'srv', 'at', now()), p_event, 'wvm:u:' || p_to::text, true);
  exception when others then return jsonb_build_object('ok', false, 'error', 'realtime unavailable'); end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.wvm_send(uuid, text, jsonb) from public, anon;
grant execute on function public.wvm_send(uuid, text, jsonb) to authenticated;

-- who, among these people, blocked me or was blocked by me? (so you vanish for each other; does not reveal which way)
create or replace function public.wvm_block_pairs(p_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from unnest(p_ids[1:200]) x
   where auth.uid() is not null and x <> auth.uid() and (public.safety_blocked(x, auth.uid()) or public.safety_blocked(auth.uid(), x));
$$;
revoke all on function public.wvm_block_pairs(uuid[]) from public, anon;
grant execute on function public.wvm_block_pairs(uuid[]) to authenticated;
-- my own block list (lets profiles.blocked stop being world-readable later without breaking the mall)
create or replace function public.wvm_my_blocked() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select p.blocked from public.profiles p where p.id = auth.uid()), '{}');
$$;
revoke all on function public.wvm_my_blocked() from public, anon;
grant execute on function public.wvm_my_blocked() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5 · reports on live players → evidence snapshot (server-side log, not what the reporter's device says)
-- ─────────────────────────────────────────────────────────────
create or replace function public.wvm_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_who uuid;
begin
  if new.target_kind is distinct from 'wvm_player' then return new; end if;
  v_who := coalesce(new.reported, case when new.target_id ~ '^[0-9a-f-]{36}$' then new.target_id::uuid end);
  if v_who is null then return new; end if;
  v_snap := jsonb_build_object(
    'report_id', new.id, 'category', new.category, 'reporter', new.reporter, 'reported', v_who,
    'reported_band', public.wvm_band(v_who), 'reporter_band', public.wvm_band(new.reporter),
    'client_evidence', new.evidence,
    'between', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at desc), '[]') from (select * from public.wvm_events e where ((e.sender = v_who and e.recipient = new.reporter) or (e.sender = new.reporter and e.recipient = v_who)) and e.at > now() - interval '14 days' order by e.at desc limit 100) e),
    'sent_by_reported_24h', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at desc), '[]') from (select * from public.wvm_events e where e.sender = v_who and e.at > now() - interval '24 hours' order by e.at desc limit 100) e),
    'reporters_24h', public.wvm_reporters_24h(v_who));
  begin v_snap := public.safety_snapshot(v_who, 'wvm_player', v_who::text) || v_snap; exception when others then null; end;
  insert into public.mod_evidence (created_by, user_id, kind, target_id, snapshot, hold, note)
    values (new.reporter, v_who, 'wvm_player', v_who::text, v_snap, coalesce(new.category in ('child_safety', 'sexual', 'threat', 'underage', 'may_be_minor'), false),
            'automatic: World VR Mall live-player report #' || new.id);
  -- may_be_minor: the hold + forced age re-check happen in v31 (safety_on_minor_report)
  return new;
exception when others then
  raise warning 'wvm_on_report: %', sqlerrm;
  return new;
end $$;
drop trigger if exists wvm_on_report_v40 on public.reports;
create trigger wvm_on_report_v40 after insert on public.reports for each row execute function public.wvm_on_report();

-- ─────────────────────────────────────────────────────────────
-- 6 · selfie faces: only a picture the media-scan function cleared ever reaches profiles.avatar.face
--     The mall uploads the face to storage 'posts/<uid>/wvm-face-*.webp' (allofus upload gate: adults, 72 h+ accounts).
--     storage intake → media_items (pending while server_scan_required) → Hive → media_scan_result → this trigger
--     copies the URL into profiles.avatar.face. Removed / quarantined later = the face disappears.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wvm_faces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  url text, media_id bigint,                         -- the cleared face (what others see)
  pending_url text, pending_path text, pending_media bigint, pending_at timestamptz,
  updated_at timestamptz default now());
alter table public.wvm_faces enable row level security;
revoke all on public.wvm_faces from anon, authenticated;
grant select on public.wvm_faces to authenticated;
drop policy if exists "wvm faces own read" on public.wvm_faces;
create policy "wvm faces own read" on public.wvm_faces for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.wvm_face_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text; ok_url text; v_path text; m record; pfx text;
begin
  if coalesce(current_setting('wvm.face_sys', true), '') = '1' then return new; end if;
  f := nullif(new.avatar->>'face', '');
  if f is null then return new; end if;
  if tg_op = 'UPDATE' and f is not distinct from nullif(old.avatar->>'face', '') then return new; end if;
  select w.url into ok_url from public.wvm_faces w where w.user_id = new.id;
  if f = ok_url then return new; end if;
  pfx := 'https://izfccjaznlcffvjxawya.supabase.co/storage/v1/object/public/posts/' || new.id::text || '/';
  if left(f, length(pfx)) = pfx and substr(f, length(pfx) + 1) ~ '^[A-Za-z0-9._-]{1,100}$' then
    v_path := new.id::text || '/' || substr(f, length(pfx) + 1);
    select mi.id, mi.status into m from public.media_items mi where mi.bucket = 'posts' and mi.path = v_path;
    if m.id is not null and m.status = 'ok' then
      insert into public.wvm_faces (user_id, url, media_id, updated_at) values (new.id, f, m.id, now())
      on conflict (user_id) do update set url = excluded.url, media_id = excluded.media_id, pending_url = null, pending_path = null, pending_media = null, updated_at = now();
      return new;
    end if;
    insert into public.wvm_faces (user_id, pending_url, pending_path, pending_media, pending_at, updated_at) values (new.id, f, v_path, m.id, now(), now())
    on conflict (user_id) do update set pending_url = excluded.pending_url, pending_path = excluded.pending_path, pending_media = excluded.pending_media, pending_at = now(), updated_at = now();
  end if;
  -- not cleared yet (or not ours at all, e.g. a data: URL): others keep seeing the last cleared face, or none
  new.avatar := case when ok_url is null then new.avatar - 'face' else jsonb_set(new.avatar, '{face}', to_jsonb(ok_url)) end;
  return new;
end $$;
drop trigger if exists wvm_face_guard_v40 on public.profiles;
create trigger wvm_face_guard_v40 before insert or update of avatar on public.profiles
  for each row execute function public.wvm_face_guard();

create or replace function public.wvm_face_media() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.wvm_faces%rowtype;
begin
  if new.bucket not in ('posts', 'quarantine') then return new; end if;
  for w in select * from public.wvm_faces f
            where f.pending_media = new.id or f.media_id = new.id
               or (f.pending_media is null and f.pending_path = new.path and new.bucket = 'posts') loop
    perform set_config('wvm.face_sys', '1', true);
    if (w.pending_media = new.id or (w.pending_media is null and w.pending_path = new.path)) and new.status = 'ok' and new.bucket = 'posts' then
      update public.wvm_faces set url = w.pending_url, media_id = new.id, pending_url = null, pending_path = null, pending_media = null, updated_at = now() where user_id = w.user_id;
      update public.profiles set avatar = jsonb_set(coalesce(avatar, '{}'::jsonb), '{face}', to_jsonb(w.pending_url)) || jsonb_build_object('v', (extract(epoch from now()) * 1000)::bigint) where id = w.user_id;
    elsif w.pending_media is null and w.pending_path = new.path then
      update public.wvm_faces set pending_media = new.id where user_id = w.user_id;
    elsif w.media_id = new.id and (new.status <> 'ok' or new.bucket <> 'posts') then
      update public.wvm_faces set url = null, media_id = null, updated_at = now() where user_id = w.user_id;
      update public.profiles set avatar = coalesce(avatar, '{}'::jsonb) - 'face' where id = w.user_id and avatar->>'face' = w.url;
    elsif w.pending_media = new.id and new.status in ('removed', 'quarantined', 'csam_suspect') then
      update public.wvm_faces set pending_url = null, pending_path = null, pending_media = null, updated_at = now() where user_id = w.user_id;
    end if;
    perform set_config('wvm.face_sys', '', true);
  end loop;
  return new;
exception when others then
  perform set_config('wvm.face_sys', '', true);
  raise warning 'wvm_face_media: %', sqlerrm;
  return new;
end $$;
drop trigger if exists wvm_face_media_v40 on public.media_items;
create trigger wvm_face_media_v40 after insert or update of status, bucket on public.media_items
  for each row execute function public.wvm_face_media();

-- 6c · ONE-TIME CLEANUP: selfie faces saved before today were raw data: pictures nobody scanned, readable by anyone
--      through the public profiles table. They are removed here. Members keep their face on their own device and it is
--      re-uploaded (and scanned) the next time they open the mall. NOTE: allofus.one reads the same avatar.face; its
--      faces disappear until allofus uploads faces the same way (see SHIELD.md → "For allofus.one").
update public.profiles set avatar = avatar - 'face' where avatar ? 'face' and coalesce(avatar->>'face', '') like 'data:%';

-- ─────────────────────────────────────────────────────────────
-- 7 · Prize Hunt: one prize per person, server-checked
-- ─────────────────────────────────────────────────────────────
-- the prize tables (same as worldvrmall-v39.sql; no-ops where they already exist)
create table if not exists public.prizes (id text primary key, title text not null, value int, claimed_at timestamptz, claimed_by uuid);
alter table public.prizes add column if not exists claimed_at timestamptz;
alter table public.prizes add column if not exists claimed_by uuid;
insert into public.prizes (id, title, value) values
  ('wholefoods20', '$20 Whole Foods Market gift card', 20),
  ('painting', 'Original abstract painting by Zachary Wennstedt', 1500),
  ('gas50', '$50 gas card', 50),
  ('funnel5000', 'Optimized sales funnel landing page', 5000)
on conflict (id) do nothing;
alter table public.prizes enable row level security;
drop policy if exists "prizes readable" on public.prizes;
create policy "prizes readable" on public.prizes for select using (true);
create table if not exists public.prize_claims (
  id bigint generated always as identity primary key,
  prize text references public.prizes(id), user_id uuid, name text, email text, phone text, address text,
  code text, page text, status text default 'pending', created_at timestamptz default now());
alter table public.prize_claims enable row level security;
drop policy if exists "admins read claims" on public.prize_claims;
create policy "admins read claims" on public.prize_claims for select using (public.is_admin());
drop policy if exists "admins update claims" on public.prize_claims;
create policy "admins update claims" on public.prize_claims for update using (public.is_admin());
alter table public.prizes add column if not exists active boolean not null default true;
alter table public.prize_claims add column if not exists email_norm text;
alter table public.prize_claims add column if not exists phone_digits text;
alter table public.prize_claims add column if not exists addr_norm text;
alter table public.prize_claims add column if not exists ip_hash text;
create index if not exists prize_claims_dedupe_v40 on public.prize_claims (email_norm, phone_digits, addr_norm);

create or replace function public.wvm_email_norm(e text) returns text language sql immutable as $$
  select case when split_part(lower(btrim(coalesce(e, ''))), '@', 2) in ('gmail.com', 'googlemail.com')
              then replace(split_part(split_part(lower(btrim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
              else split_part(split_part(lower(btrim(coalesce(e, ''))), '@', 1), '+', 1) || '@' || split_part(lower(btrim(coalesce(e, ''))), '@', 2) end;
$$;
create or replace function public.wvm_ip_hash() returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  begin v := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1); exception when others then v := ''; end;
  if coalesce(btrim(v), '') = '' then return null; end if;
  return encode(sha256(convert_to('wvm:' || btrim(v), 'UTF8')), 'hex');
end $$;
revoke all on function public.wvm_ip_hash() from public, anon, authenticated;

create or replace function public.claim_prize(p_prize text, p_name text, p_email text, p_phone text, p_address text, p_code text, p_page text)
returns text language plpgsql security definer set search_path = public as $$
declare taken timestamptz; act boolean; uid uuid := auth.uid(); en text; ph text; ad text; ip text := public.wvm_ip_hash();
begin
  if char_length(coalesce(p_name, '')) < 2 or coalesce(p_email, '') !~ '^\S+@\S+\.\S+$' then return 'invalid'; end if;
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if char_length(ph) < 10 then return 'invalid'; end if;
  en := public.wvm_email_norm(p_email);
  ad := nullif(regexp_replace(lower(coalesce(p_address, '')), '[^a-z0-9]', '', 'g'), '');
  -- 18+ only (rules §2): a signed-in minor / restricted / held / banned account cannot claim
  if uid is not null and (public.safety_is_minor(uid)
       or coalesce((select s.held or s.banned from public.member_safety s where s.user_id = uid), false)) then return 'ineligible'; end if;
  -- attempt limits: per IP and per email, whatever the outcome
  if ip is not null and not public.wvm_rate_hit('ip:' || ip || ':prize', 5, 3600) then return 'limit'; end if;
  if not public.wvm_rate_hit('e:' || en || ':prize', 4, 3600) then return 'limit'; end if;
  -- one prize per person and per household (account, email, phone, address); late claims do not count
  if exists (select 1 from public.prize_claims c where coalesce(c.status, 'pending') not in ('rejected', 'late')
               and ((uid is not null and c.user_id = uid) or c.email_norm = en or lower(c.email) = lower(p_email)
                    or c.phone_digits = ph or (ad is not null and c.addr_norm = ad))) then return 'limit'; end if;
  select claimed_at, active into taken, act from public.prizes where id = p_prize for update;
  if not found or not coalesce(act, true) then return 'invalid'; end if;
  if taken is not null then
    insert into public.prize_claims (prize, user_id, name, email, phone, address, code, page, status, email_norm, phone_digits, addr_norm, ip_hash)
      values (p_prize, uid, left(p_name, 80), left(p_email, 120), left(p_phone, 30), left(p_address, 200), left(p_code, 60), left(p_page, 20), 'late', en, ph, ad, ip);
    return 'taken'; end if;
  update public.prizes set claimed_at = now(), claimed_by = uid where id = p_prize;
  insert into public.prize_claims (prize, user_id, name, email, phone, address, code, page, email_norm, phone_digits, addr_norm, ip_hash)
    values (p_prize, uid, left(p_name, 80), left(p_email, 120), left(p_phone, 30), left(p_address, 200), left(p_code, 60), left(p_page, 20), en, ph, ad, ip);
  return 'won';
end $$;
grant execute on function public.claim_prize(text, text, text, text, text, text, text) to anon, authenticated;

-- leads: same contract as allofus v14 (returns the new id as bigint; World VR Mall store / investor / bug forms and allofus
-- Brand-build forms share it), plus per-IP and per-email limits and a safe website link. NOTE: worldvrmall-v39.sql tried to
-- redefine this as "returns text", which Postgres refuses; that is why this file carries the mall's prize tables too.
create or replace function public.submit_lead(p_kind text, p_name text, p_business text, p_email text, p_phone text, p_website text, p_details text)
returns bigint language plpgsql security definer set search_path = public as $f$
declare ip text := public.wvm_ip_hash(); v_id bigint;
begin
  if ip is not null and not public.wvm_rate_hit('ip:' || ip || ':lead', 12, 3600) then raise exception 'Too many requests. Please try again later.' using errcode = 'P0001'; end if;
  if coalesce(p_email, '') <> '' and not public.wvm_rate_hit('e:' || lower(p_email) || ':lead', 3, 600) then raise exception 'Too many requests. Please try again later.' using errcode = 'P0001'; end if;
  insert into public.leads (user_id, kind, name, business, email, phone, website, details)
    values (auth.uid(), coalesce(left(p_kind, 40), 'brand-build'), left(p_name, 120), left(p_business, 160), left(p_email, 160), left(p_phone, 60), left(public.safety_clean_url(p_website), 240), to_jsonb(left(p_details, 2000)))
    returning id into v_id;
  return v_id;
end $f$;
grant execute on function public.submit_lead(text, text, text, text, text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8 · RLS audit of the mall tables (belt and braces: RLS already blocks; these make the intent explicit)
-- ─────────────────────────────────────────────────────────────
-- prizes: public may read the prize list, NOT who won (claimed_by)
revoke all on public.prizes from anon, authenticated;
grant select (id, title, value, claimed_at, active) on public.prizes to anon, authenticated;
-- claims + leads: only through claim_prize / submit_lead; the admin reads and updates. Nobody deletes.
revoke all on public.prize_claims from anon, authenticated;
grant select, update on public.prize_claims to authenticated;   -- RLS: admin only
revoke all on public.leads from anon, authenticated;
grant select, update on public.leads to authenticated;          -- RLS: admin only
do $$ begin
  execute 'revoke all on sequence public.prize_claims_id_seq from anon, authenticated';
  execute 'revoke all on sequence public.leads_id_seq from anon, authenticated';
exception when others then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- 9 · done. Self-check (run afterwards):
--   select public.wvm_filter_text('text me 555 123 4567');                -- {"ok": false, "hits": ["phone","offsite"], ...}
--   select public.wvm_reserved_name('W0rld VR Mall Staff');               -- true
--   select polname from pg_policy where polname like 'wvm%';              -- wvm rt read, wvm rt write, wvm events admin read, wvm faces own read
--   select key, value from public.safety_settings where key like 'wvm%';
--   -- RLS audit: any public table WITHOUT row level security (should be none), and any write policy that is just "true":
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
--   select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and cmd <> 'SELECT' and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');
-- ─────────────────────────────────────────────────────────────
