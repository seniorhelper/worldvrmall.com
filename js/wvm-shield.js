/* ============================================================
   World VR Mall · the Shield (shield-2, Oct 25 2026)
   The same safety shield allofus.one runs, for the mall's live layer.
   Same Supabase project, same tables: member_safety (date of birth,
   held / banned, age level), reports (+ hash-chained audit_log),
   profiles.blocked, media_items + the Hive media-scan function, mod_evidence.
   The database is the control (supabase/v31-age-assurance.sql +
   supabase/wvm-shield-v40.sql); this file is the friendly front and the
   API other mall code builds on (window.WVM_SHIELD, see SHIELD.md).

   Zach's rule: the mall is open to everyone, no gate at the door. LIVE
   SOCIAL (seeing live people, hugs, messages, voice, video, rooms) is for
   signed-in adult allofus accounts only. Everyone else explores solo and
   never sees or hears live people. Age levels:
     guest           not signed in / no DOB / under 18 / held → solo
     adult_self      allofus account, DOB 18+                 → text, friends, hugs, rooms
     adult_verified  + one-time third-party age check         → voice, video, The World Fire
                     (adult_self is enough for these until a provider is configured)
   Person-to-person events go through wvm_send(): the server stamps who
   sent it and checks level, blocks, mutes and rate limits.
   © 2026 World VR Mall · Eye To Ad Media, Denver, Colorado
   ============================================================ */
