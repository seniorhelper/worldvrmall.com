// World VR Mall shield · SQL test (PGlite). Replays the allofus.one SQL chain (v4 → v30), then worldvrmall-v39.sql,
// v31-age-assurance.sql (twice), wvm-shield-v40.sql (twice) and v31 again, then 128 behaviour checks: adults-only live
// social, age levels + vendor results, may-be-a-minor holds, realtime authorization, wvm_send, blocks, reports, auto-mute,
// evidence, rooms (cap / kick / lock), scanned faces, names, prizes. Mocks the auth / storage / realtime schemas.
// Run from any folder with @electric-sql/pglite installed (npm i @electric-sql/pglite):
//   node wvm-shield-test.mjs "<allofus repo>/supabase" "<this repo>/supabase"     → last line "FAILS: 0"
// (v39 printing "cannot change return type" is expected: allofus already owns submit_lead; v40 handles it.)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const SB = process.argv[2];
const db = new PGlite();
const ex = async (sql, label) => { try { await db.exec(sql); return true; } catch (e) { console.log('ERR[' + label + ']', e.message.slice(0, 400)); return false; } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
await ex(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema extensions; create schema realtime;
create table auth.users (id uuid primary key, email text, phone text, created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz, confirmation_sent_at timestamptz, raw_user_meta_data jsonb default '{}', banned_until timestamptz);
create table auth.audit_log_entries (id uuid default gen_random_uuid(), payload json, created_at timestamptz default now(), ip_address text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create table realtime.messages (id uuid default gen_random_uuid(), topic text, extension text, payload jsonb, event text, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema public, auth, storage, realtime to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role; grant all on all tables in schema auth to service_role;
grant all on all tables in schema realtime to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema realtime to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to service_role;
create publication supabase_realtime;
create table public.reports (id bigint generated always as identity primary key, reporter uuid, reported uuid, reason text, resolved boolean default false, created_at timestamptz default now());
alter table public.reports enable row level security;
create policy "reports insert" on public.reports for insert with check (auth.uid() = reporter);
create table public.banned_users (user_id uuid primary key, created_at timestamptz default now());
create function public.is_banned(uid uuid) returns boolean language sql stable as $$ select exists (select 1 from public.banned_users b where b.user_id = uid) $$;
create table public.bugs (id bigint generated always as identity primary key, created_at timestamptz default now(), user_id uuid, kind text, note text, page text, ua text, extra jsonb);
alter table public.bugs enable row level security;
create policy "bugs insert" on public.bugs for insert with check (true);
create policy "bugs read" on public.bugs for select using (true);
create table public.ads (id bigint generated always as identity primary key, owner_id uuid, headline text);
alter table public.ads enable row level security;
create policy "ads read" on public.ads for select using (true);
create policy "ads own" on public.ads for insert with check (auth.uid() = owner_id);
create table public.prizes (id text primary key, title text, value int);
create function public.is_admin() returns boolean language sql stable as $$ select auth.uid() = '320bf5d4-2d2d-482e-8633-87ced55e4155'::uuid $$;
`, 'mock');
const SBA = process.argv[2]; const WVM = process.argv[3];
await ex(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql security definer as $$ insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$; grant execute on function realtime.send(jsonb,text,text,boolean) to anon, authenticated;`, 'rt send mock');
const order = ['schema.sql', 'v4-storage.sql', 'v6-social.sql', 'v7-lake-prize.sql', 'v8-comments.sql', 'allofus-v11.sql', 'allofus-v12.sql', 'allofus-v13.sql', 'allofus-v14.sql', 'allofus-v16.sql', 'ALL-IN-ONE-allofus-v17-to-v19.sql', 'allofus-v19-comm.sql', 'allofus-ALL-v20-v21.sql', 'allofus-v22-lockdown.sql'];
const F = '320bf5d4-2d2d-482e-8633-87ced55e4155', A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', T1 = '33333333-3333-3333-3333-333333333333', T2 = '44444444-4444-4444-4444-444444444444', K = '55555555-5555-5555-5555-555555555555', N = '66666666-6666-6666-6666-666666666666', X = '77777777-7777-7777-7777-777777777777';
await ex(`insert into auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data) values
 ('${F}', 'zach@eyetoad.com', now() - interval '30 days', now(), '{"dob":"1980-01-01"}'),
 ('${A}', 'a@x.com', now() - interval '10 days', now(), '{"dob":"1990-05-05"}'),
 ('${B}', 'b@x.com', now() - interval '10 days', now(), '{"dob":"1991-05-05"}'),
 ('${X}', 'x@x.com', now() - interval '10 days', now(), '{"dob":"1992-05-05"}'),
 ('${T1}', 't1@x.com', now() - interval '10 days', now(), '{"dob":"2011-03-01"}'),
 ('${T2}', 't2@x.com', now() - interval '10 days', now(), '{"dob":"2010-03-01"}'),
 ('${K}', 'kid@x.com', now() - interval '10 days', now(), '{"dob":"2016-03-01"}'),
 ('${N}', 'n@x.com', now() - interval '10 days', now(), '{}');`, 'users');
for (const f of order) { const s = fs.readFileSync(path.join(SBA, f), 'utf8'); await ex(s, f); }
await ex(`grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to anon, authenticated;`, 'grants');
for (const p of ['v26-features', 'v26-safety', 'v27-security', 'v27-growth', 'v28-lockdown', 'v29-match', 'v29b-function-keys', 'v30-rooms-constellations']) await ex(fs.readFileSync(path.join(SBA, '_parts', p + '.sql'), 'utf8'), p);
await ex(`alter table public.prizes add column if not exists claimed_at timestamptz; alter table public.prizes add column if not exists claimed_by uuid;`, 'prize cols');
await ex(`insert into public.profiles (id, username, display_name) values ('${F}','zach','Zach'),('${A}','a','Alice'),('${B}','b','Bob'),('${X}','x','Xena'),('${T1}','t1','Tina'),('${T2}','t2','Tom'),('${K}','k','Kid'),('${N}','n','Nodob') on conflict (id) do nothing;`, 'profiles');
await ex(`grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role;`, 'grants2');
const C = '99999999-9999-9999-9999-999999999999';
await ex(`insert into auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data) values ('${C}', 'c@x.com', now() - interval '10 days', now(), '{"dob":"1985-05-05"}'); insert into public.profiles (id, username, display_name) values ('${C}','c','Cara');`, 'user C');
console.log('v39:', await ex(fs.readFileSync(path.join(WVM, 'worldvrmall-v39.sql'), 'utf8'), 'v39'));
await ex(`update public.profiles set avatar = '{"ch":"hero","face":"data:image/webp;base64,AAAA"}' where id = '${A}';`, 'legacy face');
const v31 = fs.readFileSync(path.join(WVM, 'v31-age-assurance.sql'), 'utf8');
console.log('v31 #1:', await ex(v31, 'v31#1'));
console.log('v31 #2:', await ex(v31, 'v31#2'));
const v40 = fs.readFileSync(path.join(WVM, 'wvm-shield-v40.sql'), 'utf8');
console.log('v40 #1:', await ex(v40, 'v40#1'));
console.log('v40 #2:', await ex(v40, 'v40#2'));
console.log('v31 again after v40:', await ex(v31, 'v31#3'));
await ex(`grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;`, 'grants3');
const as = async (uid, sql, role, topic) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); select set_config('request.jwt.claim.role', '${role || (uid ? 'authenticated' : 'anon')}', false); select set_config('realtime.topic', '${topic || ''}', false); set role ${role || (uid ? 'authenticated' : 'anon')};`); try { const r = await db.query(sql); await db.exec('reset role'); return { ok: true, rows: r.rows }; } catch (e) { await db.exec('reset role'); return { ok: false, err: e.message.slice(0, 200) }; } };
const svc = (sql) => as(null, sql, 'postgres');
const svcRole = (sql) => as(null, sql, 'service_role');
let fails = 0;
const T = async (label, p, expectOk, check) => { const r = await p; let pass = r.ok === expectOk; if (pass && check && r.ok) { try { pass = check(r.rows); } catch (e) { pass = false; } } if (!pass) fails++; console.log((pass ? 'PASS ' : 'FAIL ') + label + ' -> ' + (r.ok ? 'ok ' + JSON.stringify(r.rows).slice(0, 220) : r.err)); };
const one = (r) => r[0][Object.keys(r[0])[0]];
const st = (uid) => as(uid, `select public.wvm_shield_status() s`);

console.log('\n=== levels (no provider yet) ===');
await T('adult A: band adult, level adult_self', st(A), true, r => one(r).band === 'adult' && one(r).level === 'adult_self');
await T('no provider: voice needs adult_self, A can voice', st(A), true, r => one(r).needs.voice === 'adult_self' && one(r).can.voice === true);
await T('teen T1: no band, level guest (18+ only)', st(T1), true, r => one(r).band === null && one(r).level === 'guest' && one(r).minor === true);
await T('under-13 K: guest', st(K), true, r => one(r).level === 'guest');
await T('no DOB N: guest', st(N), true, r => one(r).level === 'guest' && one(r).dob_set === false);
await T('founder: adult', st(F), true, r => one(r).band === 'adult');
await T('anon cannot call status', as(null, `select public.wvm_shield_status()`), false);
await T('profiles.age_level mirrors (A adult_self, T1 guest)', svc(`select id::text, age_level from public.profiles where id in ('${A}','${T1}') order by id`), true, r => r[0].age_level === 'adult_self' && r[1].age_level === 'guest');
await T('member cannot set own age_level', as(A, `update public.profiles set age_level = 'adult_verified' where id = '${A}' returning age_level`), true, r => r[0].age_level === 'adult_self');
await T('safety_is_adult(uid) unchanged for allofus', as(A, `select public.safety_is_adult('${A}'::uuid) a`), true, r => one(r) === true);
await T('safety_is_adult(uid, adult_verified) false for A', as(A, `select public.safety_is_adult('${A}'::uuid, 'adult_verified') a`), true, r => one(r) === false);

console.log('\n=== realtime authorization ===');
const rt = (uid, topic, write) => as(uid, write ? `insert into realtime.messages (topic, extension, payload, event, private) values ('${topic}', 'broadcast', '{}', 'pos', true) returning topic` : `select count(*)::int n from realtime.messages where topic = '${topic}'`, null, topic);
await ex(`insert into realtime.messages (topic, extension, payload, event, private) values ('wvm:a:outside:pos:0_0_0','broadcast','{"x":1}','pos',true),('wvm:u:${A}','broadcast','{"x":3}','hug_req',true),('wvm:a:room-gather','broadcast','{}','x',true);`, 'seed rt');
await T('adult reads adult positions', rt(A, 'wvm:a:outside:pos:0_0_0'), true, r => r[0].n === 1);
await T('teen CANNOT read live positions', rt(T1, 'wvm:a:outside:pos:0_0_0'), true, r => r[0].n === 0);
await T('guest CANNOT read', rt(null, 'wvm:a:outside:pos:0_0_0'), true, r => r[0].n === 0);
await T('no-DOB CANNOT read', rt(N, 'wvm:a:outside:pos:0_0_0'), true, r => r[0].n === 0);
await T('old teen topic refused', rt(T1, 'wvm:t:outside', true), false);
await T('adult writes position', rt(A, 'wvm:a:outside:pos:0_0_0', true), true);
await T('teen CANNOT write', rt(T1, 'wvm:a:outside', true), false);
await T('adult joins voice (no provider)', rt(A, 'wvm:a:outside:voice', true), true);
await T('A reads own inbox', rt(A, 'wvm:u:' + A), true, r => r[0].n === 1);
await T('B CANNOT read A inbox', rt(B, 'wvm:u:' + A), true, r => r[0].n === 0);
await T('A CANNOT write to B inbox (spoof)', rt(A, 'wvm:u:' + B, true), false);
await T('weird topic refused', rt(A, 'wvm:a:x:evil', true), false);

console.log('\n=== wvm_send ===');
await T('A hugs B', as(A, `select public.wvm_send('${B}', 'hug_req', '{"page":"outside"}') r`), true, r => one(r).ok === true);
await T('stamped with real sender', svc(`select payload from realtime.messages where topic = 'wvm:u:${B}' order by inserted_at desc limit 1`), true, r => r[0].payload.from === A && r[0].payload.v === 'srv' && r[0].payload.name === 'Alice');
await T('spoofed from overwritten', as(A, `select public.wvm_send('${B}', 'wave', '{"from":"${F}","name":"Zach (staff)"}') r`), true, r => one(r).ok);
await T('...B sees A, not Zach', svc(`select payload from realtime.messages where topic = 'wvm:u:${B}' and event = 'wave'`), true, r => r[0].payload.from === A && r[0].payload.name === 'Alice');
await T('A CANNOT hug teen T1', as(A, `select public.wvm_send('${T1}', 'hug_req', '{}') r`), true, r => one(r).ok === false);
await T('T1 CANNOT message A', as(T1, `select public.wvm_send('${A}', 'msg', '{"text":"hi"}') r`), true, r => one(r).ok === false);
await T('teens cannot hug each other (no live social under 18)', as(T1, `select public.wvm_send('${T2}', 'hug_req', '{}') r`), true, r => one(r).ok === false);
await T('second hug within 30s refused', as(A, `select public.wvm_send('${B}', 'hug_req', '{}') r`), true, r => one(r).ok === false);
await T('msg with phone refused', as(A, `select public.wvm_send('${B}', 'msg', '{"text":"text me 555 123 4567"}') r`), true, r => one(r).ok === false);
await T('msg with snapchat ask refused', as(A, `select public.wvm_send('${B}', 'msg', '{"text":"add me on snap"}') r`), true, r => one(r).ok === false);
await T('msg with gift card ask refused', as(A, `select public.wvm_send('${B}', 'msg', '{"text":"send me a gift card"}') r`), true, r => one(r).ok === false);
await T('clean msg passes', as(A, `select public.wvm_send('${B}', 'msg', '{"text":"meet me at the fountain, rounds of golf after?"}') r`), true, r => one(r).ok === true);
await T('unknown event refused', as(A, `select public.wvm_send('${B}', 'rickroll', '{}') r`), true, r => one(r).ok === false);
await T('too-big payload refused', as(A, `select public.wvm_send('${B}', 'wave', jsonb_build_object('x', repeat('a', 5000))) r`), true, r => one(r).ok === false);
await T('6 KB voice offer accepted', as(A, `select public.wvm_send('${C}', 'sig', jsonb_build_object('t', 'offer', 'sdp', repeat('a', 6000))) r`), true, r => one(r).ok === true);
await T('13 KB voice payload refused', as(A, `select public.wvm_send('${C}', 'sig', jsonb_build_object('t', 'offer', 'sdp', repeat('a', 13000))) r`), true, r => one(r).ok === false);
await T('anon cannot wvm_send', as(null, `select public.wvm_send('${B}', 'wave', '{}')`), false);

console.log('\n=== provider configured: voice / video need adult_verified ===');
await ex(`update public.safety_settings set value = '"yoti"' where key = 'age_provider';`, 'provider yoti');
await T('voice now needs adult_verified', st(A), true, r => one(r).needs.voice === 'adult_verified' && one(r).can.voice === false && one(r).can.text === true);
await T('A (adult_self) voice signaling refused', as(A, `select public.wvm_send('${C}', 'sig', '{"t":"offer"}') r`), true, r => one(r).ok === false && one(r).needs === 'adult_verified');
await T('A (adult_self) cannot join voice topic', rt(A, 'wvm:a:outside:voice', true), false);
await T('A (adult_self) can still message', as(A, `select public.wvm_send('${C}', 'msg', '{"text":"hello"}') r`), true, r => one(r).ok === true);
await T('member cannot fake an age result', as(A, `select public.age_check_result('yoti', 'sess-A', '{"status":"passed"}')`), false);
await T('service logs a started check', svcRole(`select public.age_check_start('${A}', 'yoti', 'sess-A', 'voice') r`), true, r => one(r).ok === true);
await T('service applies the passed result', svcRole(`select public.age_check_result('yoti', 'sess-A', '{"status":"passed","method":"AGE_ESTIMATION","age_band":"25+","image":"xxx"}') r`), true, r => one(r).status === 'passed');
await T('A is adult_verified, can voice', st(A), true, r => one(r).level === 'adult_verified' && one(r).can.voice === true);
await T('no image stored', svc(`select result from public.age_checks where session_ref = 'sess-A'`), true, r => !('image' in r[0].result));
await T('profiles.age_level = adult_verified', svc(`select age_level from public.profiles where id = '${A}'`), true, r => r[0].age_level === 'adult_verified');
await T('A reads own check, B cannot', as(B, `select count(*)::int n from public.age_checks`), true, r => r[0].n === 0);
await T('verified A voice signaling to C passes level check', as(A, `select public.wvm_send('${B}', 'sig', '{"t":"offer"}') r`), true, r => one(r).ok === true);
await T('3 starts a day max', svcRole(`select public.age_check_start('${C}', 'yoti', 'c1') a, public.age_check_start('${C}', 'yoti', 'c2') b, public.age_check_start('${C}', 'yoti', 'c3') c, public.age_check_start('${C}', 'yoti', 'c4') d`), true, r => r[0].d.ok === false);

console.log('\n=== may be a minor ===');
await T('B reports C as may_be_minor', as(B, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category) values ('${B}', '${C}', 'mm', 'wvm_player', '${C}', 'may_be_minor') returning id`), true);
await T('C held + recheck, level guest (hidden)', st(C), true, r => one(r).held === true && one(r).recheck === true && one(r).level === 'guest');
await T('C cannot hug anyone now', as(C, `select public.wvm_send('${B}', 'wave', '{}') r`), true, r => one(r).ok === false);
await T('C passes a re-check → released', svcRole(`select public.age_check_result('yoti', 'c1', '{"status":"passed","method":"DOC_SCAN","age_band":"18+ (document)"}') r`), true);
await T('...C back: adult_verified, not held', st(C), true, r => one(r).held === false && one(r).level === 'adult_verified');
await T('report on recently verified A only flags', as(B, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category) values ('${B}', '${A}', 'mm', 'wvm_player', '${A}', 'may_be_minor') returning id`), true);
await T('...A not held', st(A), true, r => one(r).held === false && one(r).level === 'adult_verified');
await T('no-DOB reporter N cannot hold B', as(N, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category) values ('${N}', '${B}', 'mm', 'wvm_player', '${B}', 'may_be_minor') returning id`), true);
await T('...B not held', st(B), true, r => one(r).held === false);
await ex(`update public.safety_settings set value = '"none"' where key = 'age_provider';`, 'provider none');

