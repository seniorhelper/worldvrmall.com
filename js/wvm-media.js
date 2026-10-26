/* ============================================================
   SOUND + SCREENS · Oct 25 2026
   One sound system for the 3D pages (outside + mall):
   · a global Sound on/off (localStorage wvm_sound), nothing plays until the visitor's first tap or key
     (browser autoplay rules), the context sleeps while the tab is hidden
   · spatial loops (HRTF PositionalAudio, linear fade to silence at maxDistance, at most 8 live):
     the World Fountain and the Wishing Fountain, the lobby music bed, the mall ambience bed indoors
   · ride audio: a ride that gets fast is a coaster -> the coaster track, a whoosh on the fast parts,
     the lift-chain clack while climbing slowly
   · a shop chime when you step up to a storefront door
   · big video screens: poster first, the video only loads within 45 m, plays muted on loop,
     tap (or laser) for sound, spatial, with a neon voice box under the screen while it talks
   Sounds: ElevenLabs Sound Effects + Music (Pro plan, commercial licence), see CONTENT.md.
   window.WVM_SOUND = { on, set(on), toggle(), onChange(fn), context(), play(name, opts) };
   other modules can also listen for the 'wvm-sound' window event ({ detail: { on } }).
   ============================================================ */
import * as THREE from 'three';
import { makeVoiceBox } from './wvm-voicebox.js';
const T = THREE;
const KEY = 'wvm_sound', A = '/audio/', MAX_LIVE = 8;
/* content length in samples at 44.1 kHz: the MP3 decoder adds ~1524 samples in front, so loops play [skip, skip + n] (gapless) */
const LOOPS = { 'world-fire-crackle': 1322999, 'mall-ambience': 1322999, fountain: 881999, 'coaster-clack': 661499, 'lobby-music': 2470624, 'coaster-music': 2514724 };
const VOL = { music: 1, amb: 1, sfx: 1, voice: 1 };

const pref = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
const S = { on: pref(), unlocked: false, listener: null, bufs: new Map(), subs: [], duck: { music: 1, amb: 1, sfx: 1 }, app: null };

/* ---------- context + buffers ---------- */
function listener() {
  if (S.listener || !S.app || !S.app.camera) return S.listener;
  S.listener = new T.AudioListener(); S.app.camera.add(S.listener); S.listener.setMasterVolume(S.on ? 1 : 0);
  return S.listener;
}
export function context() { const l = listener(); return l ? l.context : null; }
function buffer(name) {
  if (S.bufs.has(name)) return S.bufs.get(name);
  const ctx = context(); if (!ctx) return Promise.resolve(null);
  const p = fetch(A + name + '.mp3').then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)).catch(() => null);
  S.bufs.set(name, p); return p;
}
/* play a THREE.Audio / PositionalAudio buffer looped, from a random point unless fromStart (so two loops never phase) */
function startLoop(au, name, buf, vol, fromStart) {
  au.setBuffer(buf); au.setLoop(true); au.setVolume(vol);
  const n = LOOPS[name]; let skip = 0;
  if (n) { skip = Math.min(1524, Math.max(0, buf.length * 44100 / buf.sampleRate - n)) / 44100; au.setLoopStart(skip); au.setLoopEnd(skip + n / 44100); }
  au.offset = skip + (n && !fromStart ? Math.random() * n / 44100 : 0);
  au.play();
}