export const SHIELD_VERSION = 'shield-2';
export const FOUNDER = '320bf5d4-2d2d-482e-8633-87ced55e4155';
export const NCMEC_URL = 'https://report.cybertip.org/';
const CONTACT = ['info', 'eyetoad.com'].join('@');
const OUR_HOSTS = ['worldvrmall.com', 'allofus.one', 'eyetoad.com', 'searchconverts.com', 'ailifeboard.com'];
/* hosts the mall's own pages link to on purpose (reference, help lines, video, maps). Anything else gets a "leaving" check. */
const TRUSTED = ['youtube.com', 'youtu.be', 'google.com', 'maps.google.com', 'wikipedia.org', 'sba.gov', 'score.org', 'un.org', 'wfp.org', 'khanacademy.org', 'codecademy.com', 'ocw.mit.edu', 'eyes.nasa.gov', 'nasa.gov', 'nfcc.org', 'annualcreditreport.com', 'coloradosbdc.org', 'americassbdc.org', 'worldwildlife.org', 'wcs.org', 'warmline.org', 'volunteermatch.org', 'sleepfoundation.org', 'redrover.org', 'sheldrickwildlifetrust.org', 'scholar.google.com', 'quizlet.com', 'musiclab.chromeexperiments.com', 'sketchfab.com', 'fineartamerica.com', '988lifeline.org', 'cybertip.org', 'report.cybertip.org', 'thevrgalaxy.com', 'vrflyingsimulator.com', 'virtualrealityadventure.com', 'comicscomealive.com', 'anotherdimensionvr.com', 'phoenixsworld.com', 'usabusinesssearch.com', 'pressreleaseforbusiness.com'];
/* names nobody but the founder may wear (checked on the server too: wvm_reserved_name) */
const RESERVED = /(admin|moderat|\bmod\b|staff|support|official|security|helpdesk|customer ?service|world ?vr ?mall|worldvrmall|all ?of ?us|allofus|eye ?to ?ad|eyetoad|search ?converts|zach(ary)? ?(tye )?wennstedt|wennstedt|founder|ceo|owner|police|sheriff|fbi|ncmec|anthropic|claude)/;
const RANGE = { see: 250, talk: 15, drop: 22, hug: 8, bubble: 1.2 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const host = (u) => { try { const x = new URL(u, location.href); return { proto: x.protocol, h: x.hostname.toLowerCase().replace(/^www\./, ''), href: x.href }; } catch (e) { return null; } };
const under = (h, list) => list.some(d => h === d || h.endsWith('.' + d));

/* ---------- text filter: no phone numbers, emails, links, handles or payment asks (keeps scammers from moving kids off-platform) ---------- */
const NUMW = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const RULES = [
  ['phone', /(\+?\d[\s().\-_/*]{0,3}){7,}/g],
  ['email', /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+(\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,})+/gi],
  ['link', /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}(\.|\s?\(dot\)\s?|\s?\[dot\]\s?|\sdot\s)(com|net|org|io|me|gg|ly|co|app|xyz|link|site|online|live|tv|us|ru|cn|biz|info|to|cc|club|shop|store)\b/gi],
  ['handle', /(^|\s)@[a-z0-9_.]{3,}/gi],
  ['payment', /(^|\s)\$[a-z][a-z0-9_]{2,20}|\b(cash ?app|venmo|zelle|pay ?pal|apple ?pay|google ?pay|gift ?cards?|itunes cards?|steam cards?|google play cards?|bitcoin|btc|eth|crypto|usdt|wallet address|western union|moneygram|wire (me|transfer|the money)|send (me )?(money|cash|funds)|pay (me|first|upfront|up front)|robux|v-?bucks|bank (login|account|details)|card number|cvv|ssn)\b/gi],
  ['offsite', /\b(snap ?chat|snap|sc|insta(gram)?|\big\b|tik ?tok|discord|telegram|whats ?app|kik|wickr|signal app|facebook|\bfb\b|dm me|text me|call me (at|on|tonight)|add me on|my number|ur number|your number|phone number|meet (up )?(irl|in person|in real life|offline)|what school|which school|where do (you|u) live|your address|home alone|parents (home|away)|keep (this|it) (a )?secret|don'?t tell (your|ur|anyone)|our (little )?secret|send (me )?(a )?(pic|pics|photo|selfie)s?)\b/gi],
];
const BAD = /\b(f+u+c+k+\w*|sh[i1]+t+\w*|b[i1]+t+c+h+\w*|a+s+s+h+o+l+e+\w*|c+u+n+t+\w*|wh[o0]+r+e+\w*|sl+u+t+\w*|p[o0]+r+n+\w*|p+u+s+s+y+|c+o+c+k+\w*|n+[i1]+g+g+\w*|f+a+g+\w*|r+e+t+a+r+d+\w*|k+y+s+)\b/gi;
export function filterText(input, o = {}) {
  let t = String(input == null ? '' : input).normalize('NFKC').replace(/[​-‏⁠﻿]/g, '').slice(0, o.max || 500);
  /* "five five five one two one two" → digits, so spelled-out numbers are caught too */
  const probe = t.toLowerCase().replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => String(NUMW[w]));
  const hits = new Set();
  for (const [id, rx] of RULES) { rx.lastIndex = 0; if (rx.test(probe) || (rx.lastIndex = 0, rx.test(t))) hits.add(id); rx.lastIndex = 0; t = t.replace(rx, (m) => '•'.repeat(Math.min(12, Math.max(3, m.trim().length)))); }
  if (BAD.test(t)) hits.add('language'); BAD.lastIndex = 0; t = t.replace(BAD, (w) => w[0] + '•'.repeat(Math.max(2, w.length - 1)));
  const serious = ['phone', 'email', 'link', 'handle', 'payment', 'offsite'].some(h => hits.has(h));
  return { ok: !serious, text: t.trim(), hits: [...hits], why: serious ? 'For everyone\'s safety, phone numbers, emails, links, social handles and money talk are not allowed in the mall.' : '' };
}
export function reservedName(n) { const s = String(n || '').toLowerCase().normalize('NFKC').replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5|\$/g, 's').replace(/7/g, 't').replace(/[_.\-]+/g, ' '); return RESERVED.test(s); }
/* a name safe to float over someone's head: filtered, never a staff look-alike, never empty */
export function safeName(n, id) { if (id === FOUNDER) return String(n || 'Zach'); let s = filterText(n, { max: 40 }).text.replace(/•+/g, '').trim(); if (!s || reservedName(s)) s = 'Guest ' + String(id || '').slice(0, 4); return s.slice(0, 24); }

/* ---------- links: buy buttons only to verified tenant domains ---------- */
const TENANTS = new Set(load('wvm_tenants', []));
export function verifiedStore(u) { const x = host(u); return !!x && x.proto === 'https:' && (TENANTS.has(x.h) || [...TENANTS].some(d => x.h.endsWith('.' + d))); }
/* http(s) to us, a verified store or a known reference site → the URL; anything else → null (javascript:, data:, unknown hosts) */
export function safeUrl(u, o = {}) { const s = String(u || '').trim(); if (!s) return null; if (/^\/(?!\/)/.test(s)) return s; const x = host(s); if (!x) return null; if (/^(mailto|tel|sms):$/.test(x.proto) && !o.strict) return x.href; if (!/^https?:$/.test(x.proto)) return null; if (under(x.h, OUR_HOSTS) || verifiedStore(s) || (!o.strict && under(x.h, TRUSTED))) return x.href; return null; }
async function loadTenants() {
  const add = (j) => { const s = JSON.stringify(j || {}); for (const m of s.matchAll(/https?:\\?\/\\?\/([a-z0-9.-]+)/gi)) { const h = m[1].toLowerCase().replace(/^www\./, ''); if (!['google.com', 'instagram.com', 'wa.me', 'facebook.com', 'youtube.com'].includes(h)) TENANTS.add(h); } };
  await Promise.all(['/data/stores.json', '/data/new-stores.json', '/data/offers.json', '/data/mall-extras.json'].map(f => fetch(f, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(add).catch(() => { })));
  save('wvm_tenants', [...TENANTS]);
}

/* ---------- small helpers: rate limits (both ways) ---------- */
const buckets = new Map();
/* true when the action is allowed: at most `max` per `perMs` for this key */
export function rate(key, max, perMs) { const now = Date.now(); const a = (buckets.get(key) || []).filter(t => now - t < perMs); if (a.length >= max) { buckets.set(key, a); return false; } a.push(now); buckets.set(key, a); return true; }
const INBOUND = { pos: [240, 60000], hug_req: [1, 30000], hug_ok: [3, 30000], hug_no: [3, 30000], wave: [4, 30000], emote: [10, 60000], msg: [8, 30000], sig: [80, 30000], friend_req: [1, 60000] };
/* receiving side: drops floods from one person even if they run a modified client */
export function inbound(from, kind) { const r = INBOUND[kind] || [10, 60000]; return rate('in:' + kind + ':' + from, r[0], r[1]) && rate('in:*:' + from, 420, 60000); }

/* ---------- the shield itself ---------- */
const CATS = [
  ['child_safety', '🚨 Child safety', 'A child may be at risk, or someone is asking a minor for pictures, secrets or to meet'],
  ['may_be_minor', '🧒 This person may be under 18', 'They are hidden from live social until they pass an age check'],
  ['sexual', '🔞 Sexual talk or content', ''],
  ['harassment', '😠 Harassment, bullying or hate', ''],
  ['threat', '⚠️ Threats, violence or self-harm', ''],
  ['scam', '💸 Scam, money ask or impersonation', 'Asking for money, gift cards, logins, or pretending to be staff'],
  ['spam', '📢 Spam', ''],
  ['other', '❓ Something else', ''],
];
const GUEST = { sql: 0, signedIn: false, uid: null, band: null, level: 'guest', can: {}, needs: {}, provider: 'none' };
let S = Object.assign({}, GUEST); let SB = null, APP = null, GETME = () => null, TOAST = (m) => console.log(m), SBURL = '';
let blocked = new Set(), blockedBy = new Set(); const muted = new Set(load('wvm_muted', [])); const pairsAsked = new Map();
const handlers = new Map(); let inbox = null; const recent = new Map(); /* per sender: last server-stamped events (evidence) */

const toast = (m, ms) => { try { TOAST(m, ms); } catch (e) { } };
const popup = (title, html, actions) => { if (APP && APP.popup) return APP.popup(title, html, actions); if (confirm(String(title).replace(/<[^>]+>/g, '') + '\n\n' + String(html).replace(/<[^>]+>/g, ''))) { const a = (actions || []).find(x => x.primary) || (actions || [])[0]; a && a.fn && a.fn(); } };

export function status() { return Object.assign({}, S, { blocked: blocked.size, kid: kidMode() }); }
export async function refresh() {
  if (!SB) { S = Object.assign({}, GUEST); return S; }
  let session = null; try { ({ data: { session } } = await SB.auth.getSession()); } catch (e) { }
  if (!session) { S = Object.assign({}, GUEST); stopInbox(); return S; }
  let s = null;
  try { const r = await SB.rpc('wvm_shield_status'); if (!r.error && r.data && r.data.sql) s = r.data; } catch (e) { }
  if (!s) { /* the mall SQL is not run yet: allofus v26 still says adult or not; the realtime policies keep live social shut anyway */
    try { const r = await SB.rpc('my_safety'); const m = !r.error && r.data; if (m && m.sql) { const ad = !!m.adult; s = { sql: 0, band: ad ? 'adult' : null, level: ad ? 'adult_self' : 'guest', can: { text: ad, voice: ad, video: ad, fire: ad }, needs: {}, provider: 'none', dob_set: m.dob_set, minor: !!m.minor, held: !!m.held, banned: !!m.banned, muted: !!m.held, admin: !!m.admin, can_upload: !!m.can_upload }; } } catch (e) { } }
  s = s || { sql: 0, band: null, level: 'guest', can: {}, needs: {}, dob_set: false };
  S = { sql: s.sql || 0, signedIn: true, uid: session.user.id, token: session.access_token, band: s.band === 'adult' ? 'adult' : null, level: s.level || 'guest', can: s.can || {}, needs: s.needs || {}, provider: s.provider || 'none', checkUrl: s.check_url || null,
    dobSet: !!s.dob_set, minor: !!s.minor, adult: s.band === 'adult', held: !!s.held, recheck: !!s.recheck, banned: !!s.banned, muted: !!s.muted, admin: !!s.admin, canUpload: !!s.can_upload, newAccount: !!s.new_account };
  try { const { data, error } = await SB.rpc('wvm_my_blocked'); if (!error && Array.isArray(data)) blocked = new Set(data.map(String)); else { const r = await SB.from('profiles').select('blocked').eq('id', S.uid).maybeSingle(); blocked = new Set(((r.data && r.data.blocked) || []).map(String)); } } catch (e) { }
  try { await SB.realtime.setAuth(session.access_token); } catch (e) { }
  if (S.band) startInbox(); else stopInbox();
  return S;
}
/* 'guest' | 'adult_self' | 'adult_verified' (from the database; never decided on this device) */
export function ageLevel() { return S.signedIn ? S.level || 'guest' : 'guest'; }
/* may I use this feature right now? feature: 'text' (messages, friends, hugs, rooms) | 'voice' | 'video' | 'fire' */
/* other branches say 'msg', 'friend', 'hug'…: they all mean the text level */
const FEATURE = (f) => ({ msg: 'text', message: 'text', messages: 'text', friend: 'text', friends: 'text', hug: 'text', hugs: 'text', room: 'text', rooms: 'text', wave: 'text', emote: 'text', call: 'voice', audio: 'voice', camera: 'video' })[String(f || 'text')] || String(f || 'text');
export function can(feature = 'text') { return !!(S.signedIn && S.band && !S.banned && S.can && S.can[FEATURE(feature)]); }
/* which level the feature needs right now ('adult_self' until a provider is configured) */
export function requires(feature = 'text') { return (S.needs && S.needs[FEATURE(feature)]) || 'adult_self'; }
const GUEST_WHY = 'Live people are for signed-in adults (an allofus.one account, 18+). You can explore everything else solo.';

/* the realtime topic names the database checks. Adults only; anyone else gets null (= join nothing, see no one). */
export function topic(kind, page = 'mall', extra = '') {
  if (!S.signedIn || S.band !== 'adult') return null;
  const pg = String(page).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 24) || 'mall';
  if (kind === 'main') return 'wvm:a:' + pg;
  if (kind === 'pos') return 'wvm:a:' + pg + ':pos:' + String(extra).replace(/[^0-9_-]/g, '').slice(0, 24);
  if (kind === 'voice') return 'wvm:a:' + pg + ':voice';
  if (kind === 'room') return 'wvm:a:room-' + String(extra || page).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 18);
  if (kind === 'room_voice') return 'wvm:a:room-' + String(extra || page).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 18) + ':voice';
  if (kind === 'inbox') return 'wvm:u:' + S.uid;
  return null;
}
/* a private realtime channel (Realtime Authorization). No public fallback: if the database says no, nothing joins. */
export function channel(t, cfg = {}) { if (!SB || !t) return null; return SB.channel(t, { config: Object.assign({}, cfg, { private: true }) }); }

