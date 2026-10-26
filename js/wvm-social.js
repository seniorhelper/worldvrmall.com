/* ============================================================
   World VR Mall · social layer (v1, Oct 25 2026) · see /SOCIAL.md
   Your allofus.one people in the mall: who is here and where, "join them", messages, connect requests,
   and a one-tap hop to allofus.one that brings you back to the same spot.
   · WHO YOU SEE: your allofus connections and Circle people. Strangers are hidden unless BOTH of you turn
     on the public plaza (confirmed adults only). The server decides (wvm_can_see in supabase/wvm-social-v31.sql);
     window.WVM_SHIELD.canSee / canTalk / filterText (safety session) is asked on top of that.
   · LIVE POSITIONS ride private Realtime topics 'wvm-u:<id>': only people the server lets see you can subscribe.
     The old public position channel is no longer sent on (wvm-plus.js checks WVM_SOCIAL).
   · MESSAGES are the allofus.one DMs (public.messages): a chat started here continues on allofus.one.
     Text only: links, emails and pictures are refused on the way out and hidden on the way in.
   · VR: a floating panel the laser taps (wvm-screen.js), quick replies, and speech-to-text where the browser has it.
     Nothing ever takes keyboard focus in the headset.
   ============================================================ */
import * as THREE from 'three';
import { makeScreen, removeScreen } from '/js/wvm-screen.js';
import { aouUrl, go as railGo } from '/js/wvm-rail.js?v=59';
const T = THREE;
const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stripEmoji = (s) => String(s || '').replace(/[\p{Extended_Pictographic}️‍]+/gu, '').replace(/·.*$/, '').trim();

/* ---------- text: links, emails and pictures never travel from one member to another ---------- */
const TLD = 'com|net|org|io|co|me|ly|gg|app|xyz|info|biz|us|uk|ca|tv|link|site|online|shop|store|one|ai|dev|live|club|top|vip|cc|de|ru|cn';
const LINKY = new RegExp(`(https?:|ftp:|data:|javascript:|www\\.|<\\s*(img|a|iframe|svg)\\b|!\\[|\\b[\\w-]+(\\.|\\s?\\(dot\\)\\s?|\\s?\\[dot\\]\\s?)(${TLD})\\b|[\\w.+-]+\\s?(@|\\(at\\)|\\[at\\])\\s?[\\w-]+\\.[\\w.]+)`, 'i');
const LINKY_G = new RegExp(`\\S*(https?:|ftp:|data:|javascript:|www\\.)\\S*|\\b[\\w-]+\\.(${TLD})\\b\\S*|[\\w.+-]+@[\\w-]+\\.[\\w.]+`, 'gi');
export const hasLink = (t) => LINKY.test(String(t || ''));
export const hideLinks = (t) => String(t || '').replace(LINKY_G, '🔗 (link hidden)');

/* ---------- the safety shield (window.WVM_SHIELD, js/wvm-shield.js "shield-1") ----------
   canSee(id) -> bool · canTalk({ id, kind }) -> { ok, why, needsCheck } (shield-2) · filterText(s) -> { ok, text, hits, why } · playerActions(id, name) -> [{ label, fn }].
   Booleans, promises, strings and { reason } are accepted too. No shield loaded = the server rules alone. A shield that throws = no. */
const SH = () => window.WVM_SHIELD || null;
const verdict = (r) => r === undefined || r === null ? true : typeof r === 'object' ? r.ok !== false && r.allowed !== false : !!r;
let lastWhy = '';
async function shieldAsk(fn, id) { lastWhy = ''; const s = SH(); if (!s || typeof s[fn] !== 'function') return true; try { const r = await (fn === 'canTalk' ? s.canTalk({ id, kind: 'msg' }) : s[fn](id)); const ok = verdict(r); if (!ok && r && typeof r === 'object') lastWhy = r.why || r.reason || ''; return ok; } catch (e) { console.warn('shield ' + fn, e); return false; } }
async function shieldText(text, ctx) {
  let out = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const s = SH(); if (s && typeof s.filterText === 'function') {
    try { const r = await s.filterText(out, ctx); if (r === false) return { ok: false, reason: 'That message was blocked by the safety filter.' }; if (typeof r === 'string') out = r; else if (r && typeof r === 'object') { if (r.ok === false || r.blocked) return { ok: false, reason: r.why || r.reason || 'That message was blocked by the safety filter.' }; if (typeof r.text === 'string') out = r.text; } }
    catch (e) { console.warn('shield filterText', e); return { ok: false, reason: 'The safety filter is not answering. Try again in a moment.' }; }
  }
  return { ok: !!out, text: out, reason: out ? '' : 'Say something first.' };
}

/* ---------- menu registration: other layers (the VR menu, the rail) can list these ----------
   window.WVM_MENU_EXTRA = [{ id, icon, label, fn, badge() }], plus a 'wvm-menu-extra' event when one is added. */
export function registerMenuEntry(e) { const L = window.WVM_MENU_EXTRA = window.WVM_MENU_EXTRA || []; const i = L.findIndex(x => x.id === e.id); if (i >= 0) L[i] = e; else L.push(e); try { dispatchEvent(new CustomEvent('wvm-menu-extra', { detail: e })); } catch (x) { } return e; }

export const QUICK = ['👋 Hi!', '📍 Come find me', '👍 On my way', '⏳ Give me a minute', '😂 Ha!', '❤️ Love it', '🛍️ Look at this store', '👋 Gotta go, bye!'];