/* ---------- on / off ---------- */
function set(on) {
  S.on = !!on; try { localStorage.setItem(KEY, S.on ? 'on' : 'off'); } catch (e) { }
  const l = S.listener; if (l) { l.gain.gain.setTargetAtTime(S.on ? 1 : 0, l.context.currentTime, 0.08); if (S.on && S.unlocked) l.context.resume().catch(() => { }); }
  for (const f of S.subs) { try { f(S.on); } catch (e) { } }
  try { window.dispatchEvent(new CustomEvent('wvm-sound', { detail: { on: S.on } })); } catch (e) { }
  return S.on;
}
function unlock() {
  if (S.unlocked) return; S.unlocked = true; const ctx = context(); if (ctx && S.on) ctx.resume().catch(() => { });
}
export const WVM_SOUND = {
  get on() { return S.on; }, set, toggle: () => set(!S.on), onChange(f) { S.subs.push(f); return f; },
  context, unlocked: () => S.unlocked,
  /* one-shot, optionally spatial: play('store-chime', { at: [x, y, z], vol }) */
  async play(name, o = {}) {
    if (!S.on || !S.unlocked) return null; const buf = await buffer(name); const l = listener(); if (!buf || !l) return null;
    let au; if (o.at) { au = new T.PositionalAudio(l); au.panner.panningModel = 'HRTF'; au.setRefDistance(o.ref || 4); au.setMaxDistance(o.max || 40); au.setDistanceModel('linear'); const h = new T.Object3D(); h.position.fromArray(o.at); S.app.scene.add(h); h.add(au); au.onEnded = () => { h.removeFromParent(); }; }
    else au = new T.Audio(l);
    au.setBuffer(buf); au.setVolume((o.vol ?? 0.8) * (VOL[o.cat || 'sfx'] || 1) * (S.duck[o.cat || 'sfx'] ?? 1)); au.play(); return au;
  },
};

/* ---------- the toggle: a nav item when the new nav (WVM_NAV) is there, else a small floating button ---------- */
const ICON_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function mountToggle() {
  const item = () => ({ id: 'sound', label: S.on ? 'Sound on' : 'Sound off', icon: S.on ? ICON_ON : ICON_OFF, where: 'bar', order: 90, sub: 'Music, rides and screens', vr: true, onClick: () => { unlock(); set(!S.on); return false; } });
  const nav = () => window.WVM_NAV;
  setTimeout(() => {
    if (nav() && nav().register) { const h = nav().register(item()); S.subs.push(() => { try { h.update(item()); } catch (e) { } }); return; }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wvm-sound-btn';
    const paint = () => { b.innerHTML = S.on ? ICON_ON : ICON_OFF; b.setAttribute('aria-pressed', S.on ? 'true' : 'false'); b.setAttribute('aria-label', S.on ? 'Sound on. Tap to mute' : 'Sound off. Tap to turn on'); b.title = b.getAttribute('aria-label'); };
    const st = document.createElement('style'); st.textContent = '.wvm-sound-btn{position:fixed;left:12px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:40;width:44px;height:44px;border-radius:50%;border:1px solid rgba(56,240,255,.55);background:rgba(6,12,32,.78);color:#7cf8ff;display:grid;place-items:center;cursor:pointer;box-shadow:0 0 14px rgba(56,240,255,.25)}.wvm-sound-btn[aria-pressed=false]{color:#9fb3d9;border-color:rgba(159,179,217,.4);box-shadow:none}.wvm-sound-btn:focus-visible{outline:2px solid #ffd23f;outline-offset:2px}';
    document.head.appendChild(st); paint(); b.onclick = () => { unlock(); set(!S.on); }; S.subs.push(paint); document.body.appendChild(b);
  }, 2500);
}

