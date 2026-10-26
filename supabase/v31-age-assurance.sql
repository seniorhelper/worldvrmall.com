-- ============================================================
-- allofus.one + World VR Mall · v31 AGE ASSURANCE (shared, Oct 25 2026)
-- Run in Supabase → SQL Editor AFTER v30-rooms-constellations.sql (allofus) and BEFORE the mall's wvm-shield-v40.sql.
-- Lives in the World VR Mall repo (supabase/v31-age-assurance.sql); copy it into allofus supabase/_parts/ as well.
-- Additive, idempotent, safe to re-run. Drops nothing. No secrets (vendor keys live in Edge Function secrets).
--
-- Three age levels, one gate (no parallel adult check):
--   guest           not signed in, no DOB, under 18, held or banned            → no live social anywhere
--   adult_self      DOB on file 18+ (what public.safety_is_adult() already means) → text messages, seeing friends, hugs
--   adult_verified  adult_self + a one-time third-party age check passed        → voice, live video, The World Fire
--                   (until a provider is configured, adult_self is enough for these too)
-- public.safety_age_level(uid) is the single source; safety_is_adult(uid, level) is the level-aware overload of the
-- existing gate, so allofus Match / Rooms / Constellations keep using safety_is_adult(uid) unchanged.
-- profiles.age_level mirrors the level (computed by the database, members cannot set it) so both sites can show it.
-- "May be a minor" reports: hold (hidden from live social) + forced re-check, reusing member_safety held.
-- ============================================================

-- ── 1 · columns (private member_safety; public mirror on profiles) ──
alter table public.member_safety add column if not exists age_level text;               -- null | 'adult_verified'
alter table public.member_safety add column if not exists age_verified_at timestamptz;
alter table public.member_safety add column if not exists age_provider text;            -- yoti | persona | test | admin
alter table public.member_safety add column if not exists age_ref text;                 -- vendor session / inquiry id
alter table public.member_safety add column if not exists age_band text;                -- e.g. '25+', '18+ (document)'
alter table public.member_safety add column if not exists age_recheck boolean not null default false;
alter table public.member_safety add column if not exists age_recheck_reason text;
alter table public.profiles add column if not exists age_level text default 'guest';

-- ── 2 · settings (next to match_ai_url / safety_sweep_url) ──
insert into public.safety_settings (key, value, secret) values
  ('age_provider', '"none"'::jsonb, false),            -- none | yoti | persona | test   (test = founder account only)
  ('age_check_url', 'null'::jsonb, false),             -- https://<project>.supabase.co/functions/v1/age-check
  ('age_verified_required', 'true'::jsonb, false),     -- voice / video / fire need adult_verified once a provider is set
  ('age_verify_valid_days', '730'::jsonb, false),      -- a passed check counts for this many days
  ('age_minor_report_min_account_hours', '72'::jsonb, false)
on conflict (key) do nothing;

create or replace function public.safety_age_provider() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select s.value #>> '{}' from public.safety_settings s where s.key = 'age_provider'), ''), 'none');
$$;
grant execute on function public.safety_age_provider() to anon, authenticated;