/* can I see this person live right now? Needs adult_self; blocked either way = no. (Non-adults never receive anyone's data:
   the topics are adults-only in the database.) */
export function canSee(id) { id = String(id || ''); if (!id || !can('text')) return false; if (id === S.uid) return true; if (blocked.has(id) || blockedBy.has(id)) return false; askPairs(id); return true; }
/* can I talk with this person? kind: 'text' | 'voice' | 'video' | 'fire'. dist in metres if known.
   Returns { ok, why, needsCheck } — needsCheck: true means startAgeCheck() would unlock it. */
export function canTalk(id, dist, kind = 'voice') {
  if (typeof id === 'object' && id) { ({ id, dist, kind = 'voice' } = id); }
  kind = FEATURE(kind);
  if (!S.signedIn) return { ok: false, why: 'Sign in with allofus to talk. ' + GUEST_WHY };
  if (S.banned) return { ok: false, why: 'This account is suspended.' };
  if (S.recheck) return { ok: false, why: 'Someone reported this account as possibly under 18. Pass a quick age check to use live social again.', needsCheck: S.provider !== 'none' };
  if (S.held) return { ok: false, why: 'This account is on hold while our team reviews a report.' };
  if (!S.band) return { ok: false, why: S.dobSet ? GUEST_WHY : 'Add your date of birth first (a one-time safety step).' };
  if (S.muted) return { ok: false, why: 'You are muted for now because several people reported you. A moderator will review it.' };
  if (!can(kind)) return { ok: false, why: (kind === 'video' ? 'Live video' : kind === 'fire' ? 'The World Fire' : 'Voice chat') + ' needs a one-time age check.', needsCheck: true };
  if (id) { id = String(id); if (!canSee(id)) return { ok: false, why: 'You cannot talk with this person.' }; if (muted.has(id)) return { ok: false, why: 'You muted this person.' }; if (kind === 'voice' && typeof dist === 'number' && dist > RANGE.talk) return { ok: false, why: 'Walk closer to talk (voice is proximity only).' }; }
  return { ok: true };
}
export function isBlocked(id) { id = String(id); return blocked.has(id) || blockedBy.has(id); }
export function isMuted(id) { return muted.has(String(id)); }
export function mute(id, on = true) { id = String(id); on ? muted.add(id) : muted.delete(id); save('wvm_muted', [...muted]); emit('change', { id, muted: on }); toast(on ? '🔇 Muted. You will not hear them or get their hugs.' : '🔈 Unmuted.'); return on; }