/* ---------- where things are ---------- */
const PAGE = () => (/^\/mall\b/.test(location.pathname) ? 'mall' : 'outside');
const PLACES = {
  mall: {
    loops: [
      { name: 'fountain', at: [0, 1.5, 0], ref: 6, max: 38, vol: 0.55, cat: 'amb' },          /* the World Fountain under the atrium dome */
      { name: 'lobby-music', at: [2, 7, 70], ref: 22, max: 85, vol: 0.32, cat: 'music' },     /* between the Grand Lobby and the Atrium */
    ],
    bed: { name: 'mall-ambience', vol: 0.22, cat: 'amb' },
    screens: [
      { id: 'promo-screen', src: '/media/video/wvm-promo-720.mp4', poster: '/media/video/wvm-promo-poster.jpg', at: [0, 8.4, -31], ry: 0, w: 14, place: { name: '📺 The Big Screen · World VR Mall in 40 seconds', x: 0, z: -14, look: [0, -31], say: 'The Big Screen under the dome plays the World VR Mall film on a loop. Tap it for sound.' } },
      { id: 'screen-food', src: '/media/video/allofus-promo-720.mp4', poster: '/media/video/allofus-promo-poster.jpg', at: [100, 7.5, -82], ry: Math.PI, w: 10 },
    ],
  },
  outside: {
    loops: [
      { name: 'fountain', at: [-26, 1.5, 100], ref: 5, max: 32, vol: 0.5, cat: 'amb' },        /* the Wishing Fountain on the plaza */
    ],
    bed: null,
    screens: [
      { id: 'screen-plaza', src: '/media/video/wvm-promo-720.mp4', poster: '/media/video/wvm-promo-poster.jpg', at: [-58, 8.5, 104], ry: Math.PI / 2, w: 12 }, /* west lawn, facing the Wishing Fountain */
    ],
  },
};

/* ---------- spatial loops: keep the nearest 8 alive ---------- */
function runLoops(app, list) {
  const spots = list.map((s) => Object.assign({ au: null, holder: null, loading: false }, s));
  const cam = new T.Vector3();
  const kill = (s) => { if (s.au) { try { if (s.au.isPlaying) s.au.stop(); } catch (e) { } s.holder.removeFromParent(); s.au = null; s.holder = null; } };
  return () => {
    if (!S.unlocked) return; const l = listener(); if (!l) return;
    (app.renderer.xr.isPresenting ? app.renderer.xr.getCamera() : app.camera).getWorldPosition(cam);
    const near = spots.map((s) => ({ s, d: Math.hypot(s.at[0] - cam.x, s.at[1] - cam.y, s.at[2] - cam.z) })).filter((o) => o.d < o.s.max * 1.05 && (o.s.level === undefined || o.s.level === (app.level || 0))).sort((a, b) => a.d - b.d).slice(0, MAX_LIVE).map((o) => o.s);
    for (const s of spots) {
      if (!near.includes(s) || !S.on) { kill(s); continue; }
      const v = s.vol * (VOL[s.cat] || 1) * (S.duck[s.cat] ?? 1);
      if (s.au) { s.au.gain.gain.setTargetAtTime(v, l.context.currentTime, 0.4); continue; }
      if (s.loading) continue; s.loading = true;
      buffer(s.name).then((buf) => {
        s.loading = false; if (!buf || s.au || !S.on) return;
        const au = new T.PositionalAudio(l); au.panner.panningModel = 'HRTF'; au.setDistanceModel('linear'); au.setRefDistance(s.ref); au.setMaxDistance(s.max); au.setRolloffFactor(1);
        const h = new T.Object3D(); h.position.fromArray(s.at); app.scene.add(h); h.add(au); s.au = au; s.holder = h; startLoop(au, s.name, buf, 0); au.gain.gain.setTargetAtTime(v, l.context.currentTime, 0.6);
      });
    }
  };
}

/* ---------- a non-spatial bed (indoor ambience) ---------- */
function runBed(app, bed) {
  let au = null, loading = false;
  return () => {
    if (!bed || !S.unlocked) return; const l = listener(); if (!l) return;
    const want = S.on && !app.ride && (app.level || 0) >= 0; const v = bed.vol * (S.duck[bed.cat] ?? 1);
    if (!want) { if (au) au.gain.gain.setTargetAtTime(0, l.context.currentTime, 0.5); return; }
    if (au) { au.gain.gain.setTargetAtTime(v, l.context.currentTime, 0.6); return; }
    if (loading) return; loading = true; buffer(bed.name).then((buf) => { if (!buf) return; au = new T.Audio(l); startLoop(au, bed.name, buf, 0); au.gain.gain.setTargetAtTime(v, l.context.currentTime, 1.2); });
  };
}