console.log('\n=== blocks ===');
await T('B blocks X', as(B, `update public.profiles set blocked = array['${X}']::uuid[] where id = '${B}' returning id`), true, r => r.length === 1);
await T('X cannot hug B', as(X, `select public.wvm_send('${B}', 'hug_req', '{}') r`), true, r => one(r).ok === false && one(r).error === 'not available');
await T('B cannot hug X', as(B, `select public.wvm_send('${X}', 'hug_req', '{}') r`), true, r => one(r).ok === false);
await T('X sees B in block pairs', as(X, `select public.wvm_block_pairs(array['${B}','${A}']::uuid[]) r`), true, r => one(r).length === 1);

console.log('\n=== reports, auto-mute, evidence ===');
await T('A reports X', as(A, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category, evidence) values ('${A}', '${X}', 'r', 'wvm_player', '${X}', 'harassment', '{"name":"Xena"}') returning id`), true);
await T('evidence snapshot written', as(F, `select count(*)::int n from public.mod_evidence where kind = 'wvm_player' and user_id = '${X}'`), true, r => r[0].n === 1);
await T('X not muted after 1', st(X), true, r => one(r).muted === false);
await T('B reports X too', as(B, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category) values ('${B}', '${X}', 'r', 'wvm_player', '${X}', 'spam') returning id`), true);
await T('X auto-muted after 2', st(X), true, r => one(r).muted === true);
await T('muted X cannot write main', rt(X, 'wvm:a:outside', true), false);
await T('muted X can still walk', rt(X, 'wvm:a:outside:pos:0_0_0', true), true);
await T('muted X cannot signal voice', as(X, `select public.wvm_send('${A}', 'sig', '{}') r`), true, r => one(r).ok === false);
await T('child-safety report on T2 → held', as(T1, `insert into public.reports (reporter, reported, reason, target_kind, target_id, category) values ('${T1}', '${T2}', 'cs', 'wvm_player', '${T2}', 'child_safety') returning id`), true);
await T('...T2 held', st(T2), true, r => one(r).held === true);
await T('child-safety evidence on hold', as(F, `select hold from public.mod_evidence where user_id = '${T2}' and kind = 'wvm_player'`), true, r => r[0].hold === true);
await T('reporter cannot read evidence', as(T1, `select count(*)::int n from public.mod_evidence`), true, r => r[0].n === 0);
await T('member cannot read wvm_events', as(A, `select count(*)::int n from public.wvm_events`), true, r => r[0].n === 0);
await T('admin reads wvm_events', as(F, `select count(*)::int n from public.wvm_events`), true, r => r[0].n >= 3);