/* who blocked me (or whom I blocked) among the people around me: one batched RPC, cached */
let pairT = 0; const pairQ = new Set();
function askPairs(id) { const t = pairsAsked.get(id) || 0; if (Date.now() - t < 120000) return; pairsAsked.set(id, Date.now()); pairQ.add(id); clearTimeout(pairT); pairT = setTimeout(async () => { const ids = [...pairQ]; pairQ.clear(); if (!SB || !ids.length) return; try { const { data, error } = await SB.rpc('wvm_block_pairs', { p_ids: ids }); if (!error && Array.isArray(data)) { let changed = false; for (const x of data) { const k = String(x); if (!blockedBy.has(k)) { blockedBy.add(k); changed = true; } } if (changed) emit('change', { blocked: true }); } } catch (e) { } }, 400); }

export async function block(id, on = true) {
  id = String(id || ''); if (!SB || !S.signedIn || !id || id === S.uid) return false;
  try { const { data } = await SB.from('profiles').select('blocked').eq('id', S.uid).maybeSingle(); const cur = new Set(((data && data.blocked) || []).map(String)); on ? cur.add(id) : cur.delete(id); const { error } = await SB.from('profiles').update({ blocked: [...cur] }).eq('id', S.uid); if (error) throw error; blocked = cur; emit('change', { id, blocked: on }); toast(on ? '🚫 Blocked. You vanish for each other in the mall, and they cannot hug, call or message you.' : 'Unblocked.', 4200); return true; } catch (e) { toast('Could not update your block list. Try again in a moment.'); return false; }
}

