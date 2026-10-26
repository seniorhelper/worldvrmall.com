/* ============================================================
   World VR Mall · The World Fire · realtime transport (gather-1, Oct 2026)
   One small wrapper around a realtime channel so the circle code never cares where messages travel:
     open(kind, page) -> { ready, send(ev, payload), on(ev, fn), onSync(fn(members)), track(meta), members(), leave() }
   kind 'main' or 'voice', page e.g. 'fire-lobby', 'fire-12', 'fire-pk7m2qx3'.
   LIVE: WVM_SHIELD.topic(kind, page) -> 'wvm:a:fire-12' / 'wvm:a:fire-12:voice', joined with WVM_SHIELD.channel()
     (private Supabase channel; the database's wvm_rt_allowed() lets adults only into wvm:a:*). No shield = no channel.
   DEV: ?firetest=1 on localhost / 127.0.0.1 only: a BroadcastChannel between tabs of this browser, presence emulated by
     heartbeats. Lets two windows test circles, seats, video and voice with no accounts.
   ============================================================ */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/;
/* the mall's 3D boot can reload the page without its query, so the switch is also remembered on this device
   (localStorage wf_firetest = '1'; ?firetest=0 turns it off). Never on a real host. */
export const devLocal = (() => { try { if (!LOCAL_HOSTS.test(location.hostname)) return false; const q = location.search + ' ' + ((performance.getEntriesByType('navigation')[0] || {}).name || ''); if (/[?&]firetest=0\b/.test(q)) localStorage.removeItem('wf_firetest'); else if (/[?&]firetest=1\b/.test(q)) localStorage.setItem('wf_firetest', '1'); return localStorage.getItem('wf_firetest') === '1'; } catch (e) { return false; } })();

/* dev identity: one per tab (sessionStorage), so two windows are two people */
export function devMe() {
  let id = null; try { id = sessionStorage.getItem('wf_dev_id'); } catch (e) { }
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2, 8); try { sessionStorage.setItem('wf_dev_id', id); } catch (e) { } }
  return { id, name: 'Tester ' + id.slice(4, 7).toUpperCase() };
}

const shield = () => window.WVM_SHIELD || null;

export function open(kind, page, myId) {
  return devLocal ? localChannel(kind + ':' + page, myId) : shieldChannel(kind, page, myId);
}

function hub() {
  const subs = new Map(); let syncFns = [];
  return {
    on(ev, fn) { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push(fn); return () => { const L = subs.get(ev) || []; const i = L.indexOf(fn); if (i >= 0) L.splice(i, 1); }; },
    emit(ev, p) { for (const fn of (subs.get(ev) || []).slice()) { try { fn(p); } catch (e) { console.warn('fire', ev, e); } } },
    onSync(fn) { syncFns.push(fn); }, sync(list) { for (const fn of syncFns) { try { fn(list); } catch (e) { console.warn('fire sync', e); } } },
    clear() { subs.clear(); syncFns = []; },
  };
}

function shieldChannel(kind, page, myId) {
  const S = shield(); const H = hub(); let ch = null, list = [], meta = null, alive = true;
  const t = S && S.topic ? S.topic(kind, page) : null;
  if (!S || !S.channel || !t) return { ready: Promise.resolve(false), send() { }, on: H.on, onSync: H.onSync, track() { }, members: () => [], leave() { } };
  ch = S.channel(t, { broadcast: { self: false }, presence: { key: myId } });
  const read = () => { const st = ch.presenceState(); list = Object.keys(st).map((k) => Object.assign({}, (st[k] && st[k][0]) || {}, { id: k })); H.sync(list); };
  ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (payload && payload.ev && payload.from !== myId && (!payload.to || payload.to === myId)) H.emit(payload.ev, payload); });
  ch.on('presence', { event: 'sync' }, read);
  const ready = new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    ch.subscribe(async (st) => { if (!alive) return; if (st === 'SUBSCRIBED') { if (meta) { try { await ch.track(meta); } catch (e) { } } fin(true); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') fin(false); });
    setTimeout(() => fin(false), 12000);
  });
  return {
    ready,
    send(ev, payload = {}) { if (ch) ch.send({ type: 'broadcast', event: 'm', payload: Object.assign({}, payload, { ev, from: myId }) }); },
    on: H.on, onSync: H.onSync,
    track(m) { meta = m; if (ch) ch.track(m).catch(() => { }); },
    members: () => list,
    async leave() { alive = false; H.clear(); if (!ch) return; const c = ch; ch = null; try { await c.untrack(); } catch (e) { } try { await c.unsubscribe(); } catch (e) { } },
  };
}

function localChannel(name, myId) {
  const H = hub(); const bc = new BroadcastChannel('wvm-fire:' + name); const peers = new Map(); let meta = null, beat = 0, alive = true;
  const list = () => [...peers.entries()].map(([id, p]) => Object.assign({}, p.meta, { id })).concat(meta ? [Object.assign({}, meta, { id: myId })] : []);
  let last = ''; const sync = () => { const L = list(); const k = JSON.stringify(L.map(m => [m.id, m]).sort()); if (k !== last) { last = k; H.sync(L); } };
  const announce = () => { if (meta && alive) bc.postMessage({ k: 'pres', id: myId, meta }); };
  bc.onmessage = (e) => { const d = e.data || {}; if (!alive || d.id === myId) return;
    if (d.k === 'pres') { peers.set(d.id, { meta: d.meta, seen: Date.now() }); sync(); }
    else if (d.k === 'who') announce();
    else if (d.k === 'bye') { peers.delete(d.id); sync(); }
    else if (d.k === 'm' && d.p && (!d.p.to || d.p.to === myId)) H.emit(d.p.ev, d.p); };
  beat = setInterval(() => { announce(); const now = Date.now(); let ch = false; for (const [id, p] of peers) if (now - p.seen > 5000) { peers.delete(id); ch = true; } if (ch) sync(); }, 1500);
  addEventListener('pagehide', () => { try { bc.postMessage({ k: 'bye', id: myId }); } catch (e) { } });
  return {
    ready: Promise.resolve(true).then(() => { bc.postMessage({ k: 'who', id: myId }); return true; }),
    send(ev, payload = {}) { if (alive) bc.postMessage({ k: 'm', id: myId, p: Object.assign({}, payload, { ev, from: myId }) }); },
    on: H.on, onSync: H.onSync,
    track(m) { meta = m; announce(); sync(); },
    members: list,
    async leave() { alive = false; clearInterval(beat); try { bc.postMessage({ k: 'bye', id: myId }); } catch (e) { } H.clear(); bc.close(); },
  };
}