/* ---------- rides: fast = coaster ---------- */
function runRides(app) {
  const prev = new T.Vector3(), cur = new T.Vector3(); let on = false, coaster = false, music = null, clack = null, lastWhoosh = -99, t0 = 0, have = false, climbT = 0;
  const fade = (au, v, tc) => { if (au && S.listener) au.gain.gain.setTargetAtTime(v, S.listener.context.currentTime, tc); };
  const stopAll = () => { const m = music, c = clack; music = null; clack = null; fade(m, 0, 0.5); fade(c, 0, 0.2); setTimeout(() => { try { m && m.isPlaying && m.stop(); c && c.isPlaying && c.stop(); } catch (e) { } }, 2500); };
  return (dt, t) => {
    if (!app.ride) { if (on) { on = false; coaster = false; climbT = 0; stopAll(); } have = false; return; }
    if (!on) { on = true; t0 = t; }
    (app.renderer.xr.isPresenting ? app.renderer.xr.getCamera() : app.camera).getWorldPosition(cur);
    if (!have) { prev.copy(cur); have = true; return; }
    /* engine time: rides advance on app.t, so dt (not the wall clock) gives the speeds the ride was designed with */
    const sp = cur.distanceTo(prev) / Math.max(dt, 1e-3), vy = (cur.y - prev.y) / Math.max(dt, 1e-3); prev.copy(cur);
    if (!S.on || !S.unlocked || sp > 120) return; /* > 120 m/s is a teleport, not a ride */
    const l = listener(); if (!l) return;
    if (!coaster && sp > 12 && t - t0 > 0.5) {
      coaster = true; buffer('coaster-music').then((buf) => { if (!buf || !coaster || music) return; music = new T.Audio(l); startLoop(music, 'coaster-music', buf, 0, true); fade(music, 0.42 * (S.duck.music ?? 1), 0.8); });
    }
    /* a lift hill: a slow, steady climb that also moves forward (a coaster's first hill comes before it is ever fast) */
    const hz = Math.sqrt(Math.max(0, sp * sp - vy * vy)); climbT = vy > 0.8 && vy < 5 && hz > 1.5 && hz < 7 ? climbT + dt : 0;
    const climbing = climbT > 2 || (coaster && vy > 0.6 && sp < 7);
    if (coaster && sp > 17 && t - lastWhoosh > 5) { lastWhoosh = t; WVM_SOUND.play('coaster-whoosh', { vol: 0.7 }); }
    if (climbing && !clack) buffer('coaster-clack').then((buf) => { if (!buf || clack || !app.ride) return; clack = new T.Audio(l); startLoop(clack, 'coaster-clack', buf, 0); fade(clack, 0.5, 0.2); });
    if (!climbing && clack) { const c = clack; clack = null; fade(c, 0, 0.25); setTimeout(() => { try { c.isPlaying && c.stop(); } catch (e) { } }, 1500); }
  };
}

/* ---------- store doors chime ---------- */
function runChimes(app) {
  const last = new Map(); let stores = null;
  return () => {
    if (!S.on || !S.unlocked || app.ride || app.vehicle) return;
    if (!stores) { stores = (app.places || []).filter((p) => p.x !== undefined && !p.url && (/store/i.test(p.cat || '') || p.store)); if (!stores.length) { stores = null; return; } }
    const p = app.player.position, now = performance.now();
    for (const s of stores) {
      if ((s.level || 0) !== (app.level || 0)) continue;
      if (Math.abs(s.x - p.x) < 2.2 && Math.abs(s.z - p.z) < 2.2 && now - (last.get(s.id) || -1e9) > 30000) { last.set(s.id, now); WVM_SOUND.play('store-chime', { at: [s.x, 2.6, s.z], vol: 0.55, ref: 3, max: 18 }); }
    }
  };
}