-- ── 3 · the level ──
create or replace function public.safety_age_level(uid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare s public.member_safety%rowtype; days int;
begin
  if uid is null or not public.safety_is_adult(uid) then return 'guest'; end if;
  select * into s from public.member_safety where user_id = uid;
  days := coalesce((select (v.value #>> '{}')::int from public.safety_settings v where v.key = 'age_verify_valid_days'), 730);
  if s.age_level = 'adult_verified' and s.age_verified_at > now() - make_interval(days => days) and not coalesce(s.age_recheck, false) then
    return 'adult_verified'; end if;
  return 'adult_self';
end $$;
grant execute on function public.safety_age_level(uuid) to authenticated;

-- level-aware overload of the existing gate. safety_is_adult(uid) (one argument) is unchanged = adult_self.
create or replace function public.safety_is_adult(uid uuid, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select case coalesce(p_level, 'adult_self')
           when 'adult_verified' then public.safety_age_level(uid) = 'adult_verified'
           when 'guest' then true
           else public.safety_is_adult(uid) end;
$$;
grant execute on function public.safety_is_adult(uuid, text) to authenticated;

-- which level a feature needs right now. text / friends / hugs / rooms: adult_self.
-- voice / video / fire: adult_verified once a provider is configured (and the flag is on), adult_self until then.
create or replace function public.safety_required_level(p_feature text) returns text
language sql stable security definer set search_path = public as $$
  select case when p_feature in ('voice', 'video', 'fire')
                   and public.safety_age_provider() <> 'none'
                   and public.safety_flag('age_verified_required')
              then 'adult_verified' else 'adult_self' end;
$$;
grant execute on function public.safety_required_level(text) to anon, authenticated;

create or replace function public.safety_can(uid uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and (uid = public.founder_id() or public.safety_is_adult(uid, public.safety_required_level(p_feature)));
$$;
revoke all on function public.safety_can(uuid, text) from public, anon;
grant execute on function public.safety_can(uuid, text) to authenticated;

-- ── 4 · keep profiles.adult + profiles.age_level computed by the database ──
create or replace function public.safety_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform public.safety_capture_dob(new.id); end if;
  new.adult := public.safety_is_adult(new.id);
  new.age_level := public.safety_age_level(new.id);
  return new;
end $$;
create or replace function public.safety_sync_profile(uid uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles set adult = public.safety_is_adult(uid), age_level = public.safety_age_level(uid) where id = uid;
$$;
revoke all on function public.safety_sync_profile(uuid) from public, anon, authenticated;
-- member_safety changes (hold, ban, DOB, age check) refresh the public mirror
create or replace function public.safety_member_sync_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set adult = public.safety_is_adult(new.user_id), age_level = public.safety_age_level(new.user_id) where id = new.user_id;
  return new;
end $$;
drop trigger if exists safety_member_sync_v31 on public.member_safety;
create trigger safety_member_sync_v31 after insert or update on public.member_safety for each row execute function public.safety_member_sync_tg();
do $$ begin update public.profiles set age_level = public.safety_age_level(id); exception when others then raise warning 'v31 backfill: %', sqlerrm; end $$;

-- my status for both sites' clients
create or replace function public.my_age() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.member_safety%rowtype;
begin
  if uid is null then return jsonb_build_object('sql', 31, 'level', 'guest', 'signed_in', false, 'provider', public.safety_age_provider()); end if;
  select * into s from public.member_safety where user_id = uid;
  return jsonb_build_object('sql', 31, 'signed_in', true, 'level', public.safety_age_level(uid), 'dob_set', s.dob is not null,
    'provider', public.safety_age_provider(), 'check_url', (select v.value #>> '{}' from public.safety_settings v where v.key = 'age_check_url'),
    'recheck', coalesce(s.age_recheck, false), 'verified_at', s.age_verified_at, 'held', coalesce(s.held, false),
    'needs', jsonb_build_object('voice', public.safety_required_level('voice'), 'video', public.safety_required_level('video'),
                                'fire', public.safety_required_level('fire'), 'text', public.safety_required_level('text')),
    'last_check', (select jsonb_build_object('status', c.status, 'at', coalesce(c.completed_at, c.created_at)) from public.age_checks c where c.user_id = uid order by c.id desc limit 1));
exception when undefined_table then
  return jsonb_build_object('sql', 31, 'signed_in', true, 'level', public.safety_age_level(uid), 'provider', public.safety_age_provider());
end $$;
grant execute on function public.my_age() to authenticated;

-- ── 5 · vendor checks: only the outcome is stored (never the selfie or the document) ──
create table if not exists public.age_checks (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  session_ref text,
  status text not null default 'started',   -- started | passed | failed | error | cancelled | expired
  method text,                              -- e.g. AGE_ESTIMATION | DOC_SCAN | persona-selfie | persona-gov-id
  age_band text,
  reason text,                              -- why this check was asked for (voice, re-check after a report, ...)
  result jsonb,                             -- vendor outcome fields only (status, method, age threshold), no images
  created_at timestamptz default now(),
  completed_at timestamptz);
create unique index if not exists age_checks_ref_v31 on public.age_checks (provider, session_ref) where session_ref is not null;
create index if not exists age_checks_user_v31 on public.age_checks (user_id, id desc);
alter table public.age_checks enable row level security;
revoke all on public.age_checks from anon, authenticated;
grant select on public.age_checks to authenticated;
drop policy if exists "v31 age checks own or admin" on public.age_checks;
create policy "v31 age checks own or admin" on public.age_checks for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- the Edge Function (service role) logs a started check. 3 starts per day per member (each check costs money).
create or replace function public.age_check_start(p_user uuid, p_provider text, p_ref text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (public.safety_is_service() or public.is_admin()) then raise exception 'service role only'; end if;
  if (select count(*) from public.age_checks c where c.user_id = p_user and c.created_at > now() - interval '24 hours') >= 3 and p_user <> public.founder_id() then
    return jsonb_build_object('ok', false, 'error', 'Three age checks a day at most. Please try again tomorrow.'); end if;
  insert into public.age_checks (user_id, provider, session_ref, reason) values (p_user, p_provider, p_ref, left(p_reason, 120)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.age_check_start(uuid, text, text, text) from public, anon;
grant execute on function public.age_check_start(uuid, text, text, text) to authenticated, service_role;

-- the Edge Function reports the outcome (it re-fetched it from the vendor with the server key; webhook bodies are never trusted)
create or replace function public.age_check_result(p_provider text, p_ref text, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.age_checks%rowtype; v_status text := lower(coalesce(p_result->>'status', 'error')); s public.member_safety%rowtype;
begin
  if not (public.safety_is_service() or public.is_admin()) then raise exception 'service role only'; end if;
  select * into c from public.age_checks where provider = p_provider and session_ref = p_ref;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'unknown check'); end if;
  if c.status in ('passed', 'failed') then return jsonb_build_object('ok', true, 'status', c.status, 'already', true); end if;
  if v_status not in ('passed', 'failed', 'error', 'cancelled', 'expired', 'pending') then v_status := 'error'; end if;
  if v_status = 'pending' then return jsonb_build_object('ok', true, 'status', 'pending'); end if;
  update public.age_checks set status = v_status, method = left(p_result->>'method', 40), age_band = left(p_result->>'age_band', 40),
         result = p_result - 'images' - 'image' - 'selfie' - 'document', completed_at = now() where id = c.id;
  if v_status = 'passed' then
    insert into public.member_safety (user_id, age_level, age_verified_at, age_provider, age_ref, age_band)
      values (c.user_id, 'adult_verified', now(), p_provider, p_ref, left(p_result->>'age_band', 40))
    on conflict (user_id) do update set age_level = 'adult_verified', age_verified_at = now(), age_provider = excluded.age_provider,
         age_ref = excluded.age_ref, age_band = excluded.age_band, age_recheck = false, age_recheck_reason = null,
         -- a hold that exists ONLY because of a may-be-a-minor report is released by passing the check
         held = case when public.member_safety.held_reason like 'age re-check%' then false else public.member_safety.held end,
         held_reason = case when public.member_safety.held_reason like 'age re-check%' then null else public.member_safety.held_reason end,
         updated_at = now();
  elsif v_status = 'failed' then
    select * into s from public.member_safety where user_id = c.user_id;
    update public.member_safety set flagged = true, notes = left(coalesce(notes, '') || ' · age check failed ' || now()::date, 500), updated_at = now() where user_id = c.user_id;
    if coalesce(s.age_recheck, false) then
      perform public.notify(public.founder_id(), 'mod', 'Age re-check FAILED', 'A member reported as possibly under 18 failed the age check. The account stays on hold. Review it in Admin → Moderation.', '/?v=admin&what=mod', null);
    end if;
  end if;
  perform public.safety_sync_profile(c.user_id);
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;
revoke all on function public.age_check_result(text, text, jsonb) from public, anon;
grant execute on function public.age_check_result(text, text, jsonb) to authenticated, service_role;

-- admin: mark a member verified by hand (e.g. checked ID in person), or clear a verification
create or replace function public.mod_set_age(p_user uuid, p_verified boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.member_safety (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_verified then
    update public.member_safety set age_level = 'adult_verified', age_verified_at = now(), age_provider = 'admin', age_ref = left(p_note, 120), age_recheck = false, age_recheck_reason = null,
           held = case when held_reason like 'age re-check%' then false else held end,
           held_reason = case when held_reason like 'age re-check%' then null else held_reason end, updated_at = now() where user_id = p_user;
  else
    update public.member_safety set age_level = null, age_verified_at = null, updated_at = now() where user_id = p_user;
  end if;
  perform public.safety_sync_profile(p_user);
  return 'ok';
end $$;
grant execute on function public.mod_set_age(uuid, boolean, text) to authenticated;

-- ── 6 · "this person may be a minor" reports ──
-- category 'may_be_minor' (any surface): the reported account is held (gone from live social everywhere) until it passes an
-- age check or an admin clears it. Guard rails against griefing: the reporter must be an adult with an account at least
-- 72 h old, at most 3 such reports a day count, and an account verified in the last 90 days is only flagged, not held.
create or replace function public.safety_on_minor_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who uuid; s public.member_safety%rowtype; hrs int;
begin
  if new.category is distinct from 'may_be_minor' then return new; end if;
  v_who := coalesce(new.reported, case when new.target_id ~ '^[0-9a-f-]{36}$' then new.target_id::uuid end);
  if v_who is null or v_who = public.founder_id() or v_who = new.reporter then return new; end if;
  hrs := coalesce((select (v.value #>> '{}')::int from public.safety_settings v where v.key = 'age_minor_report_min_account_hours'), 72);
  if not public.safety_is_adult(new.reporter)
     or coalesce((select u.created_at > now() - make_interval(hours => hrs) from auth.users u where u.id = new.reporter), true)
     or (select count(*) from public.reports r where r.reporter = new.reporter and r.category = 'may_be_minor' and r.created_at > now() - interval '24 hours') > 3 then
    insert into public.member_safety (user_id, flagged, notes) values (v_who, true, 'may-be-minor report (not auto-held: reporter limits)')
    on conflict (user_id) do update set flagged = true, updated_at = now();
    return new;
  end if;
  select * into s from public.member_safety where user_id = v_who;
  if s.age_level = 'adult_verified' and s.age_verified_at > now() - interval '90 days' then
    update public.member_safety set flagged = true, notes = left(coalesce(notes, '') || ' · may-be-minor report on a recently verified account', 500), updated_at = now() where user_id = v_who;
    return new;
  end if;
  insert into public.member_safety (user_id, held, held_reason, flagged, age_recheck, age_recheck_reason)
    values (v_who, true, 'age re-check: reported as possibly under 18', true, true, 'report #' || new.id)
  on conflict (user_id) do update set
    held = true, held_reason = coalesce(public.member_safety.held_reason, 'age re-check: reported as possibly under 18'),
    flagged = true, age_recheck = true, age_recheck_reason = 'report #' || new.id, updated_at = now();
  perform public.safety_sync_profile(v_who);
  return new;
exception when others then
  raise warning 'safety_on_minor_report: %', sqlerrm;
  return new;
end $$;
drop trigger if exists safety_on_minor_report_v31 on public.reports;
create trigger safety_on_minor_report_v31 after insert on public.reports for each row execute function public.safety_on_minor_report();

-- ── 7 · self-check ──
--   select public.safety_age_provider();                     -- 'none' until Zach sets a provider
--   select public.safety_required_level('voice');             -- 'adult_self' until then, 'adult_verified' after
--   select age_level, count(*) from public.profiles group by 1;