console.log('\n=== rooms ===');
await T('teen cannot open a room', as(T1, `select public.wvm_room_open('gather', 'Gathering', 2) r`), true, r => one(r).ok === false);
await T('A opens room "gather" cap 2', as(A, `select public.wvm_room_open('gather', 'Gathering', 2) r`), true, r => one(r).i_am_host === true && one(r).cap === 2);
await T('A joins', as(A, `select public.wvm_room_join('gather') r`), true, r => one(r).member === true);
await T('B joins', as(B, `select public.wvm_room_join('gather') r`), true, r => one(r).member === true && one(r).count === 2);
await T('C refused: full', as(C, `select public.wvm_room_join('gather') r`), true, r => one(r).ok === false && /full/.test(one(r).error));
await T('member B reads room topic', rt(B, 'wvm:a:room-gather'), true, r => r[0].n === 1);
await T('non-member C cannot read room topic', rt(C, 'wvm:a:room-gather'), true, r => r[0].n === 0);
await T('B (not host) cannot kick', as(B, `select public.wvm_room_kick('gather', '${A}') r`), true, r => one(r).ok === false);
await T('host A kicks B', as(A, `select public.wvm_room_kick('gather', '${B}') r`), true, r => one(r).ok === true);
await T('kicked B loses room topic', rt(B, 'wvm:a:room-gather'), true, r => r[0].n === 0);
await T('kicked B cannot rejoin for 24 h', as(B, `select public.wvm_room_join('gather') r`), true, r => one(r).ok === false);
await T('B got a server-stamped kick notice', svc(`select count(*)::int n from realtime.messages where topic = 'wvm:u:${B}' and event = 'room_kick'`), true, r => r[0].n === 1);
await T('host locks room', as(A, `select public.wvm_room_set('gather', true, null) r`), true, r => one(r).locked === true);
await T('C refused: locked', as(C, `select public.wvm_room_join('gather') r`), true, r => one(r).ok === false && /locked/.test(one(r).error));
await T('host cannot raise cap above the site max', as(A, `select public.wvm_room_set('gather', false, 500) r`), true, r => one(r).cap === 16);
await T('teen cannot join a room', as(T1, `select public.wvm_room_join('gather') r`), true, r => one(r).ok === false);