/* ---------- video screens ---------- */
const screens = []; let loud = null;
function makeVideoScreen(app, o) {
  const w = o.w || 12, h = w * 9 / 16; const g = new T.Group(); g.position.fromArray(o.at); g.rotation.y = o.ry || 0; g.name = o.id;
  const frame = new T.Mesh(new T.BoxGeometry(w + 0.5, h + 0.5, 0.3), new T.MeshStandardMaterial({ color: 0x0b1226, metalness: 0.6, roughness: 0.35 })); frame.position.z = -0.17; g.add(frame);
  const edge = new T.Mesh(new T.BoxGeometry(w + 0.7, h + 0.7, 0.05), new T.MeshBasicMaterial({ color: 0x38f0ff, toneMapped: false })); edge.position.z = -0.34; g.add(edge);
  const mat = new T.MeshBasicMaterial({ color: 0x0a1430, toneMapped: false }); const scr = new T.Mesh(new T.PlaneGeometry(w, h), mat); g.add(scr);
  const tag = new T.Mesh(new T.PlaneGeometry(w * 0.34, w * 0.034), new T.MeshBasicMaterial({ map: label('Tap for sound'), transparent: true, toneMapped: false, depthWrite: false })); tag.position.set(0, -h / 2 - w * 0.03, 0.02); g.add(tag);
  const box = makeVoiceBox({ w: w * 0.22, bars: 11 }); box.mesh.position.set(w * 0.36, -h / 2 - w * 0.06, 0.03); box.mesh.visible = false; g.add(box.mesh);
  g.traverse((c) => { c.userData.noOcclude = true; c.castShadow = false; });
  app.scene.add(g);
  new T.TextureLoader().load(o.poster, (tx) => { tx.colorSpace = T.SRGBColorSpace; sc.poster = tx; if (!sc.video) { mat.map = tx; mat.color.set(0xffffff); mat.needsUpdate = true; } });
  const sc = { o, g, scr, mat, box, tag, video: null, vtex: null, poster: null, au: null, an: null, w };
  app.addHotspot && app.addHotspot(scr, { title: '📺 Tap for sound', fn: () => toggleLoud(app, sc) });
  screens.push(sc); return sc;
}
function label(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 52; const x = c.getContext('2d');
  x.fillStyle = 'rgba(6,12,32,.8)'; x.beginPath(); x.roundRect(2, 2, 508, 48, 24); x.fill(); x.strokeStyle = 'rgba(56,240,255,.7)'; x.lineWidth = 2; x.stroke();
  x.font = '600 26px Poppins, Segoe UI, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#d8fbff'; x.fillText('🔊 ' + text, 256, 27);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function wake(sc) {
  if (sc.video) return; const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.src = sc.o.src;
  const tx = new T.VideoTexture(v); tx.colorSpace = T.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = T.LinearFilter;
  sc.video = v; sc.vtex = tx;
  v.addEventListener('playing', () => { if (sc.video === v) { sc.mat.map = tx; sc.mat.color.set(0xffffff); sc.mat.needsUpdate = true; } }, { once: true });
  v.play().catch(() => { });
}
function sleep(sc) {
  if (!sc.video) return; if (loud === sc) quiet(sc);
  const v = sc.video; sc.video = null; try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
  if (sc.vtex) { sc.vtex.dispose(); sc.vtex = null; } if (sc.au) { try { sc.au.disconnect(); } catch (e) { } sc.au.removeFromParent(); } sc.au = null; sc.an = null; /* a media element source is tied to its element; the next wake makes a new one */
  sc.mat.map = sc.poster || null; if (!sc.poster) sc.mat.color.set(0x0a1430); sc.mat.needsUpdate = true;
}
function quiet(sc) { if (sc.video) sc.video.muted = true; sc.box.mesh.visible = false; sc.tag.visible = true; sc.box.setSource(null); if (loud === sc) loud = null; S.duck.music = 1; S.duck.amb = 1; }
function toggleLoud(app, sc) {
  unlock(); if (loud === sc) { quiet(sc); return; }
  if (loud) quiet(loud); if (!S.on) set(true);
  wake(sc); const l = listener(); if (!l) return;
  if (!sc.au) { try { const au = new T.PositionalAudio(l); au.panner.panningModel = 'HRTF'; au.setDistanceModel('linear'); au.setRefDistance(sc.w * 0.9); au.setMaxDistance(70); au.setMediaElementSource(sc.video); au.setVolume(0.9); sc.g.add(au); sc.au = au; const an = l.context.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.6; au.source.connect(an); sc.an = an; } catch (e) { sc.au = null; } }
  l.context.resume().catch(() => { });
  sc.video.currentTime = 0; sc.video.muted = false; sc.video.play().catch(() => { });
  loud = sc; sc.tag.visible = false; sc.box.mesh.visible = true; sc.box.setSource(sc.an); S.duck.music = 0.15; S.duck.amb = 0.5;
  app.toast && app.toast('🔊 Sound on for the big screen. Tap it again to mute.', 2600);
}
function runScreens(app) {
  const cam = new T.Vector3(), wp = new T.Vector3();
  return (dt, t) => {
    if (!screens.length) return; (app.renderer.xr.isPresenting ? app.renderer.xr.getCamera() : app.camera).getWorldPosition(cam);
    for (const sc of screens) {
      sc.g.getWorldPosition(wp); const d = cam.distanceTo(wp);
      if (d < 45 && !document.hidden) wake(sc); else if (d > 65 || document.hidden) sleep(sc);
      if (sc.box.mesh.visible) sc.box.update(t);
    }
  };
}

/* ---------- ducking under the YouTube radio, Orbit's voice and voice chat ---------- */
function runDuck(app) {
  return () => {
    if (loud) return; const radio = app.radioPanel && app.radioPanel.classList.contains('on'); const talk = !!(window.WVM_ORBIT_VOICE && window.WVM_ORBIT_VOICE.speaking);
    S.duck.music = radio ? 0 : talk ? 0.3 : 1; S.duck.amb = radio ? 0.6 : talk ? 0.6 : 1; S.duck.sfx = 1;
  };
}

/* ---------- install (once per page) ---------- */
let installed = false;
export function installMedia(app) {
  if (installed || !app || !app.scene) return; installed = true; S.app = app; window.WVM_SOUND = WVM_SOUND;
  const P = PLACES[PAGE()];
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, once: false, passive: true });
  document.addEventListener('visibilitychange', () => { const c = S.listener && S.listener.context; if (!c) return; if (document.hidden) c.suspend().catch(() => { }); else if (S.on && S.unlocked) c.resume().catch(() => { }); });
  try { app.renderer.xr.addEventListener('sessionstart', unlock); } catch (e) { }
  mountToggle();
  const loops = runLoops(app, P.loops), bed = runBed(app, P.bed), rides = runRides(app), chimes = runChimes(app), scr = runScreens(app), duck = runDuck(app);
  let acc = 0;
  app.onUpdate((dt, t) => { rides(dt, t); acc += dt; if (acc < 0.25) { if (loud || screens.some((s) => s.box.mesh.visible)) scr(dt, t); return; } acc = 0; duck(); loops(); bed(); chimes(); scr(dt, t); });
  /* screens wait until the world is up and the browser is idle: they never touch the first frame */
  const build = () => { for (const s of P.screens) { makeVideoScreen(app, s); if (s.place && app.addPlace) app.addPlace({ id: s.id, name: s.place.name, icon: '📺', x: s.place.x, z: s.place.z, look: s.place.look, cat: 'Fun', keys: 'video screen film promo trailer movie big screen tv watch', say: s.place.say }); } };
  setTimeout(() => { (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(build, { timeout: 4000 }); }, 5000);
}
