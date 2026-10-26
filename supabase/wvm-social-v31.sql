-- ============================================================
-- World VR Mall · social layer (allofus numbering: v31, run AFTER allofus v30). Oct 25 2026
-- Run once in Supabase -> SQL Editor (the SAME project as allofus.one). Additive, idempotent, safe to re-run.
-- Needs allofus.one v26-safety + v26-features + v27-security to have run first (they did, Oct 23 2026):
--   public.safety_is_adult / safety_blocked / safety_connected / is_admin, public.circles + circle_members, public.presence.
--
-- What it adds (nothing here touches an allofus table's rows or policies):
--   1. public.wvm_presence     where you are inside the mall (page, store, nearest place, x/z, level) + your plaza opt-in.
--                              Only people allowed to see you can read your row (rule in wvm_can_see).
--   2. public.wvm_can_see()    THE rule for who sees whom in the mall:
--                                both confirmed adults, neither blocked the other, AND
--                                (allofus connection  OR  one is in a Circle the other owns  OR  both opted into the public plaza)
--   3. public.wvm_people()     the people you may see who are in the mall right now (with their spot, for "join them").
--   4. public.wvm_my_people()  all your connections + circle people, online or not (the Messages list).
--   5. public.wvm_social_me()  am I a confirmed adult (plaza + messaging need it)?
--   6. Realtime private topics 'wvm-u:<user id>': you alone broadcast your live position there; only people
--      wvm_can_see() allows can subscribe. Replaces the old public 'mpos-*' channels (anyone could listen).
--
-- Messages and connection requests use the allofus tables (public.messages, public.connections) and their existing
-- adults-only / not-blocked policies: no mall copies, so a chat started in the mall continues on allofus.one and back.
-- ============================================================

-- ---------- 1. where you are in the mall ----------
create table if not exists public.wvm_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  page text not null default 'mall' check (page in ('outside', 'mall', 'store')),
  store text check (store is null or store ~ '^[a-z0-9-]{1,60}$'),
  place text check (place is null or place ~ '^[A-Za-z0-9_-]{1,40}$'),
  place_name text check (place_name is null or char_length(place_name) <= 60),
  x real check (x is null or x between -5000 and 5000),
  z real check (z is null or z between -5000 and 5000),
  level smallint not null default 0 check (level between -5 and 20),
  plaza boolean not null default false,
  last_seen timestamptz not null default now());
alter table public.wvm_presence enable row level security;
revoke all on public.wvm_presence from anon;
create index if not exists wvm_presence_seen_idx on public.wvm_presence (last_seen desc);

-- the place name is shown to other people: plain words only (no links, no markup)
create or replace function public.wvm_presence_guard() returns trigger language plpgsql set search_path = public as $$
begin
  new.last_seen := now();
  if new.place_name is not null then
    new.place_name := nullif(btrim(left(regexp_replace(regexp_replace(new.place_name, '<[^>]*>', '', 'g'),
                        '(https?://|www\.)\S*|\S+\.[a-z]{2,6}(/\S*)?(\s|$)|[<>"''`]', ' ', 'gi'), 60)), '');
  end if;
  return new;
end $$;
drop trigger if exists wvm_presence_guard on public.wvm_presence;
create trigger wvm_presence_guard before insert or update on public.wvm_presence for each row execute function public.wvm_presence_guard();

-- ---------- 2. the rule ----------
create or replace function public.wvm_share_circle(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.circle_members m where (m.owner_id = a and m.member_id = b) or (m.owner_id = b and m.member_id = a));
$$;
revoke all on function public.wvm_share_circle(uuid, uuid) from public, anon, authenticated;

create or replace function public.wvm_can_see(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and target is not null and (
    viewer = target
    or (
      public.safety_is_adult(viewer) and public.safety_is_adult(target)
      and not public.safety_blocked(viewer, target) and not public.safety_blocked(target, viewer)
      and (
        public.safety_connected(viewer, target)
        or public.wvm_share_circle(viewer, target)
        or (exists (select 1 from public.wvm_presence w where w.user_id = viewer and w.plaza and w.last_seen > now() - interval '3 minutes')
            and exists (select 1 from public.wvm_presence w where w.user_id = target and w.plaza and w.last_seen > now() - interval '3 minutes'))
      )));
$$;
revoke all on function public.wvm_can_see(uuid, uuid) from public, anon;
grant execute on function public.wvm_can_see(uuid, uuid) to authenticated;

drop policy if exists "wvm presence own insert" on public.wvm_presence;
create policy "wvm presence own insert" on public.wvm_presence for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "wvm presence own update" on public.wvm_presence;
create policy "wvm presence own update" on public.wvm_presence for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "wvm presence own delete" on public.wvm_presence;
create policy "wvm presence own delete" on public.wvm_presence for delete to authenticated using (user_id = auth.uid());
drop policy if exists "wvm presence visible" on public.wvm_presence;
create policy "wvm presence visible" on public.wvm_presence for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.wvm_can_see(auth.uid(), user_id));

-- ---------- 3. who is here now ----------
drop function if exists public.wvm_people();
create or replace function public.wvm_people()
returns table (user_id uuid, name text, username text, rel text, page text, store text, place text, place_name text,
               x real, z real, level smallint, last_seen timestamptz, avatar jsonb)