console.log('\n=== faces ===');
await T('legacy data: face stripped by cleanup', svc(`select avatar from public.profiles where id = '${A}'`), true, r => !('face' in r[0].avatar));
await T('A sets a data: face → stripped', as(A, `update public.profiles set avatar = '{"ch":"hero","face":"data:image/png;base64,BBBB"}' where id = '${A}' returning avatar`), true, r => !('face' in r[0].avatar));
await T('A sets a foreign URL face → stripped', as(A, `update public.profiles set avatar = '{"ch":"hero","face":"https://evil.example/x.png"}' where id = '${A}' returning avatar`), true, r => !('face' in r[0].avatar));
const furl = `https://izfccjaznlcffvjxawya.supabase.co/storage/v1/object/public/posts/${A}/wvm-face-1.webp`;
await ex(`update public.safety_settings set value = 'true' where key = 'server_scan_required';`, 'flag on');
await T('A uploads face', as(A, `insert into storage.objects (bucket_id, name, owner, metadata) values ('posts', '${A}/wvm-face-1.webp', '${A}', '{"mimetype":"image/webp"}') returning name`), true);
await T('media row pending', as(F, `select status from public.media_items where path = '${A}/wvm-face-1.webp'`), true, r => r[0].status === 'pending');
await T('pending face hidden', as(A, `update public.profiles set avatar = '{"ch":"hero","face":"${furl}"}' where id = '${A}' returning avatar`), true, r => !('face' in r[0].avatar));
await T('scanner ok', as(null, `select public.media_scan_result((select id from public.media_items where path = '${A}/wvm-face-1.webp'), '{"verdict":"ok","provider":"hive"}') r`, 'service_role'), true);
await T('...face appears', svc(`select avatar->>'face' f from public.profiles where id = '${A}'`), true, r => r[0].f === furl);
await T('re-save keeps face', as(A, `update public.profiles set avatar = jsonb_set(avatar, '{ch}', '"punk"') where id = '${A}' returning avatar->>'face' f`), true, r => r[0].f === furl);
await T('admin removes it', as(F, `update public.media_items set status = 'removed' where path = '${A}/wvm-face-1.webp' returning id`), true);
await T('...face gone', svc(`select avatar->>'face' f from public.profiles where id = '${A}'`), true, r => r[0].f === null);
await T('teen cannot upload a face', as(T1, `insert into storage.objects (bucket_id, name, owner, metadata) values ('posts', '${T1}/wvm-face-1.webp', '${T1}', '{"mimetype":"image/webp"}') returning name`), false);