/* ctx from wvm-plus.js: { sb(), me(), modal, close, toast, signIn, upsert(payload), drop(id), remote (Map) } */
export function initSocial(app, page, ctx) {
  const pageKind = /^\/stores\//.test(location.pathname) ? 'store' : (page === 'outside' ? 'outside' : 'mall');
  const storeSlug = pageKind === 'store' ? (location.pathname.split('/')[2] || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) : null;
  const toast = (m, ms) => ctx.toast(m, ms);
  const S = { status: 'off', adult: false, plaza: load('wvm_plaza', false) === true, people: new Map(), ok: new Map(), mine: [], reqIn: [], reqOut: new Map(), unread: 0, chans: new Map(), myChan: null, inbox: null, sentAt: [], open: null };
  const sb = () => ctx.sb(); const me = () => ctx.me();
  const xrOn = () => !!(app.renderer && app.renderer.xr && app.renderer.xr.isPresenting);

  /* ---------- who may be drawn: server list + shield ---------- */
  const visible = (id) => S.status === 'live' && S.people.has(id) && S.ok.get(id) === true;

  /* ---------- where I am ---------- */
  const nearestPlace = () => { const P = app.player.position; let best = null, bd = 60 * 60; for (const p of (app.places || [])) { if (!p || p.url || p.fn || p.x === undefined || (p.level || 0) !== (app.level || 0)) continue; const d = (p.x - P.x) ** 2 + (p.z - P.z) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  const here = () => { const P = app.player.position; const pl = nearestPlace(); return { page: pageKind, store: storeSlug, place: pl && /^[A-Za-z0-9_-]{1,40}$/.test(pl.id) ? pl.id : null, place_name: pl ? stripEmoji(pl.name).slice(0, 60) || null : null, x: +P.x.toFixed(1), z: +P.z.toFixed(1), level: app.level || 0 }; };
  const pagePath = (pg, store) => pg === 'outside' ? '/' : pg === 'store' && store ? '/stores/' + store + '/' : '/mall/';
  const whereText = (p) => (p.place_name ? p.place_name + ' · ' : '') + (p.page === 'outside' ? 'the island' : p.page === 'store' ? 'a store' : 'inside the mall');

  /* ---------- heartbeat + lists ---------- */
  let lastAou = 0;
  const heartbeat = async () => { const c = sb(), m = me(); if (!c || !m || document.hidden || S.status === 'missing') return; const h = here();
    const { error } = await c.from('wvm_presence').upsert({ user_id: m.id, ...h, plaza: S.plaza && S.adult, last_seen: new Date().toISOString() });
    if (error && /wvm_presence|relation|schema cache/i.test(error.message || '')) { S.status = 'missing'; console.warn('World VR Mall social layer: run supabase/wvm-social-v31.sql (see SOCIAL.md).', error.message); return; }
    /* allofus.one shows your connections "In World VR Mall" from its own presence table */
    if (Date.now() - lastAou > 55000) { lastAou = Date.now(); try { await c.from('presence').upsert({ user_id: m.id, where: 'mall', page: pagePath(pageKind, storeSlug), last_seen: new Date().toISOString() }); } catch (e) { } } };
  const refresh = async () => { const c = sb(), m = me(); if (!c || !m) { S.status = 'off'; S.people.clear(); syncChannels(); return; }
    try { const { data: st } = await c.rpc('wvm_social_me'); S.adult = !!(st && st.adult); } catch (e) { }
    const { data, error } = await c.rpc('wvm_people'); if (error) { if (/wvm_people|function|schema cache/i.test(error.message || '')) S.status = 'missing'; else console.warn('wvm_people', error.message); S.people.clear(); syncChannels(); draw(); return; }
    S.status = 'live'; const next = new Map(); for (const r of (data || [])) next.set(r.user_id, r); S.people = next;
    await Promise.all([...next.keys()].map(async (id) => { S.ok.set(id, await shieldAsk('canSee', id)); }));
    for (const id of [...S.ok.keys()]) if (!next.has(id)) S.ok.delete(id);
    syncChannels(); draw(); emitPresence(); };
  const refreshMine = async () => { const c = sb(), m = me(); if (!c || !m || S.status === 'missing') return; const { data, error } = await c.rpc('wvm_my_people'); if (!error) { S.mine = data || []; S.unread = S.mine.reduce((a, p) => a + (p.unread || 0), 0); }
    try { const { data: rq } = await c.from('connections').select('id,requester,addressee,kind,status,created_at').or(`addressee.eq.${m.id},requester.eq.${m.id}`).eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
      const rows = rq || []; S.reqOut = new Map(rows.filter(r => r.requester === m.id).map(r => [r.addressee, r])); const inc = rows.filter(r => r.addressee === m.id && r.kind === 'connect');
      if (inc.length) { const { data: ps } = await c.from('profiles').select('id,display_name,username').in('id', inc.map(r => r.requester)); const nm = new Map((ps || []).map(p => [p.id, p])); S.reqIn = inc.map(r => ({ ...r, name: (nm.get(r.requester) || {}).display_name || 'Someone' })); } else S.reqIn = []; } catch (e) { }
    badge(); draw(); };

  /* ---------- live positions on private topics ---------- */
  const chanOpts = { config: { private: true, broadcast: { self: false } } };
  const syncChannels = () => { const c = sb(), m = me(); const want = new Set(c && m && S.status === 'live' ? [...S.people.keys()].filter(visible) : []);
    for (const [id, ch] of S.chans) if (!want.has(id)) { try { c && c.removeChannel(ch); } catch (e) { } S.chans.delete(id); ctx.drop(id); }
    for (const id of ctx.remote.keys()) if (!want.has(id) && !(ctx.remote.get(id) || {}).bot) ctx.drop(id);
    for (const id of want) if (!S.chans.has(id)) { const ch = c.channel('wvm-u:' + id, chanOpts); ch.on('broadcast', { event: 'pos' }, ({ payload }) => { if (payload && payload.id === id && visible(id) && payload.page === pageKind && (payload.store || null) === storeSlug) ctx.upsert(payload); }); ch.subscribe(); S.chans.set(id, ch); }
    if (c && m && S.status === 'live' && S.adult && !S.myChan) { S.myChan = c.channel('wvm-u:' + m.id, chanOpts); S.myChan.subscribe(); } };
  let last = '', lastSent = 0;
  setInterval(() => { const m = me(), ch = S.myChan; if (!m || !ch || document.hidden) return; const P = app.player.position; const yaw = app.avatar ? app.avatar.rotation.y : 0; const k = [Math.round(P.x * 3), Math.round(P.z * 3), Math.round(yaw * 8), app.level || 0].join(','); const now = Date.now(); if (k === last && now - lastSent < 5000) return; last = k; lastSent = now; const av = m.avatar || {};
    ch.send({ type: 'broadcast', event: 'pos', payload: { id: m.id, name: m.name, page: pageKind, store: storeSlug, x: P.x, z: P.z, yaw, moving: !!app.moving, level: app.level || 0, av: { ch: av.ch, look: av.look, v: av.v || 0 }, halo: (load('aou_halo', null) || {}).t || null } }); }, 400);

  /* ---------- incoming messages (the allofus DM table, live) ---------- */
  const listen = () => { const c = sb(), m = me(); if (!c || !m || S.inbox) return; S.inbox = c.channel('wvm-dm-' + m.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'recipient=eq.' + m.id }, ({ new: row }) => onIncoming(row)).subscribe(); };
  const onIncoming = async (row) => { if (!row || row.room) return; if (!(await shieldAsk('canTalk', row.sender))) return; const f = await shieldText(hideLinks(row.body), { where: 'mall-dm-in', from: row.sender }); if (!f.ok) return;
    const who = (S.mine.find(p => p.user_id === row.sender) || {}).name || row.sender_name || 'Someone';
    if (S.open && S.open.view === 'thread' && S.open.with === row.sender) { S.open.msgs.push({ ...row, body: f.text }); markRead(row.sender); draw(); return; }
    S.unread++; badge(); if (xrOn()) vrNotify(who, f.text, row.sender); else toast('💬 ' + who + ': ' + f.text.slice(0, 80), 4500); refreshMine(); };

  /* ---------- actions ---------- */
  const needSocial = () => { if (!me()) { toast('Sign in to see your people in the mall.'); if (!xrOn()) ctx.signIn(); return false; } if (S.status === 'missing') { toast('People in the mall is switching on soon.'); return false; } if (!S.adult) { toast('Confirm your age once on allofus.one (18+) to see and message people.', 4500); return false; } return true; };
  const connected = (id) => S.mine.some(p => p.user_id === id && p.rel === 'connection') || (S.people.get(id) || {}).rel === 'connection';
  const personName = (id) => (S.people.get(id) || S.mine.find(p => p.user_id === id) || ctx.remote.get(id) || {}).name || 'them';

  const safety = (id, name) => { const s = SH(); if (!s || typeof s.playerActions !== 'function') return; const acts = (s.playerActions(id, name, { where: 'mall-social' }) || []).map(a => ({ label: a.label, fn: () => { closeAll(); a.fn(); setTimeout(refresh, 800); } })); app.popup('🛡️ ' + esc(name), '<p>Mute, block or report. Blocking also hides you from them, here and on allofus.one.</p>', acts); };
  const hasSafety = () => { const s = SH(); return !!(s && typeof s.playerActions === 'function'); };
  const join = (p) => { if (!p) return; if (p.page === pageKind && (p.store || null) === storeSlug && p.x != null) { const fx = p.x, fz = p.z; closeAll(); app.travel({ id: 'with-' + p.user_id.slice(0, 8), name: p.name, x: fx + 1.6, z: fz + 1.6, look: [fx, fz], level: p.level || 0, silent: true }, 'port'); setTimeout(() => { app.level = p.level || 0; toast('👋 You found ' + p.name + '!'); }, 900); return; }
    const u = pagePath(p.page, p.store) + '?mode=3d&with=' + encodeURIComponent(p.user_id); closeAll(); if (app.go) app.go(u, '👋 Joining ' + p.name); else location.href = u; };

  const connect = async (id, name) => { if (!needSocial()) return; const c = sb(), m = me(); if (!id || id === m.id) return; if (!(await shieldAsk('canTalk', id))) { toast(lastWhy || 'You can’t connect with this person.'); return; }
    const { data: rows } = await c.from('connections').select('id,requester,addressee,kind,status').or(`and(requester.eq.${m.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${m.id})`);
    const theirs = (rows || []).find(r => r.requester === id), mine = (rows || []).find(r => r.requester === m.id);
    let error = null, msg = '';
    if ((theirs && theirs.status === 'accepted' && theirs.kind === 'connect') || (mine && mine.status === 'accepted' && mine.kind === 'connect')) msg = '🤝 You are already connected.';
    else if (theirs && theirs.status === 'pending' && theirs.kind === 'connect') { ({ error } = await c.from('connections').update({ status: 'accepted' }).eq('id', theirs.id)); msg = '🤝 Connected with ' + name + '! They asked you first.'; }
    else if (mine && mine.status === 'pending' && mine.kind === 'connect') msg = '⏳ Already asked. ' + name + ' decides.';
    else if (mine && mine.status === 'declined') msg = name + ' said not now. You can’t ask again from the mall.';
    else if (mine) { ({ error } = await c.from('connections').update({ kind: 'connect', status: 'pending' }).eq('id', mine.id)); msg = '📨 Connect request sent to ' + name + '. They decide.'; }
    else { ({ error } = await c.from('connections').insert({ requester: m.id, addressee: id, kind: 'connect', status: 'pending' })); msg = '📨 Connect request sent to ' + name + '. They decide.'; }
    toast(error ? 'Could not send that request: this person can’t be reached.' : msg, 4000); refreshMine(); };
  const answer = async (row, yes) => { const c = sb(); if (!c) return; const { error } = await c.from('connections').update({ status: yes ? 'accepted' : 'declined' }).eq('id', row.id).eq('addressee', me().id); toast(error ? 'That didn’t go through.' : yes ? '🤝 Connected with ' + row.name + '!' : 'Okay, not now.'); await refreshMine(); refresh(); };

  const loadThread = async (id) => { const c = sb(), m = me(); const { data } = await c.from('messages').select('id,sender,recipient,body,created_at,read_at').is('room', null).or(`and(sender.eq.${m.id},recipient.eq.${id}),and(sender.eq.${id},recipient.eq.${m.id})`).order('created_at', { ascending: false }).limit(40);
    const out = []; for (const r of (data || []).reverse()) { const f = r.sender === m.id ? { ok: true, text: r.body } : await shieldText(hideLinks(r.body), { where: 'mall-dm-in', from: r.sender }); if (f.ok) out.push({ ...r, body: r.sender === m.id ? hideLinks(r.body) : f.text }); } markRead(id); return out; };
  const markRead = async (id) => { const c = sb(), m = me(); try { await c.from('messages').update({ read_at: new Date().toISOString() }).eq('sender', id).eq('recipient', m.id).is('read_at', null); } catch (e) { } const p = S.mine.find(x => x.user_id === id); if (p) { S.unread = Math.max(0, S.unread - (p.unread || 0)); p.unread = 0; } badge(); };
  const send = async (id, text) => { if (!needSocial()) return false; const m = me(), c = sb(); if (!connected(id)) { toast('You can message your allofus connections. Send a connect request first.', 4000); return false; }
    const now = Date.now(); S.sentAt = S.sentAt.filter(t => now - t < 60000); if (S.sentAt.length >= 20 || (S.sentAt.length && now - S.sentAt[S.sentAt.length - 1] < 800)) { toast('Slow down a little.'); return false; }
    if (hasLink(text)) { toast('Links, emails and pictures can’t be sent from the mall. Words only.', 4000); return false; }
    if (!(await shieldAsk('canTalk', id))) { toast(lastWhy || 'You can’t message this person.'); return false; }
    const f = await shieldText(text, { where: 'mall-dm-out', to: id }); if (!f.ok) { toast(f.reason, 4000); return false; } if (hasLink(f.text)) { toast('Words only, please.'); return false; }
    const { data, error } = await c.from('messages').insert({ sender: m.id, sender_name: m.name, recipient: id, body: f.text }).select('id,sender,recipient,body,created_at').single();
    if (error) { toast('Not sent: ' + (/row-level|policy/i.test(error.message) ? 'this person can’t be messaged right now.' : 'try again.'), 4000); return false; }
    S.sentAt.push(now); if (S.open && S.open.view === 'thread' && S.open.with === id) { S.open.msgs.push(data); draw(); } return true; };

  /* ---------- the hop to allofus.one and back ---------- */
  const returnPath = () => { const h = here(); return pagePath(pageKind, storeSlug) + '?mode=3d&at=' + [h.x, h.z, h.level].join(','); };
  const handoffUrl = (path = '/', extra = {}) => { const back = returnPath(); save('wvm_return', { path: back, t: Date.now() }); return aouUrl(path, { back, ...extra }); };
  const goAllofus = (path = '/', extra = {}) => { closeAll(); railGo(handoffUrl(path, extra), '🌍 allofus.one'); };

  /* ---------- arriving: ?at=x,z,level (back from allofus) · ?with=<id> (join a friend) · ?thread=<id> (open a chat) ---------- */
  (async () => { const q = new URLSearchParams(location.search); const at = q.get('at'), withId = q.get('with'), thread = q.get('thread'); if (!at && !withId && !thread) return;
    const u = new URL(location.href); ['at', 'with', 'thread'].forEach(k => u.searchParams.delete(k)); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    for (let k = 0; k < 120 && !(app.renderer && app.player && (app.places || []).length > 3); k++) await new Promise(r => setTimeout(r, 250)); await new Promise(r => setTimeout(r, 1500));
    if (at && /^-?\d{1,4}(\.\d)?,-?\d{1,4}(\.\d)?(,-?\d{1,2})?$/.test(at)) { const [x, z, l] = at.split(',').map(Number); app.travel({ id: 'back', name: 'where you were', x, z, level: l || 0, silent: true }, 'port'); setTimeout(() => { app.level = l || 0; toast('🏬 Back where you were in the mall.'); }, 900); }
    if (withId && UUID.test(withId)) { for (let k = 0; k < 40 && S.status !== 'live' && S.status !== 'missing'; k++) await new Promise(r => setTimeout(r, 500)); const p = S.people.get(withId); if (!me()) toast('Sign in to join your friend.', 4000); else if (p && visible(withId)) join(p); else toast('That person isn’t in the mall right now, or hasn’t shared where they are with you.', 4500); }
    if (thread && UUID.test(thread)) { for (let k = 0; k < 40 && !S.mine.length; k++) await new Promise(r => setTimeout(r, 500)); open('thread', thread); } })();

  /* ============================================================ FLAT PANEL ============================================================ */
  let flat = null;
  const closeAll = () => { if (flat) { ctx.close(); flat = null; } closeVR(); S.open = null; };
  const open = async (view = 'here', withId = null) => { if (xrOn()) return openVR(view, withId); if (!me()) { ctx.signIn(); return; }
    flat = ctx.modal('👥 Your people in the mall', '<div id="ws-root"></div>', { wide: true, onClose: () => { flat = null; S.open = null; } }); S.open = { view, with: withId, msgs: [] };
    injectCSS(); if (view === 'thread' && withId) S.open.msgs = await loadThread(withId); draw(); refreshMine(); };
  const draw = () => { if (flat) drawFlat(); if (vr.sc) drawVR(); };
  const row = (p, btns) => `<div class="ws-li"><div class="ws-ava">${esc((p.name || '?')[0])}</div><div class="ws-who"><b>${esc(p.name)}</b><small>${btns.sub}</small></div><div class="ws-act">${btns.html}</div></div>`;
  const relBadge = (rel) => rel === 'connection' ? '<i class="ws-rel c">Connection</i>' : rel === 'circle' ? '<i class="ws-rel o">Circle</i>' : '<i class="ws-rel p">Plaza</i>';
  const drawFlat = () => { const root = $('#ws-root', flat || document); if (!root || !S.open) return; const v = S.open.view;
    /* a background refresh must not eat what you are typing */ const old = $('#ws-txt', root); const keep = old ? { v: old.value, f: document.activeElement === old, s: old.selectionStart } : null;
    const tabs = `<nav class="ws-tabs">${[['here', '🟢 Here now', S.people.size], ['msgs', '💬 Messages', S.unread], ['req', '🤝 Requests', S.reqIn.length]].map(([k, l, n]) => `<button data-tab="${k}" class="${v === k || (v === 'thread' && k === 'msgs') ? 'on' : ''}">${l}${n ? ` <em>${n}</em>` : ''}</button>`).join('')}</nav>`;
    let body = '';
    if (!me()) body = `<p>Sign in to see your allofus.one people here.</p><button class="mp-btn holo" data-act="signin">🔑 Sign in</button>`;
    else if (S.status === 'missing') body = '<p class="muted">People in the mall is switching on soon (the database update has not run yet).</p>';
    else if (!S.adult) body = `<p>People, messages and the plaza are for confirmed adults. Confirm your age once on allofus.one and come back.</p><button class="mp-btn holo" data-act="aou">🌍 Confirm on allofus.one</button>`;
    else if (v === 'here') { const L = [...S.people.values()].filter(p => visible(p.user_id)); const mineL = L.filter(p => p.rel !== 'plaza'), plazaL = L.filter(p => p.rel === 'plaza');
      const one = (p) => row(p, { sub: relBadge(p.rel) + ' 📍 ' + esc(whereText(p)), html: `<button class="mp-btn sm holo" data-join="${p.user_id}">Join them</button>${(hasSafety() ? `<button class="mp-btn sm" data-safe="${p.user_id}" title="Mute, block or report">🛡️</button>` : '') + (p.rel === 'connection' ? `<button class="mp-btn sm" data-chat="${p.user_id}">💬</button>` : S.reqOut.has(p.user_id) ? '<small class="muted">asked</small>' : `<button class="mp-btn sm" data-conn="${p.user_id}">🤝 Connect</button>`)}` });
      body = `<label class="ws-plaza"><input type="checkbox" id="ws-plaza" ${S.plaza ? 'checked' : ''}><span><b>Public plaza</b> · also see other verified adults who turned this on (they see you too). Off = only your connections and Circles.</span></label>`
        + `<h4>Your people here</h4>${mineL.length ? mineL.map(one).join('') : '<p class="muted">None of your connections or Circle people are in the mall right now. They show up here the moment they walk in.</p>'}`
        + (S.plaza ? `<h4>Plaza</h4>${plazaL.length ? plazaL.map(one).join('') : '<p class="muted">Nobody else has the plaza on right now.</p>'}` : ''); }
    else if (v === 'msgs') { body = S.mine.length ? S.mine.map(p => row(p, { sub: relBadge(p.rel) + (p.in_mall ? ' 🟢 in the mall' + (p.mall_place ? ' · ' + esc(p.mall_place) : '') : p.on_allofus ? ' 🌍 on allofus.one' : ''), html: `${p.unread ? `<em class="ws-n">${p.unread}</em>` : ''}${p.rel === 'connection' ? `<button class="mp-btn sm holo" data-chat="${p.user_id}">💬 Open</button>` : `<button class="mp-btn sm" data-conn="${p.user_id}">🤝 Connect</button>`}` })).join('') : '<p class="muted">Your allofus.one connections and Circle people show here.</p>'; }
    else if (v === 'req') { body = S.reqIn.length ? S.reqIn.map(r => row({ name: r.name }, { sub: 'wants to connect', html: `<button class="mp-btn sm holo" data-yes="${r.id}">Accept</button><button class="mp-btn sm" data-no="${r.id}">Not now</button>` })).join('') : '<p class="muted">No connect requests waiting.</p>'; }
    else if (v === 'thread') { const id = S.open.with, m = me(); const p = S.mine.find(x => x.user_id === id) || S.people.get(id) || { name: personName(id) }; const SR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      body = `<div class="ws-th"><button class="mp-btn sm" data-tab="msgs">◀</button><b>${esc(p.name)}</b>${S.people.get(id) && visible(id) ? `<button class="mp-btn sm holo" data-join="${id}">Join them</button>` : ''}<button class="mp-btn sm" data-act="aou-dm">Open on allofus.one ↗</button>${hasSafety() ? `<button class="mp-btn sm" data-safe="${id}" title="Mute, block or report">🛡️</button>` : ''}</div>`
        + `<div class="ws-msgs" id="ws-msgs">${S.open.msgs.map(r => `<div class="ws-m ${r.sender === m.id ? 'me' : ''}">${esc(r.body)}</div>`).join('') || '<p class="muted">Say hi 👋</p>'}</div>`
        + `<div class="ws-q">${QUICK.map((q, i) => `<button data-q="${i}">${esc(q)}</button>`).join('')}</div>`
        + `<div class="ws-in"><input id="ws-txt" maxlength="500" placeholder="Message ${esc(p.name)} (words only)" autocomplete="off">${SR ? '<button class="mp-btn" data-act="mic" title="Speak">🎤</button>' : ''}<button class="mp-btn holo" data-act="send">Send</button></div>`; }
    root.innerHTML = tabs + `<div class="ws-body">${body}</div><div class="ws-foot"><button class="mp-btn holo" data-act="aou">🌍 Go to allofus.one</button><small class="muted">You come back to this exact spot.</small></div>`;
    const ms = $('#ws-msgs', root); if (ms) ms.scrollTop = ms.scrollHeight;
    const txt = $('#ws-txt', root); if (txt && keep) { txt.value = keep.v; if (keep.f) { txt.focus(); try { txt.setSelectionRange(keep.s, keep.s); } catch (e) { } } } if (txt) txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('[data-act=send]', root).click(); } });
    const pz = $('#ws-plaza', root); if (pz) pz.onchange = () => setPlaza(pz.checked);
    root.onclick = async (e) => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.tab) { S.open = { view: d.tab, with: null, msgs: [] }; draw(); if (d.tab !== 'here') refreshMine(); }
      else if (d.join) join(S.people.get(d.join));
      else if (d.chat) { S.open = { view: 'thread', with: d.chat, msgs: [] }; draw(); S.open.msgs = await loadThread(d.chat); draw(); }
      else if (d.conn) connect(d.conn, personName(d.conn));
      else if (d.safe) safety(d.safe, personName(d.safe));
      else if (d.yes || d.no) { const r = S.reqIn.find(x => String(x.id) === (d.yes || d.no)); if (r) answer(r, !!d.yes); }
      else if (d.q !== undefined) await send(S.open.with, QUICK[+d.q]);
      else if (d.act === 'send') { const t = $('#ws-txt', root); if (t && t.value.trim() && await send(S.open.with, t.value)) { const tt = $('#ws-txt', flat || document); if (tt) { tt.value = ''; tt.focus(); } } }
      else if (d.act === 'mic') listenSpeech((t) => { const tt = $('#ws-txt', flat || document); if (tt) tt.value = t; });
      else if (d.act === 'aou-dm') { const p = S.mine.find(x => x.user_id === S.open.with); goAllofus('/', p && p.username ? { v: 'dm', with: p.username } : {}); }
      else if (d.act === 'aou') goAllofus('/');
      else if (d.act === 'signin') { ctx.close(); ctx.signIn(); } }; };
  const setPlaza = async (on) => { if (on && !S.adult) { toast('The plaza is for confirmed adults.'); return; } S.plaza = !!on; save('wvm_plaza', S.plaza); toast(S.plaza ? '🌐 Plaza on: other verified adults with the plaza on can see you, and you them.' : '🔒 Plaza off: only your connections and Circles.', 4000); await heartbeat(); refresh(); };

  /* speech to text (Chrome / Edge / Safari have it; the Quest browser may not: the button only shows when it exists) */
  const listenSpeech = (done) => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Speech to text isn’t available in this browser.'); return; } try { const r = new SR(); r.lang = navigator.language || 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.onresult = (e) => { const t = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || ''; if (t) done(t.slice(0, 500)); }; r.onerror = (e) => toast('🎤 ' + (e.error === 'not-allowed' ? 'Microphone permission is off.' : 'Didn’t catch that.')); r.start(); toast('🎤 Listening…', 2000); } catch (e) { toast('🎤 Speech to text didn’t start.'); } };

  /* ============================================================ VR PANEL ============================================================ */
  const vr = { sc: null, rects: [], press: -1, hover: -1, page: 0, pending: null, note: null };
  const W = 1024, H = 768;
  const closeVR = () => { if (vr.sc) { app.scene.remove(vr.sc.mesh); removeScreen(app, vr.sc.mesh); vr.sc.mesh.geometry.dispose(); vr.sc.mesh.material.map.dispose(); vr.sc.mesh.material.dispose(); vr.sc = null; } };
  const placeInView = (mesh, dist, dy = -0.08) => { const cam = app.renderer.xr.getCamera(); const p = new T.Vector3(), q = new T.Quaternion(); cam.getWorldPosition(p); cam.getWorldQuaternion(q); const f = new T.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize(); mesh.position.copy(p).addScaledVector(f, dist); mesh.position.y = p.y + dy; mesh.lookAt(p.x, mesh.position.y, p.z); };
  const openVR = async (view = 'here', withId = null) => { closeVR(); if (!me()) { toast('Sign in on the page first (take the headset off for a moment).', 4000); return; }
    S.open = { view, with: withId, msgs: [] }; vr.page = 0; vr.pending = null;
    vr.sc = makeScreen(app, { w: 1.2, h: 0.9, px: W, py: H, hover: (u, v) => { const i = hit(u, v); if (i !== vr.hover) { vr.hover = i; drawVR(); } }, leave: () => { vr.hover = -1; drawVR(); }, down: (u, v) => { vr.press = hit(u, v); }, up: (u, v) => { const i = hit(u, v); const p = vr.press; vr.press = -1; if (i >= 0 && i === p) { try { vr.rects[i].fn(); } catch (e) { console.warn('social vr', e); } } } });
    vr.sc.mesh.renderOrder = 998; app.scene.add(vr.sc.mesh); placeInView(vr.sc.mesh, 1.25);
    if (view === 'thread' && withId) S.open.msgs = await loadThread(withId); drawVR(); refreshMine(); };
  const hit = (u, v) => { if (u < 0) return -1; const [x, y] = [u * W, (1 - v) * H]; return vr.rects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); };
  const wrap = (g, text, maxW) => { const words = String(text).split(/\s+/); const lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; };
  const drawVR = () => { const sc = vr.sc; if (!sc || !S.open) return; const g = sc.g; vr.rects = []; const R = vr.rects;
    const btn = (x, y, w, h, label, fn, o = {}) => { const i = R.length; R.push({ x, y, w, h, fn }); const hov = vr.hover === i; g.fillStyle = o.fill || (hov ? '#6366f1' : 'rgba(255,255,255,.1)'); rr(g, x, y, w, h, 18); g.fill(); if (hov) { g.strokeStyle = '#38f0ff'; g.lineWidth = 4; g.stroke(); } g.fillStyle = o.fg || '#fff'; g.font = (o.font || 'bold 30px Poppins, Arial'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2 + 1, w - 16); g.textAlign = 'left'; };
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(6,12,34,.94)'; rr(g, 0, 0, W, H, 36); g.fill(); g.strokeStyle = 'rgba(56,240,255,.6)'; g.lineWidth = 4; rr(g, 2, 2, W - 4, H - 4, 34); g.stroke();
    const v = S.open.view; const tabs = [['here', '🟢 Here ' + (S.people.size || '')], ['msgs', '💬 Messages' + (S.unread ? ' ' + S.unread : '')], ['req', '🤝 Requests' + (S.reqIn.length ? ' ' + S.reqIn.length : '')]];
    tabs.forEach(([k, l], i) => btn(24 + i * 250, 22, 236, 64, l, () => { S.open = { view: k, with: null, msgs: [] }; vr.page = 0; drawVR(); refreshMine(); }, { fill: v === k || (v === 'thread' && k === 'msgs') ? '#4f46e5' : undefined }));
    btn(W - 110, 22, 86, 64, '✕', () => { closeVR(); S.open = null; }, { fill: 'rgba(255,79,121,.85)' });
    g.font = '28px Poppins, Arial'; g.fillStyle = '#cbd5e1'; const say = (t, y) => { g.font = '30px Poppins, Arial'; g.fillStyle = '#e2e8f0'; wrap(g, t, W - 96).forEach((ln, i) => g.fillText(ln, 48, y + i * 40)); };
    const top = 110, rowH = 78, per = 6;
    const list = (items, render) => { const pages = Math.max(1, Math.ceil(items.length / per)); vr.page = Math.min(vr.page, pages - 1); items.slice(vr.page * per, vr.page * per + per).forEach((it, i) => render(it, top + i * (rowH + 8))); if (pages > 1) { btn(24, H - 84, 150, 60, '◀', () => { vr.page = Math.max(0, vr.page - 1); drawVR(); }); btn(184, H - 84, 150, 60, '▶', () => { vr.page = Math.min(pages - 1, vr.page + 1); drawVR(); }); } };
    const label = (name, sub, y) => { g.fillStyle = '#fff'; g.font = 'bold 32px Poppins, Arial'; g.textBaseline = 'top'; g.fillText(String(name).slice(0, 22), 48, y + 6); g.fillStyle = '#94a3b8'; g.font = '24px Poppins, Arial'; g.fillText(String(sub).slice(0, 44), 48, y + 44); };
    if (!me()) say('Sign in on the page first (take the headset off for a moment), then come back.', top + 30);
    else if (S.status === 'missing') say('People in the mall is switching on soon.', top + 30);
    else if (!S.adult) { say('People, messages and the plaza are for confirmed adults. Confirm your age once on allofus.one.', top + 30); btn(48, top + 140, 420, 70, '🌍 Go to allofus.one', () => goAllofus('/')); }
    else if (v === 'here') { const L = [...S.people.values()].filter(p => visible(p.user_id));
      btn(W - 380, H - 84, 356, 60, S.plaza ? '🌐 Plaza: ON' : '🔒 Plaza: off', () => setPlaza(!S.plaza).then(drawVR), { fill: S.plaza ? '#0e7490' : undefined });
      if (!L.length) say(S.plaza ? 'Nobody you can see is in the mall right now.' : 'None of your connections or Circle people are in the mall right now. Turn on the plaza to also see other verified adults who turned it on.', top + 20);
      list(L, (p, y) => { label(p.name, (p.rel === 'connection' ? 'Connection' : p.rel === 'circle' ? 'Circle' : 'Plaza') + ' · ' + whereText(p), y); btn(W - 410, y + 8, 180, 62, 'Join', () => join(p), { fill: '#16a34a' }); if (p.rel === 'connection') btn(W - 220, y + 8, 180, 62, '💬 Chat', () => openVR('thread', p.user_id)); else if (!S.reqOut.has(p.user_id)) btn(W - 220, y + 8, 180, 62, '🤝 Connect', () => connect(p.user_id, p.name)); }); }
    else if (v === 'msgs') { if (!S.mine.length) say('Your allofus.one connections and Circle people show here.', top + 20);
      list(S.mine, (p, y) => { label((p.unread ? '● ' : '') + p.name, p.in_mall ? '🟢 in the mall' + (p.mall_place ? ' · ' + p.mall_place : '') : p.on_allofus ? '🌍 on allofus.one' : (p.rel === 'connection' ? 'Connection' : 'Circle'), y); if (p.rel === 'connection') btn(W - 220, y + 8, 180, 62, '💬 Open', () => openVR('thread', p.user_id)); else btn(W - 220, y + 8, 180, 62, '🤝 Connect', () => connect(p.user_id, p.name)); }); }
    else if (v === 'req') { if (!S.reqIn.length) say('No connect requests waiting.', top + 20);
      list(S.reqIn, (r, y) => { label(r.name, 'wants to connect', y); btn(W - 410, y + 8, 180, 62, 'Accept', () => answer(r, true), { fill: '#16a34a' }); btn(W - 220, y + 8, 180, 62, 'Not now', () => answer(r, false)); }); }
    else if (v === 'thread') { const id = S.open.with, m = me(); const p = S.mine.find(x => x.user_id === id) || S.people.get(id) || { name: personName(id) };
      g.fillStyle = '#fff'; g.font = 'bold 34px Poppins, Arial'; g.textBaseline = 'top'; g.fillText(String(p.name).slice(0, 24), 48, top);
      if (S.people.get(id) && visible(id)) btn(W - 230, top - 6, 206, 56, '📍 Join them', () => join(S.people.get(id)), { fill: '#16a34a' });
      if (hasSafety()) btn(W - 330, top - 6, 90, 56, '🛡️', () => { closeVR(); safety(id, p.name); });
      /* the last few messages, newest at the bottom */
      g.font = '26px Poppins, Arial'; const maxW = W * 0.62; let y = 420; const bubbles = [];
      for (const r of S.open.msgs.slice(-8).reverse()) { const lines = wrap(g, r.body, maxW).slice(0, 3); const h = lines.length * 32 + 18; if (y - h < top + 60) break; y -= h + 8; bubbles.push({ r, lines, y, h }); }
      for (const b of bubbles) { const mine = b.r.sender === m.id; const w = Math.min(maxW, Math.max(...b.lines.map(l => g.measureText(l).width))) + 32; const x = mine ? W - 48 - w : 48; g.fillStyle = mine ? '#4f46e5' : 'rgba(255,255,255,.14)'; rr(g, x, b.y, w, b.h, 16); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'top'; b.lines.forEach((l, i) => g.fillText(l, x + 16, b.y + 9 + i * 32)); }
      if (!S.open.msgs.length) say('Say hi 👋', top + 80);
      /* reply: a heard sentence waits for a tap; otherwise the quick replies */
      if (vr.pending) { say('Send: “' + vr.pending + '”', 440); btn(48, 560, 300, 70, '✅ Send', async () => { const t = vr.pending; vr.pending = null; await send(id, t); drawVR(); }, { fill: '#16a34a' }); btn(364, 560, 300, 70, '✕ Cancel', () => { vr.pending = null; drawVR(); }); }
      else { QUICK.forEach((q, i) => btn(24 + (i % 4) * 246, 436 + Math.floor(i / 4) * 78, 234, 66, q, () => send(id, q), { font: 'bold 25px Poppins, Arial' }));
        if (window.SpeechRecognition || window.webkitSpeechRecognition) btn(24, 600, 300, 66, '🎤 Speak a message', () => listenSpeech((t) => { vr.pending = t; drawVR(); }), { fill: '#0e7490' }); }
      btn(24, H - 84, 200, 60, '◀ Back', () => { S.open = { view: 'msgs', with: null, msgs: [] }; drawVR(); });
      btn(W - 420, H - 84, 396, 60, '🌍 Continue on allofus.one', () => goAllofus('/', p.username ? { v: 'dm', with: p.username } : {})); }
    if (v !== 'thread' && S.adult) btn(W - 380 - (v === 'here' ? 370 : 0), H - 84, 356, 60, '🌍 Go to allofus.one', () => goAllofus('/'));
    sc.dirty(); };
  /* a small "new message" card in view for 10 s; a tap opens the chat */
  const vrNotify = (who, text, id) => { if (vr.sc) { draw(); return; } if (vr.note) { app.scene.remove(vr.note.mesh); removeScreen(app, vr.note.mesh); }
    const n = makeScreen(app, { w: 0.6, h: 0.15, px: 640, py: 160, up: (u) => { if (u >= 0) { drop(); openVR('thread', id); } } }); vr.note = n; const g = n.g; g.fillStyle = 'rgba(79,70,229,.95)'; rr(g, 0, 0, 640, 160, 40); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 34px Poppins, Arial'; g.textBaseline = 'top'; g.fillText(('💬 ' + who).slice(0, 26), 28, 22); g.font = '28px Poppins, Arial'; g.fillText(String(text).slice(0, 34) + ' · tap', 28, 86); n.dirty();
    app.scene.add(n.mesh); placeInView(n.mesh, 1.1, -0.35); const drop = () => { if (vr.note === n) { app.scene.remove(n.mesh); removeScreen(app, n.mesh); vr.note = null; } }; setTimeout(drop, 10000); };
  /* the panel closes when you leave the headset */
  app.onUpdate(() => { if (vr.sc && !xrOn()) closeVR(); });

  /* ---------- the dock badge (wvm-plus.js draws the 👥 button; we only add the count) ---------- */
  const badge = () => { const b = $('#mp-dock [data-k=people]'); if (!b) return; let e = $('em', b); const n = S.unread + S.reqIn.length; if (!n) { if (e) e.remove(); return; } if (!e) { e = document.createElement('em'); e.className = 'ws-dot'; b.appendChild(e); } e.textContent = n > 9 ? '9+' : n; };

  /* ---------- player card buttons (wvm-plus.js playerCard calls this) ---------- */
  const decorateCard = (m, r) => { const rowEl = $('.mp-row', m); if (!rowEl || !r || !me() || r.id === me().id) return; const b = document.createElement('button'); b.className = 'mp-btn';
    if (connected(r.id)) { b.textContent = '💬 Message'; b.onclick = () => { ctx.close(); open('thread', r.id); }; } else if (S.reqOut.has(r.id)) { b.textContent = '⏳ Request sent'; b.disabled = true; } else { b.textContent = '🤝 Connect on allofus'; b.onclick = () => { ctx.close(); connect(r.id, r.name); }; }
    rowEl.appendChild(b); };
  /* the same buttons as decorateCard, as { label, fn } actions for the shield's app.popup player card (flat + VR) */
  const cardActions = (r) => { if (!r || !me() || r.id === me().id) return []; if (connected(r.id)) return [{ label: '💬 Message', fn: () => open('thread', r.id) }]; if (S.reqOut.has(r.id)) return [{ label: '⏳ Request sent', fn: () => { } }]; return [{ label: '🤝 Connect on allofus', fn: () => connect(r.id, r.name) }]; };

  /* ---------- run ---------- */
  const tick = async () => { try { await heartbeat(); await refresh(); } catch (e) { console.warn('social tick', e); } };
  let started = false; const start = () => { if (started || !sb()) return; started = true; tick(); refreshMine(); listen(); setInterval(tick, 15000); setInterval(refreshMine, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }); try { sb().auth.onAuthStateChange(() => setTimeout(() => { const c = sb(); for (const ch of [S.inbox, S.myChan, ...S.chans.values()]) { try { ch && c.removeChannel(ch); } catch (e) { } } S.inbox = null; S.myChan = null; S.chans.clear(); tick(); refreshMine(); listen(); }, 600)); } catch (e) { } };
  { let k = 0; const w = setInterval(() => { if (sb() || ++k > 120) { clearInterval(w); start(); } }, 500); }
  addEventListener('pagehide', () => { const c = sb(), m = me(); if (c && m) { try { c.from('wvm_presence').delete().eq('user_id', m.id).then(() => { }, () => { }); } catch (e) { } } });

  registerMenuEntry({ id: 'people', icon: '👥', label: 'People & messages', fn: () => open('here'), badge: () => S.unread + S.reqIn.length });
  registerMenuEntry({ id: 'allofus', icon: '🌍', label: 'Go to allofus.one', fn: () => goAllofus('/') });
  /* ---------- presence API for other mall layers (e.g. The World Fire): see SOCIAL-API.md ---------- */
  const presenceList = () => [...S.people.values()].filter(p => visible(p.user_id)).map(p => ({ id: p.user_id, name: p.name, username: p.username, rel: p.rel, page: p.page, store: p.store || null, place: p.place || null, placeName: p.place_name || null, x: p.x, z: p.z, level: p.level || 0, lastSeen: p.last_seen, here: p.page === pageKind && (p.store || null) === storeSlug }));
  const presenceSubs = new Set(); let lastPresence = '';
  function emitPresence() { const L = presenceList(); const k = JSON.stringify(L.map(p => [p.id, p.page, p.place, Math.round(p.x || 0), Math.round(p.z || 0)])); if (k === lastPresence) return; lastPresence = k; for (const f of presenceSubs) { try { f(L); } catch (e) { console.warn('onPresence', e); } } }
  const onPresence = (cb) => { if (typeof cb !== 'function') return () => { }; presenceSubs.add(cb); try { cb(presenceList()); } catch (e) { } return () => presenceSubs.delete(cb); };
  const joinUser = (id) => { const p = S.people.get(id); if (!p || !visible(id)) { toast('That person isn’t in the mall right now, or hasn’t shared where they are with you.', 4000); return false; } join(p); return true; };
  const myPeople = () => S.mine.map(p => ({ id: p.user_id, name: p.name, username: p.username, rel: p.rel, inMall: !!p.in_mall, mallPlace: p.mall_place || null, onAllofus: !!p.on_allofus, unread: p.unread || 0, canMessage: p.rel === 'connection' }));
  const api = { presence: presenceList, onPresence, joinUser, myPeople, here, open, openVR, close: closeAll, visible, live: () => S.status === 'live', connect, send, join, decorateCard, cardActions, handoffUrl, goAllofus, setPlaza, state: () => ({ status: S.status, adult: S.adult, plaza: S.plaza, people: [...S.people.values()], mine: S.mine, unread: S.unread, requests: S.reqIn }) };
  window.WVM_SOCIAL = api; return api;
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function injectCSS() { if (document.getElementById('ws-css')) return; const s = document.createElement('style'); s.id = 'ws-css'; s.textContent = `
.ws-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}.ws-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:8px 12px;font:800 13px Poppins,Arial;cursor:pointer;color:#0f172a}.ws-tabs button.on{background:#1e1b4b;color:#fff;border-color:#1e1b4b}.ws-tabs em,.ws-n{font-style:normal;background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px}
.ws-body h4{margin:12px 0 6px;font:900 13px Poppins,Arial;text-transform:uppercase;letter-spacing:.05em;color:#475569}.ws-li{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid #f1f5f9;border-radius:14px;margin-bottom:6px}.ws-ava{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;font:900 18px Poppins,Arial;flex:none}.ws-who{flex:1;min-width:0}.ws-who b{display:block}.ws-who small{color:#64748b;font-size:12.5px}.ws-act{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ws-rel{font-style:normal;font-size:10.5px;font-weight:900;border-radius:8px;padding:1px 6px;margin-right:4px}.ws-rel.c{background:#dcfce7;color:#166534}.ws-rel.o{background:#e0e7ff;color:#3730a3}.ws-rel.p{background:#fef3c7;color:#92400e}
.ws-plaza{display:flex!important;gap:10px;align-items:flex-start;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:10px;font-weight:600!important}.ws-plaza input{width:22px;height:22px;flex:none;accent-color:#0e7490}
.ws-th{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ws-th b{flex:1;font:900 16px Poppins,Arial}.ws-msgs{height:min(40vh,320px);overflow:auto;background:#f8fafc;border-radius:14px;padding:10px;margin:8px 0;display:flex;flex-direction:column;gap:6px}.ws-m{max-width:78%;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:7px 11px;white-space:pre-wrap;word-break:break-word}.ws-m.me{align-self:flex-end;background:#4f46e5;color:#fff;border-color:#4f46e5}
.ws-q{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.ws-q button{border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:6px 10px;font:700 12.5px Poppins,Arial;cursor:pointer}.ws-in{display:flex;gap:6px;align-items:center}.ws-in input{flex:1;margin:0!important}
.ws-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:10px}
#mp-dock [data-k=people]{position:relative}.ws-dot{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:10px;font:900 10px Poppins,Arial;font-style:normal;padding:2px 5px}
`; document.head.appendChild(s); }