language sql stable security definer set search_path = public as $$
  select w.user_id, coalesce(p.display_name, 'Someone'), p.username,
         case when public.safety_connected(auth.uid(), w.user_id) then 'connection'
              when public.wvm_share_circle(auth.uid(), w.user_id) then 'circle' else 'plaza' end,
         w.page, w.store, w.place, w.place_name, w.x, w.z, w.level, w.last_seen, coalesce(p.avatar, '{}'::jsonb)
  from public.wvm_presence w join public.profiles p on p.id = w.user_id
  where auth.uid() is not null and w.user_id <> auth.uid() and w.last_seen > now() - interval '2 minutes'
    and public.wvm_can_see(auth.uid(), w.user_id)
  order by 4, w.last_seen desc
  limit 60;
$$;
revoke all on function public.wvm_people() from public, anon;
grant execute on function public.wvm_people() to authenticated;

-- ---------- 4. my people (Messages list): connections + circle people, online or not ----------
drop function if exists public.wvm_my_people();
create or replace function public.wvm_my_people()
returns table (user_id uuid, name text, username text, rel text, in_mall boolean, mall_page text, mall_place text, on_allofus boolean, unread int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when c.requester = auth.uid() then c.addressee else c.requester end as id
      from public.connections c
     where c.status = 'accepted' and c.kind = 'connect' and auth.uid() in (c.requester, c.addressee)
    union
    select m.member_id from public.circle_members m where m.owner_id = auth.uid()
    union
    select m.owner_id from public.circle_members m where m.member_id = auth.uid()),
  one as (select distinct id from mine where id <> auth.uid())
  select o.id, coalesce(p.display_name, 'Someone'), p.username,
         case when public.safety_connected(auth.uid(), o.id) then 'connection' else 'circle' end,
         (w.user_id is not null), w.page, w.place_name,
         -- allofus presence only for real connections (allofus itself shows it to connections only)
         (public.safety_connected(auth.uid(), o.id) and exists (select 1 from public.presence pr where pr.user_id = o.id and pr.last_seen > now() - interval '3 minutes' and pr."where" <> 'mall')),
         (select count(*)::int from public.messages ms where ms.sender = o.id and ms.recipient = auth.uid() and ms.read_at is null)
  from one o
  join public.profiles p on p.id = o.id
  left join public.wvm_presence w on w.user_id = o.id and w.last_seen > now() - interval '2 minutes'
  where auth.uid() is not null and public.safety_is_adult(auth.uid()) and public.safety_is_adult(o.id)
    and not public.safety_blocked(auth.uid(), o.id) and not public.safety_blocked(o.id, auth.uid())
  order by 9 desc, 5 desc, 2
  limit 300;
$$;
revoke all on function public.wvm_my_people() from public, anon;
grant execute on function public.wvm_my_people() to authenticated;

-- ---------- 5. me ----------
create or replace function public.wvm_social_me() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('signed_in', auth.uid() is not null, 'adult', coalesce(public.safety_is_adult(auth.uid()), false));
$$;
revoke all on function public.wvm_social_me() from public;
grant execute on function public.wvm_social_me() to anon, authenticated;

-- ---------- 6. Realtime private topics: wvm-u:<user id> ----------
-- Permissive policies OR with allofus's "v27 rt adults read/write" and the shield's "wvm rt read/write" (topics wvm:*);
-- this function says no to every topic that is not 'wvm-u:', so it never widens theirs. Policy names differ on purpose:
-- the shield's file drops and recreates "wvm rt read/write", so sharing a name would silently replace one of them.
create or replace function public.wvm_topic_allowed(t text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); other uuid;
begin
  if uid is null or t is null or t not like 'wvm-u:%' then return false; end if;
  begin other := substr(t, 7)::uuid; exception when others then return false; end;
  if writing then return other = uid and public.safety_is_adult(uid); end if;
  return public.wvm_can_see(uid, other);
end $$;
revoke all on function public.wvm_topic_allowed(text, boolean) from public, anon;
grant execute on function public.wvm_topic_allowed(text, boolean) to authenticated;

do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "wvm social rt read" on realtime.messages';
    execute 'create policy "wvm social rt read" on realtime.messages for select to authenticated using (public.wvm_topic_allowed(realtime.topic(), false))';
    execute 'drop policy if exists "wvm social rt write" on realtime.messages';
    execute 'create policy "wvm social rt write" on realtime.messages for insert to authenticated with check (public.wvm_topic_allowed(realtime.topic(), true))';
  else
    raise notice 'realtime.messages not present here; private-channel policies skipped (Supabase has it).';
  end if;
exception when others then raise warning 'wvm realtime policies: %', sqlerrm; end $$;

-- housekeeping: rows older than a day are useless (the mall deletes yours when you leave, best effort)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wvm-presence-sweep', '17 * * * *', $c$delete from public.wvm_presence where last_seen < now() - interval '1 day'$c$);
  end if;
exception when others then raise notice 'wvm presence sweep not scheduled: %', sqlerrm; end $$;