/* ---------- reports: same reports table + evidence chain as allofus.one ---------- */
/* report({ id, name, kind = 'wvm_player', context: { page, dist, voice, ... } }) — works flat AND in VR (popup buttons, laser-friendly) */
export function report(o = {}) {
  return new Promise((resolve) => {
    if (!S.signedIn) { toast('Please sign in to report. In an emergency call 911.'); resolve(false); return; }
    const who = esc(o.name || 'this person');
    popup('🚩 Report ' + who, '<p>A real person reviews every report. They are not told who reported them. Pick what is wrong:</p>', CATS.map(([k, n]) => ({ label: n, fn: () => confirmReport(o, k, resolve) })).concat([{ label: 'Cancel', fn: () => resolve(false) }]));
  });
}
function confirmReport(o, cat, resolve) {
  const cs = cat === 'child_safety';
  popup(cs ? '🚨 Child safety report' : '🚩 Send this report?', (cs ? '<p><b>If a child is in danger right now, call 911.</b> You can also report to the NCMEC CyberTipline (report.cybertip.org).</p>' : '') + '<p>We save what happened (names, place, time, recent messages and hugs from this person) as evidence. ' + (cs || cat === 'sexual' || cat === 'harassment' || cat === 'threat' ? 'We will also block them for you.' : '') + '</p>',
    [{ label: '🚩 Send report', primary: true, fn: () => sendReport(o, cat, cs || ['sexual', 'harassment', 'threat'].includes(cat)).then(resolve) }, { label: '🚩 Send + block', fn: () => sendReport(o, cat, true).then(resolve) }, { label: 'Cancel', fn: () => resolve(false) }]);
}
async function sendReport(o, cat, alsoBlock) {
  const id = o.id ? String(o.id) : null; const kind = o.kind || 'wvm_player';
  const evidence = { surface: 'worldvrmall', page: location.pathname, at: new Date().toISOString(), name: String(o.name || '').slice(0, 80), band: S.band, context: o.context || {}, recent: id ? (recent.get(id) || []).slice(-25) : [], client: SHIELD_VERSION, ua: navigator.userAgent.slice(0, 120) };
  const reason = ((CATS.find(c => c[0] === cat) || [])[1] || cat) + ' · ' + kind + ' ' + (id || '');
  let ok = false, dup = false;
  try { const r = await SB.from('reports').insert({ reporter: S.uid, reported: kind === 'wvm_player' ? id : (o.owner || null), reason: reason.slice(0, 500), target_kind: kind, target_id: id, category: cat, details: o.details ? String(o.details).slice(0, 1000) : null, evidence }); if (!r.error) ok = true; else if (r.error.code === '23505') dup = true; else throw r.error; } catch (e) { console.warn('report', e); }
  if (alsoBlock && id && kind === 'wvm_player') await block(id, true); else if (id) mute(id, true);
  if (dup) { toast('You already reported this person. Thank you.'); return true; }
  if (!ok) { popup('We could not send it', `<p>Please email ${CONTACT}${cat === 'child_safety' ? ' and report at report.cybertip.org. If a child is in danger, call 911.' : '.'}</p>`, [{ label: 'OK' }]); return false; }
  toast(cat === 'child_safety' ? '🚨 Report sent. Our team is alerted now. If a child is in danger, call 911.' : '✅ Thank you. The report is with our team.', 6000); return true;
}

/* the buttons a player card shows (flat and VR): report, block, mute, plus whatever the caller adds */
export function playerActions(id, name, ctx = {}) {
  const out = [];
  out.push({ label: isMuted(id) ? '🔈 Unmute' : '🔇 Mute', fn: () => mute(id, !isMuted(id)) });
  out.push({ label: '🚫 Block', fn: () => popup('🚫 Block ' + esc(name || 'this person') + '?', '<p>You vanish for each other in the mall. They cannot hug, call or message you. You can unblock any time from your Lifeboard.</p>', [{ label: '🚫 Block', primary: true, fn: () => block(id, true) }, { label: 'Cancel' }]) });
  out.push({ label: '🚩 Report', fn: () => report({ id, name, context: ctx }) });
  return out;
}

/* ---------- server-stamped person-to-person events ---------- */
/* send(to, event, payload): the server adds { from, name } it verified, checks age bands, blocks, mutes and limits */
export async function send(to, event, payload = {}) {
  if (!SB || !S.signedIn) return { ok: false, error: 'Sign in first.' };
  to = String(to || ''); if (!to || to === S.uid) return { ok: false, error: 'no one' };
  if (isBlocked(to)) return { ok: false, error: 'blocked' };
  if (event === 'msg') { const f = filterText(payload.text); if (!f.ok) return { ok: false, error: f.why, hits: f.hits }; payload = Object.assign({}, payload, { text: f.text }); }
  const lim = INBOUND[event] || [10, 60000]; if (!rate('out:' + event + ':' + to, lim[0], lim[1])) return { ok: false, error: 'Slow down a little.' };
  try { const { data, error } = await SB.rpc('wvm_send', { p_to: to, p_event: event, p_payload: payload }); if (error) return { ok: false, error: error.message }; return (data && typeof data === 'object') ? data : { ok: data === 'ok', error: data === 'ok' ? null : data }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
/* on(event, fn(payload)) for server-stamped events addressed to me. payload.from / payload.name are verified. Returns an unsubscribe. */
export function on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); return () => handlers.get(event).delete(fn); }
function emit(event, p) { const hs = handlers.get(event); if (hs) for (const f of hs) { try { f(p); } catch (e) { console.warn('shield handler', e); } } }
function startInbox() {
  if (!SB || !S.signedIn || S.band !== 'adult' || inbox) return; const t = topic('inbox'); const ch = channel(t, { broadcast: { self: false } }); if (!ch) return; inbox = ch;
  ch.on('broadcast', { event: '*' }, ({ event, payload }) => {
    const p = payload || {}; const from = String(p.from || ''); if (!from || from === S.uid) return;
    if (!p.v || p.v !== 'srv') return; /* only rows the server stamped (clients cannot write to wvm:u:*) */
    if (event === 'room_kick') { leaveRoomLocal(p.room); emit('room_kick', p); toast('🚪 The host asked you to leave this room.'); return; }
    if (isBlocked(from) || (muted.has(from) && event !== 'sig')) return;
    if (!inbound(from, event)) return;
    const r = recent.get(from) || []; r.push({ e: event, at: new Date().toISOString(), text: p.text ? String(p.text).slice(0, 300) : undefined }); if (r.length > 30) r.shift(); recent.set(from, r);
    p.name = safeName(p.name, from); emit(event, p);
  }).subscribe((st) => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { inbox = null; } });
}
function stopInbox() { if (inbox && SB) { try { SB.removeChannel(inbox); } catch (e) { } } inbox = null; }