console.log('\n=== names ===');
await T('rename to "WVM Staff" refused', as(B, `update public.profiles set display_name = 'W0rld VR Mall Staff' where id = '${B}'`), false);
await T('rename to phone refused', as(B, `update public.profiles set display_name = 'call 555 123 4567' where id = '${B}'`), false);
await T('normal rename ok', as(B, `update public.profiles set display_name = 'Bobby' where id = '${B}' returning display_name`), true);
await ex(`insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'admin@x.com')`, 'u8');
await T('new profile "admin" → placeholder', as('88888888-8888-8888-8888-888888888888', `insert into public.profiles (id, display_name) values ('88888888-8888-8888-8888-888888888888', 'admin') returning display_name`), true, r => /^Member /.test(r[0].display_name));
await T('founder may use staff name', as(F, `update public.profiles set display_name = 'Zach · World VR Mall' where id = '${F}' returning display_name`), true);

console.log('\n=== prizes ===');
await T('anon cannot read claimed_by', as(null, `select claimed_by from public.prizes`), false);
await T('anon reads prize list', as(null, `select id, title, value, claimed_at from public.prizes`), true, r => r.length >= 4);
await T('guest claims gas50', as(null, `select public.claim_prize('gas50','Pat Doe','Pat.Doe+x@gmail.com','303-555-1212','1 Main St','C1','outside') r`), true, r => one(r) === 'won');
await T('gmail dots → limit', as(null, `select public.claim_prize('painting','Pat D','patdoe@gmail.com','720-555-0000','2 Elm','C2','outside') r`), true, r => one(r) === 'limit');
await T('same phone → limit', as(null, `select public.claim_prize('painting','Pat D','other@x.com','(303) 555-1212','3 Oak','C3','outside') r`), true, r => one(r) === 'limit');
await T('same household → limit', as(null, `select public.claim_prize('painting','Sam D','sam@x.com','720-555-9999','1 main st.','C4','outside') r`), true, r => one(r) === 'limit');
await T('teen account cannot claim', as(T1, `select public.claim_prize('painting','Tina','tina@x.com','720-555-7777','9 Pine','C5','outside') r`), true, r => one(r) === 'ineligible');
await T('late claim does not block', as(null, `select public.claim_prize('gas50','Lee','lee@x.com','720-555-4444','5 Ash','C6','outside') r`), true, r => one(r) === 'taken');
await T('...later win ok', as(null, `select public.claim_prize('painting','Lee','lee@x.com','720-555-4444','5 Ash','C7','outside') r`), true, r => one(r) === 'won');
await T('anon cannot read claims', as(null, `select count(*) from public.prize_claims`), false);
await T('member cannot read claims', as(A, `select count(*)::int n from public.prize_claims`), true, r => r[0].n === 0);
await T('member cannot insert claim', as(A, `insert into public.prize_claims (prize, name, email) values ('wholefoods20','x','x@x.com')`), false);
await T('member cannot delete claims', as(A, `delete from public.prize_claims returning id`), false);
await T('submit_lead returns id (allofus contract)', as(null, `select public.submit_lead('store','Pat','Biz','p@x.com','303','javascript:alert(1)','{"a":1}') r`), true, r => Number(one(r)) > 0);
await T('...javascript: website stripped', as(F, `select website from public.leads order by id desc limit 1`), true, r => !r[0].website);

console.log('\n=== audit queries ===');
console.log('no RLS:', JSON.stringify((await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).map(r => r.relname)));
console.log('true writes:', JSON.stringify(await q(`select tablename, policyname, cmd from pg_policies where schemaname = 'public' and cmd <> 'SELECT' and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')`)));
console.log('\nFAILS:', fails);