/* ---------- date of birth (allofus member_safety; the database keeps it private and locks it once set) ---------- */
export function ageOf(dob) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '')); if (!m) return null; const b = new Date(+m[1], +m[2] - 1, +m[3]); const n = new Date(); if (isNaN(b) || b > n || +m[1] < 1900) return null; let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
/* kid safe mode (COPPA): a date of birth under 13 typed on this device turns it on until the 13th birthday. Nothing is sent:
   no account, no live people, no voice, no camera / selfie, no free-text forms. Only a date is kept in this browser. */
const KID = 'wvm_kid_until';
export function kidMode() { try { return (+localStorage.getItem(KID) || 0) > Date.now(); } catch (e) { return false; } }
function kidOn(dob) { try { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob); const t = new Date(+m[1] + 13, +m[2] - 1, +m[3]).getTime(); localStorage.setItem(KID, String(t)); } catch (e) { } kidGuard(); emit('change', { kid: true }); }
function kidGuard() {
  if (!kidMode()) return; try { document.documentElement.classList.add('wvm-kid'); } catch (e) { }
  const md = navigator.mediaDevices; if (!md || md.__wvmKid) return; md.__wvmKid = true; const gum = md.getUserMedia && md.getUserMedia.bind(md);
  if (gum) md.getUserMedia = (c) => kidMode() ? Promise.reject(new DOMException('Camera and microphone are off in kids safe mode.', 'NotAllowedError')) : gum(c);
}
/* sign-up check: { ok, dob, msg, kid }. Live social and accounts are 18+ (one allofus.one account for both sites). */
export function dobCheck(dob) {
  if (kidMode()) return { ok: false, kid: true, msg: 'This device is in kids safe mode. You can keep exploring the mall, the rides and the games.' };
  const a = ageOf(dob); if (a === null) return { ok: false, msg: 'Please enter your date of birth.' };
  if (a < 13) { kidOn(String(dob)); return { ok: false, kid: true, msg: 'Thanks for being honest! Accounts are for adults. You can keep exploring the mall, the rides and the games. (Kids safe mode is on for this device.)' }; }
  if (a < 18) return { ok: false, minor: true, msg: 'Accounts and live people are for adults 18+. You can keep exploring the mall, the rides and the games on your own.' };
  if (a > 120) return { ok: false, msg: 'Please check the year.' };
  return { ok: true, dob: String(dob) };
}
export function askDob() {
  return new Promise((resolve) => {
    if (!SB || !S.signedIn) { resolve(false); return; }
    const today = new Date().toISOString().slice(0, 10);
    const w = document.createElement('div'); w.className = 'wvms-wrap'; w.innerHTML = `<div class="wvms-box" role="dialog" aria-modal="true"><h3>One quick safety step</h3><p>Live people, hugs, messages and voice are for adults 18+. Your date of birth stays private and is never shown.</p><label>Date of birth<input type="date" id="wvms-dob" min="1900-01-01" max="${today}"></label><p class="wvms-err" id="wvms-err"></p><div class="wvms-row"><button class="p" data-go>Save</button><button data-x>Not now</button></div><p class="wvms-m">It can only be set once. Lying about your age breaks our rules and gets accounts removed.</p></div>`;
    css(); document.body.appendChild(w); const q = (s) => w.querySelector(s); const done = (v) => { w.remove(); resolve(v); };
    q('[data-x]').onclick = () => done(false);
    q('[data-go]').onclick = async () => { const c = dobCheck(q('#wvms-dob').value); if (!c.ok) { q('#wvms-err').textContent = c.msg; if (c.kid || c.minor) setTimeout(() => done(false), 3000); return; } q('[data-go]').disabled = true; try { const { error } = await SB.rpc('set_my_dob', { p_dob: c.dob }); if (error) throw error; await refresh(); emit('change', { band: S.band }); done(true); } catch (e) { q('#wvms-err').textContent = (e && e.message) || 'Could not save. Try again.'; q('[data-go]').disabled = false; } };
  });
}

/* ---------- one-time age check (Yoti primary, Persona fallback; supabase/functions/age-check) ---------- */
/* startAgeCheck({ reason }) → { ok, state }. state: 'not_configured' (no provider yet), 'redirect' (off to the vendor),
   'already' (verified). The vendor shows its own consent screen; we keep only the result, never the selfie or ID. */
export async function startAgeCheck(o = {}) {
  await refresh();
  if (!S.signedIn) { toast('Sign in with allofus first.'); return { ok: false, state: 'signed_out' }; }
  if (S.level === 'adult_verified') return { ok: true, state: 'already' };
  if (!S.provider || S.provider === 'none') { popup('🪪 Age check coming soon', '<p>Voice and video will need a quick one-time age check (a selfie age estimate, or an ID if the estimate is close). It is not switched on yet, so you can use them as you are for now.</p>', [{ label: 'OK' }]); return { ok: false, state: 'not_configured' }; }
  const url = S.checkUrl || (SBURL ? SBURL + '/functions/v1/age-check' : '');
  return new Promise((resolve) => popup('🪪 Quick one-time age check', '<p>Voice, live video and The World Fire are for verified adults. A trusted partner (' + (S.provider === 'persona' ? 'Persona' : 'Yoti') + ') estimates your age from a quick selfie; if it is close, it asks for an ID instead. We only keep the result (passed or not), never your picture or your ID.</p>', [
    { label: '🪪 Start the check', primary: true, fn: async () => { try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token, apikey: (SB && SB.supabaseKey) || '' }, body: JSON.stringify({ action: 'start', reason: o.reason || 'voice', return_url: location.origin + location.pathname + '?age_check=done' }) }); const j = await r.json(); if (!j.ok) { toast(j.error || 'The age check could not start.', 5000); resolve({ ok: false, state: j.state || 'error' }); return; } try { sessionStorage.setItem('wvm_age_ref', j.ref); } catch (e) { } resolve({ ok: true, state: 'redirect' }); location.href = j.url; } catch (e) { toast('The age check could not start. Try again in a minute.'); resolve({ ok: false, state: 'error' }); } } },
    { label: 'Not now', fn: () => resolve({ ok: false, state: 'cancelled' }) }]));
}
/* back from the vendor: ask the server to fetch the result (it re-checks with the vendor; the URL proves nothing) */
async function ageReturn() {
  let ref = null; try { ref = sessionStorage.getItem('wvm_age_ref'); } catch (e) { }
  if (!/[?&](age_check=done|sessionId=)/.test(location.search) || !ref || !SB) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) { }
  await refresh(); const url = S.checkUrl || (SBURL ? SBURL + '/functions/v1/age-check' : ''); if (!url || !S.token) return;
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token, apikey: (SB && SB.supabaseKey) || '' }, body: JSON.stringify({ action: 'poll', ref }) }); const j = await r.json();
      if (j.status === 'passed') { try { sessionStorage.removeItem('wvm_age_ref'); } catch (e) { } await refresh(); emit('change', { level: S.level }); toast('✅ Age check passed. Voice and video are open for you.', 5000); return; }
      if (['failed', 'cancelled', 'expired', 'error'].includes(j.status)) { try { sessionStorage.removeItem('wvm_age_ref'); } catch (e) { } toast(j.status === 'failed' ? 'The age check did not pass. You can still message, hug and explore.' : 'The age check did not finish. You can try again later.', 5500); return; } } catch (e) { }
    await new Promise(r => setTimeout(r, 5000));
  }
  toast('Your age check is still being reviewed. We will open voice for you as soon as it passes.', 5000);
}

/* ---------- rooms (the gathering room and later ones): cap, host kick / lock, enforced by the database ---------- */
const ROOMS = new Map(); /* slug → { ping } */
const rpc = async (fn, args) => { if (!SB) return { ok: false, error: 'offline' }; try { const { data, error } = await SB.rpc(fn, args); if (error) return { ok: false, error: error.message }; return data || { ok: false }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } };
/* canJoinRoom(slug) → { ok, why, needsCheck, info } (asks the server: cap, lock, kicked, level) */
export async function canJoinRoom(room) {
  const slug = String(room || '').toLowerCase();
  if (!can('text')) return { ok: false, why: S.signedIn ? (S.recheck ? 'Pass a quick age check to use live social again.' : GUEST_WHY) : 'Sign in with allofus to join rooms. ' + GUEST_WHY };
  const info = await rpc('wvm_room_info', { p_slug: slug }); if (!info.ok) return { ok: false, why: info.error || 'This room is not open.', info };
  if (info.kicked) return { ok: false, why: 'The host asked you to leave this room.', info };
  if (!can(info.feature || 'text')) return { ok: false, why: 'This room needs a one-time age check.', needsCheck: true, info };
  if (info.locked && !info.i_am_host && !info.member) return { ok: false, why: 'This room is locked by its host.', info };
  if (info.count >= info.cap && !info.member) return { ok: false, why: 'This room is full (' + info.cap + ' people).', info };
  return { ok: true, info };
}
export async function openRoom(slug, o = {}) { return rpc('wvm_room_open', { p_slug: String(slug).toLowerCase(), p_name: o.name || null, p_cap: o.cap || null, p_feature: o.feature || 'text' }); }
/* joinRoom(slug) → server info; keeps a 30 s heartbeat (members who stop pinging drop out of the count after 90 s) */
export async function joinRoom(slug) {
  slug = String(slug).toLowerCase(); const r = await rpc('wvm_room_join', { p_slug: slug }); if (!r.ok) return r;
  leaveRoomLocal(slug); ROOMS.set(slug, { ping: setInterval(() => rpc('wvm_room_ping', { p_slug: slug }), 30000) });
  return Object.assign({ topic: topic('room', 'room', slug), voiceTopic: topic('room_voice', 'room', slug) }, r);
}
function leaveRoomLocal(slug) { const x = ROOMS.get(String(slug || '').toLowerCase()); if (x) { clearInterval(x.ping); ROOMS.delete(String(slug).toLowerCase()); } }
export async function leaveRoom(slug) { leaveRoomLocal(slug); return rpc('wvm_room_leave', { p_slug: String(slug).toLowerCase() }); }
export const roomInfo = (slug) => rpc('wvm_room_info', { p_slug: String(slug).toLowerCase() });
/* host controls (the server checks you are the host, or the admin) */
export const kick = (slug, userId) => rpc('wvm_room_kick', { p_slug: String(slug).toLowerCase(), p_user: userId });
export const lockRoom = (slug, on = true) => rpc('wvm_room_set', { p_slug: String(slug).toLowerCase(), p_locked: !!on, p_cap: null });
export const setRoomCap = (slug, cap) => rpc('wvm_room_set', { p_slug: String(slug).toLowerCase(), p_locked: null, p_cap: cap });

/* ---------- link guard: clicks on links to unknown hosts get a "you are leaving" check; javascript:/data: links never run ---------- */
function linkGuard() {
  if (window.__wvmLinkGuard) return; window.__wvmLinkGuard = true;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.dataset.wvmOk) return; const raw = a.getAttribute('href') || ''; if (/^#|^\/(?!\/)/.test(raw)) return;
    const x = host(a.href); if (!x) return;
    if (!/^(https?|mailto|tel|sms):$/.test(x.proto)) { e.preventDefault(); e.stopImmediatePropagation(); toast('That link was blocked.'); return; }
    if (!/^https?:$/.test(x.proto) || safeUrl(a.href)) return;
    e.preventDefault(); e.stopImmediatePropagation(); leaving(a.href, a.target === '_blank');
  }, true);
  const wo = window.open; window.open = function (u, ...rest) { const x = u ? host(String(u)) : null; if (x && !/^(https?|mailto|tel|sms|about):$/.test(x.proto)) { toast('That link was blocked.'); return null; } return wo.call(window, u, ...rest); };
}
function leaving(href, blank) {
  const x = host(href); css(); const w = document.createElement('div'); w.className = 'wvms-wrap'; w.innerHTML = `<div class="wvms-box"><h3>You are leaving World VR Mall</h3><p>This link goes to <b>${esc(x.h)}</b>, which is <b>not</b> a verified World VR Mall store. Never send money, gift cards or passwords to someone you met online.</p><div class="wvms-row"><button data-x class="p">Stay here</button><button data-go>Continue</button></div></div>`;
  document.body.appendChild(w); w.querySelector('[data-x]').onclick = () => w.remove(); w.querySelector('[data-go]').onclick = () => { w.remove(); if (blank) window.open(href, '_blank', 'noopener'); else location.href = href; };
}
let CSSDONE = false;
function css() { if (CSSDONE) return; CSSDONE = true; const s = document.createElement('style'); s.textContent = '.wvms-wrap{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px;font:500 15px/1.45 Poppins,system-ui,Arial,sans-serif;color:#0f172a}.wvms-box{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.35)}.wvms-box h3{margin:0 0 6px;font:800 19px/1.25 Poppins,Arial}.wvms-box label{display:block;font-weight:700;font-size:13px;margin:10px 0 4px}.wvms-box input{width:100%;box-sizing:border-box;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit}.wvms-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.wvms-row button{border:0;border-radius:10px;padding:10px 16px;font:700 14px Poppins,Arial;cursor:pointer;background:#e2e8f0;color:#0f172a}.wvms-row button.p{background:#0f766e;color:#fff}.wvms-err{color:#b91c1c;font-weight:700;font-size:13px;min-height:16px;margin:6px 0 0}.wvms-m{color:#64748b;font-size:12px}'; document.head.appendChild(s); }

/* ---------- boot ---------- */
/* initShield({ sb, app, toast }) once the Supabase client exists (or with sb: null for guests/demo). Idempotent. */
let READY = null;
export function initShield(o = {}) {
  if (o.app) APP = o.app; if (o.toast) TOAST = o.toast; if (o.getMe) GETME = o.getMe;
  if (o.url) SBURL = String(o.url).replace(/\/$/, '');
  kidGuard();
  if (o.sb && o.sb !== SB) { SB = o.sb; try { SBURL = SBURL || SB.supabaseUrl || ''; } catch (e) { } try { SB.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { stopInbox(); blocked.clear(); blockedBy.clear(); for (const k of [...ROOMS.keys()]) leaveRoomLocal(k); S = Object.assign({}, GUEST); emit('change', { band: null }); } else if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED') { refresh().then(() => emit('change', { band: S.band })); } }); } catch (e) { } }
  linkGuard(); loadTenants();
  READY = (async () => { await refresh(); ageReturn(); setInterval(() => { if (S.signedIn) refresh(); }, 120000); return S; })();
  return API;
}
export const RANGES = RANGE;
const API = { version: SHIELD_VERSION, RANGES: RANGE, CATEGORIES: CATS.map(c => c[0]), get ready() { return READY || Promise.resolve(S); }, initShield, status, refresh, ageLevel, can, requires, startAgeCheck, kidMode,
  topic, channel, canSee, canTalk, canJoinRoom, openRoom, joinRoom, leaveRoom, roomInfo, kick, lockRoom, setRoomCap,
  report, block, isBlocked, mute, isMuted, filterText, safeName, reservedName, send, on, rate, inbound, safeUrl, verifiedStore, playerActions, askDob, dobCheck, ageOf };
try { window.WVM_SHIELD = API; } catch (e) { }
export default API;
