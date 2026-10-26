/* ============================================================
   THE WORLD FIRE · gather-1 · Oct 25 2026
   A round hall under a night-sky dome at (1250, 0), east of Chinatown, reached by a portal in the Grand Lobby.
   ~180 identical fire circles stand on the hall floor. Each circle is its own room: 12 people at most, its own
   realtime channel (shield topic 'wvm:a:fire-<n>'), its own WebRTC mesh for video + voice.
   - Public circles fill in order: when circle n has 12, the next arrival gets n + 1 (the lobby channel counts them;
     if two people race for the 12th seat, the later one moves on by itself).
   - Private circles ("just my group"): a share code / invite; slots at the far side of the hall.
   - Logs are draggable (mouse, finger, VR laser) and synced. Seated people face the fire.
   - Live social (joining a circle, video, voice) is for 18+ verified allofus.one accounts only
     (WVM_SHIELD band 'adult' + canJoinRoom). Everyone else can walk the hall and sit by any fire, alone.
   - Fire: the Lakeside Wilds campfire recipe (three flicker cones + embers) copied, not imported; crackle audio from
     /audio/world-fire-crackle.mp3 when present, else a generated loop. Voices are spatial (wvm-gather-rtc.js).
   - Quest 3 budget: no lights, unlit materials, all distant fires in 4 instanced draw calls, one detailed circle,
     video textures only for the nearest panels in view (5 on headsets / phones, 11 on desktop).
   Debug: window.WVM_FIRE (state, join, leave, slots). Dev without accounts: /mall/?firetest=1 on localhost.
   ============================================================ */
import * as THREE from 'three';
import { makeSprite, makeTextTexture, sitPerson, isMobile } from '/js/wvm-engine.js?v=59';
import { screenOn, makeScreen } from '/js/wvm-screen.js';
import { open, devLocal, devMe } from '/js/wvm-gather-net.js';
import { createMesh, MAX } from '/js/wvm-gather-rtc.js';

const T = THREE;
export const HALL = { x: 1250, z: 0, R: 210 };
const WALL_H = 26, SP = 26, SEAT_R = 3.6, CAP = MAX, PRIV_N = 30;
const ENTRY = { x: HALL.x - 10, z: HALL.z }; // where you arrive: the plaza, beside the grand fire
const MOB = isMobile();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };
const S = () => window.WVM_SHIELD || null;
const SOC = () => window.WVM_SOCIAL || null;

/* ---------- the slots: a hex grid of fire circles, nearest the entrance first ---------- */
function buildSlots() {
  const out = []; const h = SP * Math.sqrt(3) / 2;
  for (let r = -12; r <= 12; r++) for (let q = -12; q <= 12; q++) {
    const x = (q + (r & 1) * 0.5) * SP, z = r * h; const d = Math.hypot(x, z);
    if (d < 46 || d > HALL.R - 18) continue; out.push([HALL.x + x, HALL.z + z]);
  }
  return out.sort((a, b) => Math.hypot(a[0] - HALL.x, a[1] - HALL.z) - Math.hypot(b[0] - HALL.x, b[1] - HALL.z));
}
const defaultSeats = () => Array.from({ length: CAP }, (_, i) => { const a = i / CAP * Math.PI * 2 + 0.26; return [Math.cos(a) * SEAT_R, Math.sin(a) * SEAT_R]; });

/* ---------- canvases ---------- */
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, o = {}) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = MOB ? 2 : 4; if (o.repeat) { t.wrapS = T.RepeatWrapping; t.repeat.set(o.repeat, 1); } return t; };
function floorTex(slots) {
  const N = MOB ? 1024 : 2048, [c, g] = canvas(N, N), k = N / (HALL.R * 2); const P = (x, z) => [(x - HALL.x + HALL.R) * k, (z - HALL.z + HALL.R) * k];
  let gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); gr.addColorStop(0, '#2a1a12'); gr.addColorStop(0.25, '#150f0e'); gr.addColorStop(1, '#07070b'); g.fillStyle = gr; g.fillRect(0, 0, N, N);
  for (let i = 0; i < N * 22; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * N, Math.random() * N, 1.4, 1.4); }
  g.strokeStyle = 'rgba(214,160,90,0.12)'; g.lineWidth = Math.max(1, N / 1400);
  for (let r = 44; r < HALL.R; r += SP) { g.beginPath(); g.arc(N / 2, N / 2, r * k, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(N / 2 + Math.cos(a) * 44 * k, N / 2 + Math.sin(a) * 44 * k); g.lineTo(N / 2 + Math.cos(a) * HALL.R * k, N / 2 + Math.sin(a) * HALL.R * k); g.stroke(); }
  g.globalCompositeOperation = 'lighter';
  for (const [x, z] of slots) { const [px, pz] = P(x, z); gr = g.createRadialGradient(px, pz, 0, px, pz, 12 * k); gr.addColorStop(0, 'rgba(255,150,60,0.42)'); gr.addColorStop(0.45, 'rgba(255,110,40,0.14)'); gr.addColorStop(1, 'rgba(255,90,30,0)'); g.fillStyle = gr; g.fillRect(px - 12 * k, pz - 12 * k, 24 * k, 24 * k); }
  { const [px, pz] = P(HALL.x, HALL.z); gr = g.createRadialGradient(px, pz, 0, px, pz, 40 * k); gr.addColorStop(0, 'rgba(255,170,80,0.55)'); gr.addColorStop(0.5, 'rgba(255,120,40,0.16)'); gr.addColorStop(1, 'rgba(255,90,30,0)'); g.fillStyle = gr; g.fillRect(px - 40 * k, pz - 40 * k, 80 * k, 80 * k); }
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(230,180,100,0.35)'; g.lineWidth = Math.max(1.5, N / 900); g.beginPath(); g.arc(N / 2, N / 2, 40 * k, 0, Math.PI * 2); g.stroke();
  return tex(c);
}
function wallTex() {
  const [c, g] = canvas(512, 256); let gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#05060c'); gr.addColorStop(0.7, '#0e0b10'); gr.addColorStop(1, '#1a120e'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 70, 256); g.fillStyle = 'rgba(214,160,90,0.18)'; g.fillRect(68, 0, 3, 256);
  gr = g.createRadialGradient(290, 150, 0, 290, 150, 90); gr.addColorStop(0, 'rgba(255,170,90,0.5)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(180, 40, 220, 220);
  g.fillStyle = '#ffd9a0'; g.fillRect(286, 140, 8, 22);
  return tex(c, { repeat: 20 });
}
function skyTex() {
  const W = MOB ? 2048 : 4096, H = W / 2, [c, g] = canvas(W, H); let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#02030a'); gr.addColorStop(0.6, '#060a1e'); gr.addColorStop(0.92, '#121634'); gr.addColorStop(1, '#2a1a20'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  /* the milky way: a soft band of haze and dust-fine stars */
  const band = (u) => H * (0.42 + 0.22 * Math.sin(u * Math.PI * 2 + 1.1));
  for (let i = 0; i < 900; i++) { const u = Math.random(), y = band(u) + (Math.random() - 0.5) * H * 0.12, x = u * W, r = 20 + Math.random() * 70; gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(170,180,255,0.035)'); gr.addColorStop(1, 'rgba(170,180,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 16000; i++) { const u = Math.random(); const y = band(u) + ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * H * 0.22; g.fillStyle = `rgba(220,225,255,${0.15 + Math.random() * 0.35})`; g.fillRect(u * W, y, 1, 1); }
  /* stars, uniform on the hemisphere (row = polar angle) */
  const tints = ['255,255,255', '255,236,210', '210,225,255', '255,214,170'];
  for (let i = 0; i < (MOB ? 2600 : 4200); i++) {
    const th = Math.acos(1 - Math.random() * 0.98), y = th / (Math.PI / 2) * H, x = Math.random() * W; const b = Math.pow(Math.random(), 3); const s = 0.7 + b * 2.2;
    g.fillStyle = `rgba(${tints[i % 4]},${0.35 + b * 0.65})`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    if (b > 0.75) { gr = g.createRadialGradient(x, y, 0, x, y, s * 6); gr.addColorStop(0, `rgba(${tints[i % 4]},0.35)`); gr.addColorStop(1, `rgba(${tints[i % 4]},0)`); g.fillStyle = gr; g.fillRect(x - s * 6, y - s * 6, s * 12, s * 12); }
  }
  gr = g.createLinearGradient(0, H * 0.85, 0, H); gr.addColorStop(0, 'rgba(255,120,50,0)'); gr.addColorStop(1, 'rgba(255,120,50,0.16)'); g.fillStyle = gr; g.fillRect(0, H * 0.85, W, H * 0.15);
  return tex(c);
}
function barkTex() {
  const [c, g] = canvas(256, 64); g.fillStyle = '#3a2416'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(20,10,4,0.5)' : 'rgba(120,80,48,0.35)'; g.fillRect(Math.random() * 256, Math.random() * 64, 6 + Math.random() * 30, 1 + Math.random() * 2); }
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,150,70,0.28)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
  return tex(c);
}
const glowTex = (() => { let t = null; return () => { if (t) return t; const [c, g] = canvas(128, 128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.35, 'rgba(255,130,50,0.45)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return (t = tex(c)); }; })();

/* ---------- a campfire (the Lakeside Wilds recipe: stone ring, crossed logs, three flame cones, rising embers) ---------- */
function makeFire(app, s = 1, o = {}) {
  const g = new T.Group(); g.userData.noFreeze = true; const bark = o.bark;
  const rockG = new T.DodecahedronGeometry(0.5, 0); const rockM = [new T.MeshBasicMaterial({ color: 0x3b332f }), new T.MeshBasicMaterial({ color: 0x5a4436 })];
  const nR = Math.round(10 * Math.max(1, s * 0.8));
  for (let i = 0; i < nR; i++) { const a = i / nR * 6.283; const st = new T.Mesh(rockG, rockM[i % 2]); st.scale.set(0.34 * s, 0.26 * s, 0.34 * s); st.position.set(Math.cos(a) * 1.25 * s, 0.13 * s, Math.sin(a) * 1.25 * s); st.rotation.y = a * 3; g.add(st); }
  for (let i = 0; i < 3; i++) { const lg = new T.Mesh(new T.CylinderGeometry(0.13 * s, 0.15 * s, 1.9 * s, 7), bark); lg.rotation.z = Math.PI / 2 - 0.35; lg.rotation.y = i * 2.09; lg.position.y = 0.4 * s; g.add(lg); }
  const flames = [[0xff5a1f, 0.62, 1.7], [0xffa11f, 0.44, 1.35], [0xfff0a8, 0.24, 0.95]].map(([c, w, h]) => { const f = new T.Mesh(new T.ConeGeometry(w * s, h * s, 9), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.88, depthWrite: false })); f.position.y = (0.45 + h / 2) * s; f.userData.h = h; g.add(f); return f; });
  const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xffa860, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 })); halo.scale.setScalar(5 * s); halo.position.y = 1.3 * s; g.add(halo);
  const pool = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; pool.scale.setScalar(16 * s); g.add(pool);
  const EN = Math.round((MOB ? 26 : 40) * Math.max(1, s * 0.7)), ep = new Float32Array(EN * 3), es = []; for (let i = 0; i < EN; i++) es.push(Math.random());
  const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(ep, 3));
  const embers = new T.Points(eg, new T.PointsMaterial({ color: 0xffb347, size: 0.12 * Math.max(1, s * 0.6), transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending })); embers.frustumCulled = false; g.add(embers);
  const tick = (dt, t) => {
    flames.forEach((f, i) => { const k = 0.85 + Math.sin(t * (5 + i * 2.3) + i) * 0.16 + Math.sin(t * 11.7 + i * 3) * 0.07; f.scale.set(1 + Math.sin(t * 7 + i) * 0.08, k, 1 + Math.cos(t * 6 + i) * 0.08); f.position.y = (0.45 + f.userData.h * k / 2) * s; });
    for (let i = 0; i < EN; i++) { es[i] = (es[i] + dt * (0.25 + (i % 5) * 0.06)) % 1; const k = es[i]; ep[i * 3] = Math.sin(i * 2.4 + k * 5) * (0.2 + k * 0.9) * s; ep[i * 3 + 1] = (0.8 + k * 5.5) * s; ep[i * 3 + 2] = Math.cos(i * 1.7 + k * 4) * (0.2 + k * 0.9) * s; }
    eg.attributes.position.needsUpdate = true; const fl = 0.5 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 23.7) * 0.04; halo.material.opacity = fl; pool.material.opacity = fl * 0.95;
  };
  return { g, tick };
}

/* ---------- crackle: the file if the content session dropped one in, else a generated loop ---------- */
function crackleBuffer(ctx) {
  const sr = 22050, n = sr * 4, b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); let br = 0;
  for (let i = 0; i < n; i++) { br = (br + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = br * 0.9; }
  const pop = (at, len, amp) => { let prev = 0; for (let j = 0; j < len && at + j < n; j++) { const w = (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.22)); d[at + j] += w - prev * 0.6; prev = w; } };
  for (let t = 0; t < 4; t += -Math.log(1 - Math.random()) / 16) pop(Math.floor(t * sr), Math.floor(sr * (0.002 + Math.random() * 0.01)), 0.08 + Math.random() * 0.35);
  for (let t = 0; t < 4; t += 0.5 + Math.random() * 1.5) pop(Math.floor(t * sr), Math.floor(sr * 0.02), 0.7);
  const X = Math.floor(sr * 0.15); for (let j = 0; j < X; j++) { const k = j / X; d[j] = d[j] * k + d[n - X + j] * (1 - k); }
  return b;
}

export function installGather(app) {
  if (app._worldFire) return app._worldFire; const a = app; const SC = a.scene;
  const SLOTS = buildSlots(); const PUB = SLOTS.slice(0, SLOTS.length - PRIV_N), PRIV = SLOTS.slice(SLOTS.length - PRIV_N);
  const st = { lobbyKey: 'x' + rnd(12), built: false, inHall: false, me: null, lobby: null, lobbyList: [], circle: null, active: -1, sitting: false, solo: false, drag: null, grid: false, kicked: {}, invited: new Set() };
  const API = { st, SLOTS, join: (k) => joinKey(k), leave: () => leaveCircle(), lobby: () => openLobby() };
  a._worldFire = API; window.WVM_FIRE = API;

  /* ===== the way in: a portal in the Grand Lobby, the places list / map, the VR Go menu, ?fire= links ===== */
  const [px, pz] = a._snap ? a._snap(-34, 62) : [-34, 62];
  a.addPortal(px, pz, new T.Vector3(ENTRY.x, 0, ENTRY.z), { label: 'The World Fire 🔥', color: 0xff8a3d, yaw: -Math.PI / 2 });
  const PLACE = { id: 'worldfire', name: 'The World Fire · meet people from everywhere', icon: '🔥', x: ENTRY.x, z: ENTRY.z, yaw: -Math.PI / 2, keys: 'world fire campfire bonfire gather gathering meet people friends social video call voice chat talk circle hangout zoom group night stars', cat: 'Inside the mall', top: true, walk: false, tile: [HALL.R * 2, HALL.R * 2, 'rgba(255,138,61,0.35)'], say: 'The World Fire. Pick a circle, take a seat, say hi. 🔥', desc: 'A hall of fire circles under the stars. Twelve people to a circle, live video and voice for 18+ allofus.one members.' };
  a.addPlace(PLACE);
  /* WVM_NAV (ux-1): a row in the nav's More sheet; the queue is drained when the rail module loads. VR keeps the engine's Go-menu row (vr: false here, so it is not listed twice). */
  const NAV_ITEM = { id: 'worldfire', label: 'The World Fire', icon: '🔥', sub: 'Meet people around a fire · 18+ live video + voice', where: 'more', order: 40, vr: false, onClick: (e) => { try { e && e.preventDefault && e.preventDefault(); } catch (er) { } a.travel('worldfire', 'port'); return false; } };
  try { if (window.WVM_NAV && window.WVM_NAV.register) window.WVM_NAV.register(NAV_ITEM); else (window.WVM_NAV_Q = window.WVM_NAV_Q || []).push(NAV_ITEM); } catch (e) { console.warn('fire nav', e); }
  (a.goMenuExtra = a.goMenuExtra || []).push(['🔥 The World Fire', () => a.travel('worldfire', 'port')]);
  a.addZone('worldfire', new T.Vector3(HALL.x, 0, HALL.z), HALL.R + 70, () => buildHall());
  try { const q = new URLSearchParams(location.search).get('fire'); if (q) { const go = () => { if (!a.loader || a.loader.classList.contains('off')) { a.travel('worldfire', 'port'); setTimeout(() => (/^[a-z0-9]{8}$/.test(q) ? joinKey('p' + q) : openLobby()), 1400); } else setTimeout(go, 500); }; setTimeout(go, 1500); } } catch (e) { }

  /* ===== the hall ===== */
  const bark = new T.MeshBasicMaterial({ map: barkTex(), color: 0xd8b89a });
  let fireDetail = null, logs = [], heroFire = null, distant = null;
  function buildHall() {
    if (st.built) return; st.built = true;
    const hall = new T.Group(); hall.position.set(HALL.x, 0, HALL.z); hall.userData.noCull = true; SC.add(hall);
    const floor = new T.Mesh(new T.CircleGeometry(HALL.R, 96), new T.MeshBasicMaterial({ map: floorTex(SLOTS), fog: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; hall.add(floor);
    const wall = new T.Mesh(new T.CylinderGeometry(HALL.R, HALL.R, WALL_H, 96, 1, true), new T.MeshBasicMaterial({ map: wallTex(), side: T.BackSide, fog: false })); wall.position.y = WALL_H / 2; hall.add(wall);
    const trim = new T.Mesh(new T.TorusGeometry(HALL.R - 0.3, 0.35, 6, 128), new T.MeshBasicMaterial({ color: 0xc8955a, fog: false })); trim.rotation.x = Math.PI / 2; trim.position.y = WALL_H; hall.add(trim);
    const dome = new T.Mesh(new T.SphereGeometry(HALL.R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ map: skyTex(), side: T.BackSide, fog: false })); dome.scale.y = 0.62; dome.position.y = WALL_H; hall.add(dome);
    /* walls you cannot walk through: 128 overlapping boxes just outside the ring (axis-aligned, so they stay 5 m clear of the outer circles) */
    for (let i = 0; i < 128; i++) { const an = i / 128 * Math.PI * 2; a.addBox(HALL.x + Math.cos(an) * (HALL.R + 3), HALL.z + Math.sin(an) * (HALL.R + 3), 6, 6); }
    /* a shooting star now and then */
    const [sc, sg] = canvas(256, 8); const sgr = sg.createLinearGradient(0, 0, 256, 0); sgr.addColorStop(0, 'rgba(255,255,255,0)'); sgr.addColorStop(1, 'rgba(255,255,255,0.95)'); sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 8);
    const shoot = new T.Mesh(new T.PlaneGeometry(22, 0.35), new T.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide })); shoot.visible = false; shoot.userData.noFreeze = true; hall.add(shoot); let shootT = 8, shootK = -1; const sv = new T.Vector3();
    /* the grand fire in the plaza: decorative, everyone's */
    heroFire = makeFire(a, 2.6, { bark }); hall.add(heroFire.g); a.addObstacle(HALL.x, HALL.z, 4);
    const ring = new T.Mesh(new T.TorusGeometry(40, 0.18, 6, 160), new T.MeshBasicMaterial({ color: 0xffa05a, transparent: true, opacity: 0.5, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; hall.add(ring);
    /* every other circle, in four instanced draw calls: stone rings, the default twelve logs, the flame cores, their glow */
    const n = SLOTS.length, m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sv3 = new T.Vector3(1, 1, 1);
    const stones = new T.InstancedMesh(new T.TorusGeometry(1.25, 0.24, 5, 14), new T.MeshBasicMaterial({ color: 0x3e3430 }), n);
    const seatsI = new T.InstancedMesh(new T.CylinderGeometry(0.34, 0.34, 1.5, 8), bark, n * CAP);
    const cones = new T.InstancedMesh(new T.ConeGeometry(0.5, 1.5, 8), new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false }), n);
    const halos = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.6 }), n);
    const qFlat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2); const DS = defaultSeats();
    const seatMatrix = (i, j, hide) => { const [sx, sz] = DS[j]; const yaw = Math.atan2(-sx, -sz); q.setFromEuler(new T.Euler(0, yaw, Math.PI / 2, 'YXZ')); v.set(SLOTS[i][0] - HALL.x + sx, 0.36, SLOTS[i][1] - HALL.z + sz); m4.compose(v, q, hide ? new T.Vector3(0, 0, 0) : sv3); seatsI.setMatrixAt(i * CAP + j, m4); };
    for (let i = 0; i < n; i++) {
      const lx = SLOTS[i][0] - HALL.x, lz = SLOTS[i][1] - HALL.z;
      m4.compose(v.set(lx, 0.12, lz), qFlat, sv3); stones.setMatrixAt(i, m4);
      m4.compose(v.set(lx, 0.95, lz), new T.Quaternion(), sv3); cones.setMatrixAt(i, m4);
      m4.compose(v.set(lx, 1.3, lz), new T.Quaternion(), new T.Vector3(4.4, 4.4, 4.4)); halos.setMatrixAt(i, m4);
      for (let j = 0; j < CAP; j++) seatMatrix(i, j, false);
      a.addObstacle(SLOTS[i][0], SLOTS[i][1], 1.5);
    }
    [stones, seatsI, cones, halos].forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere && im.computeBoundingSphere(); hall.add(im); });
    distant = { stones, seatsI, cones, halos, seatMatrix, hide(i, on) { if (i < 0) return; for (let j = 0; j < CAP; j++) seatMatrix(i, j, on); m4.compose(v.set(SLOTS[i][0] - HALL.x, on ? -50 : 0.95, SLOTS[i][1] - HALL.z), new T.Quaternion(), sv3); cones.setMatrixAt(i, m4); m4.compose(v.set(SLOTS[i][0] - HALL.x, on ? -50 : 0.12, SLOTS[i][1] - HALL.z), qFlat, sv3); stones.setMatrixAt(i, m4); m4.compose(v.set(SLOTS[i][0] - HALL.x, on ? -50 : 1.3, SLOTS[i][1] - HALL.z), new T.Quaternion(), new T.Vector3(4.4, 4.4, 4.4)); halos.setMatrixAt(i, m4); seatsI.instanceMatrix.needsUpdate = cones.instanceMatrix.needsUpdate = stones.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true; } };
    /* the detailed circle: follows you to the nearest fire (or stays with your circle) */
    fireDetail = makeFire(a, 1, { bark }); fireDetail.g.visible = false; SC.add(fireDetail.g);
    const logG = new T.CylinderGeometry(0.36, 0.36, 1.55, 10);
    for (let j = 0; j < CAP; j++) { const L = new T.Mesh(logG, bark); L.rotation.order = 'YXZ'; L.userData.noFreeze = true; L.userData.seat = j; fireDetail.g.add(L); logs.push(L); screenOn(a, L, { down: (u, v2, info) => dragStart(j, info) }); }
    /* the welcome: a sign over the entrance, a lobby stone, a way back */
    const sign = new T.Sprite(new T.SpriteMaterial({ map: makeTextTexture(['THE WORLD FIRE', 'people from everywhere · twelve to a circle'], { w: 1600, h: 400, bg: 'rgba(10,6,4,0.82)', fg: '#ffe2b8', accent: '#ff9a4a', font: 'bold 120px Georgia, serif', radius: 30, border: '#c8955a', glow: true }), transparent: true, fog: false, depthWrite: false }));
    sign.scale.set(16, 4, 1); sign.position.set(HALL.x, 15, HALL.z); SC.add(sign);
    const kiosk = new T.Group(); kiosk.position.set(ENTRY.x + 1, 0, ENTRY.z + 5); SC.add(kiosk);
    const ped = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, 1.1, 16), new T.MeshBasicMaterial({ color: 0x2a1f1a })); ped.position.y = 0.55; kiosk.add(ped);
    const top = new T.Mesh(new T.CircleGeometry(0.62, 24), new T.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.85 })); top.rotation.x = -Math.PI / 2; top.position.y = 1.12; kiosk.add(top);
    const ks = makeSprite('🔥 find a circle · tap', { scale: 3.4, bg: 'rgba(20,10,6,0.9)', accent: '#ff9a4a' }); ks.position.y = 2.4; kiosk.add(ks);
    a.addHotspot(kiosk, { fn: () => openLobby() }); a.addInteractable(kiosk.position.x, kiosk.position.z, 4, '🔥 The World Fire · find a circle', () => openLobby());
    a.addPortal(ENTRY.x - 4, ENTRY.z - 9, new T.Vector3(px, 0, pz + 3), { label: 'Back to the Grand Lobby', color: 0x38f0ff, yaw: Math.PI });
    a.onUpdate((dt, t) => {
      const P = a.player.position; const inside = (P.x - HALL.x) ** 2 + (P.z - HALL.z) ** 2 < (HALL.R + 20) ** 2;
      if (inside !== st.inHall) { st.inHall = inside; inside ? enterHall() : exitHall(); }
      if (!inside) return;
      heroFire.tick(dt, t); if (fireDetail.g.visible) fireDetail.tick(dt, t);
      const fl = 0.8 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 17.1) * 0.06; cones.material.opacity = 0.7 + (fl - 0.8) * 1.5; halos.material.opacity = 0.45 + (fl - 0.8);
      shootT -= dt; if (shootT < 0 && shootK < 0) { shootK = 0; shoot.visible = true; shoot.position.set((Math.random() - 0.5) * 160, 95 + Math.random() * 30, (Math.random() - 0.5) * 160); shoot.rotation.set(0, Math.random() * 6.28, -0.25); sv.set(Math.cos(shoot.rotation.y), -0.25, -Math.sin(shoot.rotation.y)).multiplyScalar(70); }
      if (shootK >= 0) { shootK += dt / 0.9; shoot.position.addScaledVector(sv, dt / 0.9); shoot.material.opacity = Math.sin(Math.min(1, shootK) * Math.PI); if (shootK >= 1) { shootK = -1; shoot.visible = false; shootT = 14 + Math.random() * 22; } }
      frame(dt, t);
    });
    try { a.freezeStatic && setTimeout(() => a.freezeStatic(), 800); } catch (e) { }
  }

  /* ===== the active circle: one detailed fire + twelve draggable logs ===== */
  const slotOfKey = (key) => { if (!key) return -1; if (key[0] === 'p') { const i = parseInt(key.slice(-2), 36); return SLOTS.indexOf(PRIV[i % PRIV_N]); } const nn = parseInt(key, 10); return nn > 0 ? (nn - 1) % PUB.length : -1; };
  const keyOfSlot = (i) => { const k = PUB.indexOf(SLOTS[i]); return k >= 0 ? String(k + 1) : null; };
  let seatsNow = defaultSeats();
  function setActive(i) {
    if (i === st.active || !fireDetail) return; if (distant) { distant.hide(st.active, false); distant.hide(i, true); }
    st.active = i; if (i < 0) { fireDetail.g.visible = false; return; }
    fireDetail.g.position.set(SLOTS[i][0], 0, SLOTS[i][1]); fireDetail.g.visible = true;
    seatsNow = st.circle && st.circle.slot === i ? st.circle.seats : defaultSeats(); placeLogs();
  }
  function placeLogs() { for (let j = 0; j < CAP; j++) { const [x, z] = seatsNow[j]; const L = logs[j]; L.position.set(x, 0.38, z); L.rotation.set(0, Math.atan2(-x, -z), Math.PI / 2); } }
  const seatWorld = (j, out = new T.Vector3()) => { const i = st.active; const [x, z] = seatsNow[j]; return out.set(SLOTS[i][0] + x, 0, SLOTS[i][1] + z); };
  const nearestSlot = (P) => { let b = -1, bd = 1e9; for (let i = 0; i < SLOTS.length; i++) { const d = (SLOTS[i][0] - P.x) ** 2 + (SLOTS[i][1] - P.z) ** 2; if (d < bd) { bd = d; b = i; } } return [b, Math.sqrt(bd)]; };

  /* ===== who may go live ===== */
  async function eligibility() {
    if (devLocal) return { ok: true };
    const sh = S(); if (!sh) return { ok: false, why: 'Live circles open as soon as the mall\'s safety layer is online. The fire is warm either way.' };
    try { if (sh.ready) await Promise.race([sh.ready, new Promise((r) => setTimeout(r, 4000))]); } catch (e) { }
    const s = sh.status ? sh.status() : {};
    if (!s.signedIn) return { ok: false, why: 'Live circles are for 18+ verified allofus.one members. Sign in with your allofus.one account to join one.', act: { label: '🔑 Sign in', fn: () => window.WVM_PLUS && window.WVM_PLUS.signIn && window.WVM_PLUS.signIn() } };
    if (s.banned || s.held) return { ok: false, why: 'Live features are paused on this account.' };
    if (s.band !== 'adult') return { ok: false, why: s.dobSet === false || !s.dobSet ? 'Live circles are 18+ only. Add your date of birth once to check.' : 'Live circles at The World Fire are for adults (18+) only.', act: !s.dobSet && sh.askDob ? { label: '🎂 Add my date of birth', fn: () => sh.askDob() } : null };
    return { ok: true };
  }
  async function roomOK(key) {
    if (devLocal) return { ok: true }; const sh = S(); if (!sh || !sh.canJoinRoom) return { ok: true };
    try { const r = await sh.canJoinRoom('fire:' + key, { kind: 'fire', cap: CAP }); if (r === true || (r && r.ok)) return { ok: true }; return { ok: false, why: (r && r.why) || 'This circle is not open to you right now.' }; } catch (e) { return { ok: false, why: 'Could not check this circle. Try again in a moment.' }; }
  }
  const whoAmI = () => { if (devLocal) return devMe(); const s = S() && S().status ? S().status() : {}; const me = window.WVM_PLUS && window.WVM_PLUS.me ? window.WVM_PLUS.me() : null; let name = (me && me.name) || 'Someone'; try { if (S() && S().safeName) name = S().safeName(name, s.uid); } catch (e) { } return s.uid ? { id: String(s.uid), name } : null; };
  const canSee = (id) => { if (devLocal) return true; const sh = S(); try { if (sh && sh.canSee && !sh.canSee(id)) return false; if (sh && sh.isMuted && sh.isMuted(id)) return false; } catch (e) { } return true; };
  const cleanName = (n, id) => { let s = String(n || 'Someone').slice(0, 40); try { if (S() && S().safeName) s = S().safeName(s, id); else if (S() && S().filterText) s = S().filterText(s).text; } catch (e) { } return s; };

  /* ===== the lobby: who is at which circle ===== */
  async function enterHall() {
    startCrackle(); const e = await eligibility(); st.eligible = e; if (!e.ok || !st.inHall) return;
    st.me = whoAmI(); if (!st.me || st.lobby) return;
    const L = open('main', 'fire-lobby', st.lobbyKey); st.lobby = L; L.onSync((list) => { st.lobbyList = list; });
    L.track(lobbyMeta()); await L.ready;
  }
  function exitHall() { if (st.circle) leaveCircle(true); standUp(); if (st.lobby) { st.lobby.leave(); st.lobby = null; st.lobbyList = []; } stopCrackle(); setActive(-1); }
  const lobbyMeta = () => { const c = st.circle; return { s: c ? c.slot : -1, i: c && !c.priv ? c.key : '', l: c && c.locked ? 1 : 0, }; }; /* no name, no account id: the lobby is band-wide, so it only carries counts */
  const counts = () => { const m = new Map(), locked = new Set(); for (const x of st.lobbyList) { if (!x.i || x.id === st.lobbyKey) continue; m.set(x.i, (m.get(x.i) || 0) + 1); if (x.l) locked.add(x.i); } return { m, locked }; };
  function pickPublic(skip = new Set()) {
    const { m, locked } = counts(); const now = Date.now();
    for (let nn = 1; nn < 100000; nn++) { const k = String(nn); if (skip.has(k) || locked.has(k) || (st.kicked[k] && now - st.kicked[k] < 600000)) continue; if ((m.get(k) || 0) < CAP) return k; }
    return '1';
  }
  function freePrivateIndex() { const used = new Set(st.lobbyList.map((x) => x.s)); for (let i = 0; i < PRIV_N; i++) if (!used.has(SLOTS.indexOf(PRIV[i]))) return i; return Math.floor(Math.random() * PRIV_N); }

  /* WVM_SOCIAL (social-1): presence() = the people you may see who are in the mall now; inside the hall's ring = at the fire.
     Their circle comes from the lobby channel (public circles only; a private circle stays private). */
  const inHallXZ = (x, z) => (x - HALL.x) ** 2 + (z - HALL.z) ** 2 < HALL.R * HALL.R;
  function friendsHere() {
    const so = SOC(); if (!so || !so.presence || (so.live && !so.live())) return null; let ppl = [];
    try { ppl = so.presence() || []; } catch (e) { ppl = []; }
    return ppl.filter((p) => p.page === 'mall' && inHallXZ(+p.x, +p.z) && canSee(String(p.id))).map((p) => { const [si, sd] = nearestSlot({ x: +p.x, z: +p.z }); const k = sd < 9 ? keyOfSlot(si) : ''; return { id: String(p.id), name: cleanName(p.name || p.username, p.id), key: k || '', priv: sd < 9 && !k }; });
  }
  const isFriend = (id) => { const so = SOC(); if (!so || !so.myPeople) return null; try { return so.myPeople().some((f) => String(f.id) === String(id)); } catch (e) { return null; } };

  async function openLobby() {
    const e = st.eligible || await eligibility(); st.eligible = e;
    if (!e.ok) {
      const acts = []; if (e.act) acts.push(Object.assign({ primary: true }, e.act)); acts.push({ label: '🔥 Just sit by the fire', fn: () => soloSit() });
      a.popup('🔥 The World Fire', `<p>${esc(e.why)}</p><p class="muted">Anyone can walk the hall and sit by any fire. Joining a circle, live video and voice are for 18+ verified allofus.one members.</p>`, acts); return;
    }
    if (!st.lobby && st.inHall) { enterHall(); await new Promise((r) => setTimeout(r, 700)); }
    const { m } = counts(); let people = 0; for (const v of m.values()) people += v; const fr = friendsHere();
    const acts = [];
    if (st.circle) acts.push({ label: '🚪 Leave my circle', fn: () => leaveCircle() });
    acts.push({ label: '🔥 Join a public circle', primary: !st.circle, fn: () => joinKey(pickPublic()) });
    acts.push({ label: '🔒 Start a private circle (just my group)', fn: () => startPrivate() });
    if (!(a.renderer.xr && a.renderer.xr.isPresenting)) acts.push({ label: '🔑 Join with a code', fn: () => { const c = (prompt('Circle code (8 letters and numbers):') || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); if (/^[a-z0-9]{8}$/.test(c)) joinKey('p' + c); else if (c) a.toast('That code does not look right. It has 8 letters and numbers.'); } });
    for (const f of (fr || []).slice(0, 4)) if (!f.priv) acts.push({ label: '👋 Join ' + f.name, fn: () => (f.key ? joinKey(f.key) : SOC().joinUser(f.id)) });
    const frHtml = fr === null ? '' : fr.length ? '<p><b>Friends here now:</b> ' + fr.map((f) => esc(f.name) + (f.priv ? ' (private circle)' : f.key ? ' · circle ' + esc(f.key) : ' · walking the hall')).join(', ') + '</p>' : '<p class="muted">Friends here now: none of your people are at the fire yet.</p>';
    a.popup('🔥 The World Fire', `<p>${people ? people + ' people at ' + m.size + ' circle' + (m.size === 1 ? '' : 's') + ' right now.' : 'The fires are lit. Be the first to sit down.'} Twelve to a circle: when one fills, the next one opens.</p>${frHtml}<p class="muted">Camera and mic stay off until you turn them on. 18+ members only.</p>`, acts);
  }

  /* ===== joining and leaving a circle ===== */
  async function startPrivate() { const code = rnd(6) + freePrivateIndex().toString(36).padStart(2, '0'); st.invited = new Set(); await joinKey('p' + code, { owner: true }); }
  async function joinKey(key, o = {}) {
    const e = await eligibility(); st.eligible = e; if (!e.ok) { openLobby(); return; }
    const ok = await roomOK(key); if (!ok.ok) { a.toast('🔥 ' + ok.why, 4200); return; }
    if (st.circle && st.circle.key === key) return; if (st.circle) await leaveCircle(true);
    st.me = whoAmI(); if (!st.me) return; const slot = slotOfKey(key); if (slot < 0) return;
    if (!st.inHall || nearestSlot(a.player.position)[0] !== slot) await walkIn(slot);
    if (!st.lobby && st.inHall) enterHall();
    const priv = key[0] === 'p', page = 'fire-' + key; const net = open('main', page, st.me.id);
    const C = st.circle = { key, page, slot, priv, code: priv ? key.slice(1) : '', owner: !!o.owner, net, members: [], hostId: null, seats: defaultSeats(), mySeat: -1, at: Date.now(), locked: 0, cam: 0, mic: 0, synced: false, skip: o.skip || new Set(), friendsOnly: !!(o.owner && SOC() && SOC().myPeople) };
    C.mesh = createMesh({ net, myId: st.me.id, canPeer: (id) => canSee(id), onChange: () => { syncMedia(); drawBar(); } });
    net.on('state?', (m) => { if (C.hostId === st.me.id) net.send('state', { to: m.from, seats: C.seats, lk: C.locked }); });
    net.on('state', (m) => { if (m.from !== C.hostId || !Array.isArray(m.seats)) return; C.seats = m.seats.slice(0, CAP).map((p) => clampSeat(+p[0], +p[1])); if (st.active === slot) { seatsNow = C.seats; placeLogs(); } });
    net.on('seat', (m) => { const j = m.i | 0; if (j < 0 || j >= CAP || !isFinite(m.x) || !isFinite(m.z)) return; C.seats[j] = clampSeat(m.x, m.z); if (st.active === slot) { seatsNow = C.seats; placeLogs(); } if (j === C.mySeat && st.sitting) sitAt(j, true); });
    net.on('kick', (m) => { if (m.id === st.me.id && m.from === C.hostId) { st.kicked[key] = Date.now(); leaveCircle(); a.popup('🔥 You left the circle', '<p>The host of that circle asked you to leave. Another circle is a tap away.</p>', [{ label: '🔥 Find another circle', primary: true, fn: () => openLobby() }]); } });
    net.on('muteall', (m) => { if (m.from === C.hostId && m.from !== st.me.id) { C.mesh.micOff(); C.mic = 0; trackMe(); a.toast('🔇 The host muted everyone. Turn your mic back on when you want to talk.', 4000); } });
    net.onSync((list) => onMembers(C, list));
    trackMe(); setActive(slot); seatsNow = C.seats; placeLogs();
    const okNet = await net.ready; if (st.circle !== C) return;
    if (!okNet) { a.toast('🔥 Could not reach the circle. Check your connection and try again.', 4200); leaveCircle(true); return; }
    net.send('state?', {}); if (st.lobby) st.lobby.track(lobbyMeta());
    a.toast(priv ? (C.owner ? '🔒 Your private circle is ready. Invite your people from the bar below.' : '🔒 You joined a private circle.') : '🔥 Circle ' + key + '. Camera and mic are off. Say hi when you are ready.', 4200);
    showBar(); drawBar();
  }
  const trackMe = () => { const C = st.circle; if (!C) return; C.net.track({ n: st.me.name, s: C.mySeat, at: C.at, cam: C.cam, mic: C.mic, lk: C.hostId === st.me.id ? C.locked : 0, o: C.owner ? 1 : 0 }); };
  function onMembers(C, list) {
    if (st.circle !== C) return;
    const L = list.filter((m) => m && m.id && (m.id === st.me.id || canSee(m.id))).sort((x, y) => (x.at || 0) - (y.at || 0) || (x.id < y.id ? -1 : 1));
    const owner = L.find((m) => m.o); C.hostId = (owner || L[0] || {}).id || st.me.id;
    const rank = L.findIndex((m) => m.id === st.me.id);
    /* more than twelve (two people raced for the last seat): the later one moves on */
    if (rank >= CAP) { if (C.priv) { leaveCircle(); a.toast('🔒 That private circle is full (12).', 4000); } else { const skip = new Set(C.skip); skip.add(C.key); leaveCircle(true).then(() => joinKey(pickPublic(skip), { skip })); a.toast('🔥 That circle just filled. Taking you to the next one.', 3200); } return; }
    const host = L.find((m) => m.id === C.hostId);
    if (host && host.id !== st.me.id && host.lk && C.at > host.lk && !C.synced) { if (C.priv) { leaveCircle(); a.toast('🔒 The host closed this circle to new people.', 4000); } else { const skip = new Set(C.skip); skip.add(C.key); leaveCircle(true).then(() => joinKey(pickPublic(skip), { skip })); } return; }
    if (host && host.id !== st.me.id) C.locked = host.lk || 0;
    C.synced = true;
    /* private + WVM_SOCIAL: the host lets in invited people and friends only */
    if (C.priv && C.hostId === st.me.id && C.friendsOnly) for (const m of L) { if (m.id === st.me.id || st.invited.has(m.id)) continue; if (isFriend(m.id) === false) C.net.send('kick', { id: m.id }); }
    C.members = L.slice(0, CAP);
    /* my seat: the first one nobody earlier in the circle holds */
    const taken = new Map(); for (const m of C.members) if (m.id !== st.me.id && m.s >= 0 && !taken.has(m.s)) taken.set(m.s, m.id);
    if (C.mySeat < 0 || (taken.has(C.mySeat) && C.members.find((m) => m.id === taken.get(C.mySeat)).at <= C.at)) { let j = 0; while (taken.has(j) && j < CAP) j++; C.mySeat = j < CAP ? j : -1; trackMe(); if (C.mySeat >= 0 && !st.drag) sitAt(C.mySeat); }
    C.mesh.setMembers(C.members.map((m) => m.id)); syncPanels(); drawBar(); if (st.lobby) st.lobby.track(lobbyMeta());
  }
  async function leaveCircle(quiet) {
    const C = st.circle; if (!C) return; dragEnd(); st.circle = null; standUp(); clearPanels(); hideBar(); closeGrid(); if (st.selfV) st.selfV.srcObject = null;
    try { await C.mesh.close(); } catch (e) { } try { await C.net.leave(); } catch (e) { }
    if (st.lobby) st.lobby.track(lobbyMeta()); seatsNow = defaultSeats(); placeLogs(); if (!quiet) a.toast('👋 You left the circle.', 2200);
  }
  function walkIn(slot) {
    return new Promise((res) => {
      const [x, z] = SLOTS[slot]; const dx = ENTRY.x - x, dz = ENTRY.z - z, d = Math.hypot(dx, dz) || 1; const tx = x + dx / d * 8, tz = z + dz / d * 8;
      buildHall(); a.fade.classList.add('on'); a.fade.textContent = '🔥 To your circle';
      setTimeout(() => { a.player.position.set(tx, 0, tz); a.yaw = Math.atan2(-(x - tx), -(z - tz)); a.walkTarget = null; a._route = null; try { a._updateZones(); } catch (e) { } setTimeout(() => { a.fade.classList.remove('on'); res(); }, 260); }, 380);
    });
  }

  /* ===== sitting: on your log, facing the fire ===== */
  function sitAt(j, keep) {
    if (st.active < 0) return; const p = seatWorld(j); const i = st.active; const fx = SLOTS[i][0], fz = SLOTS[i][1]; const back = Math.hypot(p.x - fx, p.z - fz) || 1;
    p.x += (p.x - fx) / back * 0.12; p.z += (p.z - fz) / back * 0.12;
    a._route = null; a.walkTarget = null; a.locked = true; a.player.position.set(p.x, 0, p.z);
    a.avatar.rotation.y = Math.atan2(fx - p.x, fz - p.z); if (!keep) { a.yaw = Math.atan2(-(fx - p.x), -(fz - p.z)); a.pitch = -0.08; }
    try { sitPerson(a.avatar, true); } catch (e) { } a.avatar.position.y = 0.32; st.sitting = true; st.sitSeat = j; a._act = null;
  }
  function standUp() {
    if (!st.sitting) return; st.sitting = false; st.solo = false; a.locked = false; try { sitPerson(a.avatar, false); } catch (e) { } a.avatar.position.y = 0;
    if (st.active >= 0) { const i = st.active; const P = a.player.position; const dx = P.x - SLOTS[i][0], dz = P.z - SLOTS[i][1], d = Math.hypot(dx, dz) || 1; a.player.position.set(P.x + dx / d * 1.4, 0, P.z + dz / d * 1.4); } a._act = null;
  }
  function soloSit() { const P = a.player.position; const [i, d] = nearestSlot(P); if (d > 40) { a.toast('Walk up to any fire and tap Sit by the fire. 🔥'); return; } setActive(i); let bj = 0, bd = 1e9; for (let j = 0; j < CAP; j++) { const w = seatWorld(j); const dd = w.distanceToSquared(P); if (dd < bd) { bd = dd; bj = j; } } sitAt(bj); st.solo = true; a.toast(pickLine(), 5200); }
  const LINES = ['Crackle. Pop. Nobody is asking you for anything right now. 🔥', 'Every fire in this hall is someone\'s circle, somewhere in the world.', 'Look up. Those stars were mapped to look like a real night sky with no city in it. ✨', 'Fun fact: a campfire burns at about 600°C, hot enough to make the stones around it glow at night.'];
  const pickLine = () => LINES[Math.floor(Math.random() * LINES.length)];
  /* the one green button near a fire: its label follows what you can do there */
  const act = { x: 0, z: 0, r: 7, label: '🔥 Sit by the fire', fn: () => onAct() }; (a.interactables = a.interactables || []).push(act);
  function actLabel() {
    const C = st.circle; if (st.sitting) return '🧍 Stand up';
    if (C && st.active === C.slot) return '🪑 Take your seat';
    if (!st.eligible || !st.eligible.ok) return '🔥 Sit by the fire';
    const k = keyOfSlot(st.active); if (!k) return '🔒 A private circle · use an invite';
    const n = counts().m.get(k) || 0; return n >= CAP ? '🔥 Full (12) · find me the next circle' : '🔥 Join this circle' + (n ? ' (' + n + ' here)' : '');
  }
  function onAct() {
    const C = st.circle; if (st.sitting) { standUp(); return; }
    if (C && st.active === C.slot) { if (C.mySeat >= 0) sitAt(C.mySeat); return; }
    if (!st.eligible || !st.eligible.ok) { soloSit(); return; }
    const k = keyOfSlot(st.active); if (!k) { openLobby(); return; }
    const n = counts().m.get(k) || 0; joinKey(n >= CAP ? pickPublic() : k);
  }

  /* ===== dragging logs: mouse / finger on the page, the laser in VR ===== */
  const ptr = { x: 0, y: 0, down: false }; const rc = new T.Raycaster(); const plane = new T.Plane(new T.Vector3(0, 1, 0), -0.38); const hitV = new T.Vector3(); const ndc = new T.Vector2();
  addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
  addEventListener('pointerup', () => { if (st.drag && st.drag.hd === 'mouse') dragEnd(); });
  function clampSeat(x, z) { const d = Math.hypot(x, z) || 1; const r = Math.max(2.3, Math.min(7.5, d)); return [x / d * r, z / d * r]; }
  function dragStart(j, info) {
    const C = st.circle; if (!C || st.active !== C.slot) { a.toast(st.eligible && st.eligible.ok ? 'Join this circle first, then you can move the logs.' : 'Moving logs is for people in the circle.', 2600); return; }
    st.drag = { j, hd: info.hd, ctl: info.ctl, sent: 0 }; if (navigator.vibrate && info.hd === 'mouse') { try { navigator.vibrate(10); } catch (e) { } }
  }
  function dragEnd() { const D = st.drag; if (!D) return; st.drag = null; const C = st.circle; if (C) { C.net.send('seat', { i: D.j, x: C.seats[D.j][0], z: C.seats[D.j][1] }); if (D.j === C.mySeat && st.sitting) sitAt(D.j, true); } }
  function dragFrame(t) {
    const D = st.drag, C = st.circle; if (!D || !C || st.active !== C.slot) return;
    if (D.hd === 'mouse') { const r = a.renderer.domElement.getBoundingClientRect(); ndc.set(((ptr.x - r.left) / r.width) * 2 - 1, -((ptr.y - r.top) / r.height) * 2 + 1); rc.setFromCamera(ndc, a.camera); }
    else { const c = D.ctl; if (!c || !c.userData || !c.userData.selDown) { dragEnd(); return; } c.updateWorldMatrix(true, false); const o = new T.Vector3(), q = new T.Quaternion(); c.getWorldPosition(o); c.getWorldQuaternion(q); rc.ray.origin.copy(o); rc.ray.direction.set(0, 0, -1).applyQuaternion(q); }
    if (!rc.ray.intersectPlane(plane, hitV)) return; const i = C.slot; C.seats[D.j] = clampSeat(hitV.x - SLOTS[i][0], hitV.z - SLOTS[i][1]); seatsNow = C.seats; placeLogs();
    if (t - D.sent > 0.1) { D.sent = t; C.net.send('seat', { i: D.j, x: C.seats[D.j][0], z: C.seats[D.j][1] }); }
  }

  /* ===== video panels over the seats ===== */
  const panels = new Map(); const media = document.createElement('div'); media.id = 'wf-media'; media.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1'; document.body.appendChild(media);
  const PW = 0.96, PH = 0.72; const panelGeo = new T.PlaneGeometry(PW, PH), frameGeo = new T.PlaneGeometry(PW + 0.08, PH + 0.08);
  function nameCard(name, mic, cam, host) {
    const [c, g] = canvas(256, 192); const gr = g.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#2a1810'); gr.addColorStop(1, '#0c0807'); g.fillStyle = gr; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#ff9a4a'; g.beginPath(); g.arc(128, 78, 44, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a0e08'; g.font = 'bold 48px Poppins, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((name || '?').trim().charAt(0).toUpperCase() || '?', 128, 80);
    g.fillStyle = '#ffe2b8'; g.font = 'bold 22px Poppins, Arial'; g.fillText((host ? '👑 ' : '') + String(name).slice(0, 18), 128, 148); g.font = '18px Poppins, Arial'; g.fillStyle = '#c8955a'; g.fillText((mic ? '🎤 ' : '🔇 ') + (cam ? '📷' : 'camera off'), 128, 174);
    return tex(c);
  }
  function syncPanels() {
    const C = st.circle; if (!C || !fireDetail) return; const ids = new Set(C.members.filter((m) => m.s >= 0).map((m) => m.id));
    for (const [id, P] of panels) if (!ids.has(id)) { removePanel(id); }
    for (const m of C.members) { if (m.s < 0) continue; let P = panels.get(m.id); const nm = m.id === st.me.id ? st.me.name : cleanName(m.n, m.id); const sig = [nm, m.mic, m.cam, m.id === C.hostId].join('|');
      if (!P) { const g = new T.Group(); g.userData.noFreeze = true; const fr = new T.Mesh(frameGeo, new T.MeshBasicMaterial({ color: 0x3a2416, transparent: true, opacity: 0.92 })); fr.position.z = -0.01; g.add(fr); const pm = new T.Mesh(panelGeo, new T.MeshBasicMaterial({ toneMapped: false, side: T.DoubleSide })); g.add(pm); g.visible = false; fireDetail.g.add(g); P = { id: m.id, g, fr, pm, sig: '', card: null, vt: null, on: false, seat: m.s }; panels.set(m.id, P); if (m.id !== st.me.id) a.addHotspot(g, { fn: () => personCard(m.id) }); }
      P.seat = m.s; P.cam = !!m.cam; if (P.sig !== sig) { P.sig = sig; if (P.card) P.card.dispose(); P.card = nameCard(nm, m.mic, m.cam, m.id === C.hostId); if (!P.on) { P.pm.material.map = P.card; P.pm.material.needsUpdate = true; } }
    }
    syncMedia();
  }
  function removePanel(id) { const P = panels.get(id); if (!P) return; panels.delete(id); P.g.parent && P.g.parent.remove(P.g); a.hotspots = (a.hotspots || []).filter((h) => h !== P.g); if (P.card) P.card.dispose(); if (P.vt) P.vt.dispose(); P.pm.material.dispose(); P.fr.material.dispose(); }
  function clearPanels() { for (const id of [...panels.keys()]) removePanel(id); }
  function videoFor(id) { const C = st.circle; if (!C) return null; if (id === st.me.id) { if (!C.mesh.hasCam) return null; if (!st.selfV) { st.selfV = document.createElement('video'); st.selfV.muted = true; st.selfV.playsInline = true; st.selfV.autoplay = true; media.appendChild(st.selfV); } if (st.selfV.srcObject !== C.mesh.camStream) { st.selfV.srcObject = C.mesh.camStream; st.selfV.play().catch(() => { }); } return st.selfV; } const v = C.mesh.video(id); if (v && !v.parentNode) { media.appendChild(v); v.play().catch(() => { }); } const p = C.mesh.peers.get(id); if (p && p.audioEl && !p.audioEl.parentNode) media.appendChild(p.audioEl); return v; }
  function syncMedia() { const C = st.circle; if (!C) return; for (const id of C.mesh.peers.keys()) videoFor(id); if (st.grid) drawGrid(); }
  const camV = new T.Vector3(), camD = new T.Vector3(), tmpV = new T.Vector3(); let budgetT = 0;
  function panelFrame(t) {
    const C = st.circle; if (!C || st.active !== C.slot) { for (const P of panels.values()) P.g.visible = false; return; }
    const xr = a.renderer.xr && a.renderer.xr.isPresenting; const cam = xr ? a.renderer.xr.getCamera() : a.camera; cam.getWorldPosition(camV); cam.getWorldDirection(camD);
    for (const P of panels.values()) { const [sx, sz] = C.seats[P.seat] || [0, 0]; P.g.position.set(sx * 1.04, 2.25, sz * 1.04); P.g.visible = true; P.g.getWorldPosition(tmpV); P.g.rotation.y = Math.atan2(camV.x - tmpV.x, camV.z - tmpV.z);
      if (P.id !== st.me.id) { const lv = C.mesh.level(P.id); P.fr.material.color.setHex(lv > 0.08 ? 0xffb060 : 0x3a2416); C.mesh.place(P.id, tmpV.x, 1.15, tmpV.z); } else P.fr.material.color.setHex(C.mesh.micLive ? 0xffb060 : 0x3a2416); }
    C.mesh.listener(camV, camD);
    /* video budget: the nearest panels in front of you, 5 on a headset / phone, 11 on a desktop */
    if (t - budgetT < 0.4) return; budgetT = t; const K = (xr || MOB) ? 5 : 11; const cand = [];
    for (const P of panels.values()) { P.g.getWorldPosition(tmpV); const d = tmpV.distanceTo(camV); tmpV.sub(camV).normalize(); const front = tmpV.dot(camD) > 0.15; const v = P.cam ? videoFor(P.id) : null; if (v && d < 16 && front && (P.id === st.me.id || C.mesh.connected(P.id))) cand.push([d, P, v]); }
    cand.sort((x, y) => x[0] - y[0]); const on = new Set(cand.slice(0, K).map((c) => c[1]));
    for (const P of panels.values()) { const want = on.has(P); if (want && !P.on) { const v = cand.find((c) => c[1] === P)[2]; if (!P.vt || P.vt.image !== v) { if (P.vt) P.vt.dispose(); P.vt = new T.VideoTexture(v); P.vt.colorSpace = T.SRGBColorSpace; } P.pm.material.map = P.vt; P.pm.material.needsUpdate = true; P.on = true; P.pm.scale.x = P.id === st.me.id ? -1 : 1; } else if (!want && P.on) { P.pm.material.map = P.card; P.pm.material.needsUpdate = true; P.on = false; P.pm.scale.x = 1; } }
  }
  function personCard(id) {
    const C = st.circle; if (!C) return; const m = C.members.find((x) => x.id === id); if (!m) return; const nm = cleanName(m.n, id); const sh = S(); let acts = [];
    try { if (sh && sh.playerActions) acts = sh.playerActions(id, nm, { where: 'world-fire', circle: C.key }) || []; } catch (e) { }
    const vol = (C.mesh.peers.get(id) || {}).vol; acts.unshift({ label: vol === 0 ? '🔊 Unmute for me' : '🔇 Mute for me', fn: () => C.mesh.volume(id, vol === 0 ? 1 : 0) });
    if (C.hostId === st.me.id) acts.push({ label: '🚪 Remove from this circle', fn: () => kick(id) });
    a.popup('🔥 ' + nm, '<p>In your circle at The World Fire.</p>', acts);
  }

  /* ===== host controls (WVM_SHIELD when it has them; the circle's own messages either way) ===== */
  const isHost = () => st.circle && st.circle.hostId === st.me.id;
  function kick(id) { const C = st.circle; if (!isHost()) return; C.net.send('kick', { id }); try { const sh = S(); sh && sh.kick && sh.kick('fire:' + C.key, id); } catch (e) { } a.toast('🚪 Removed from your circle.', 2200); }
  function muteAll() { const C = st.circle; if (!isHost()) return; C.net.send('muteall', {}); try { const sh = S(); sh && sh.muteAll && sh.muteAll('fire:' + C.key); } catch (e) { } a.toast('🔇 Everyone else is muted.', 2200); }
  function lock(on) { const C = st.circle; if (!isHost()) return; C.locked = on ? Date.now() : 0; trackMe(); if (st.lobby) st.lobby.track(lobbyMeta()); try { const sh = S(); if (sh && (sh.lockRoom || sh.lock)) (sh.lockRoom || sh.lock)('fire:' + C.key, !!on); } catch (e) { } a.toast(on ? '🔒 Circle closed to new people.' : '🔓 Circle open again.', 2200); drawBar(); }
  function hostMenu() { const C = st.circle; if (!isHost()) return; const acts = [{ label: '🔇 Mute everyone', fn: muteAll }, { label: C.locked ? '🔓 Open the circle again' : '🔒 Close the circle to new people', fn: () => lock(!C.locked) }]; for (const m of C.members) if (m.id !== st.me.id) acts.push({ label: '🚪 Remove ' + cleanName(m.n, m.id), fn: () => kick(m.id) }); a.popup('👑 Host controls', '<p>You are the host of this circle' + (C.priv ? '' : ' (the person here longest)') + '.</p>', acts.slice(0, 8)); }
  async function invite() {
    const C = st.circle; if (!C || !C.priv) return; const url = location.origin + '/mall/?fire=' + C.code; const so = SOC();
    /* WVM_SOCIAL: a real allofus DM to your connections (words only: the filter refuses links, so the code travels as text) */
    let people = []; try { people = so && so.myPeople ? so.myPeople().filter((f) => f.canMessage) : []; } catch (e) { people = []; }
    if (people.length) {
      const acts = people.slice(0, 6).map((f) => ({ label: (st.invited.has(String(f.id)) ? '✅ ' : '💌 ') + cleanName(f.name || f.username, f.id), keep: true, fn: async () => { st.invited.add(String(f.id)); const ok = await so.send(f.id, '🔥 Come sit with me at The World Fire in World VR Mall. My private circle code is ' + C.code + ' (tap Join with a code at the lobby stone).'); if (ok) a.toast('💌 Invite sent to ' + cleanName(f.name, f.id), 2600); } }));
      acts.push({ label: C.friendsOnly ? '🔓 Let anyone with the code in' : '🔒 Only my people (connections + invites)', fn: () => { C.friendsOnly = !C.friendsOnly; a.toast(C.friendsOnly ? '🔒 Only your connections and the people you invite can stay.' : '🔓 Anyone with the code can join.', 3200); } });
      acts.push({ label: '🔗 Copy the link instead', fn: () => { try { navigator.clipboard.writeText(url); } catch (e) { } a.toast('🔗 Link copied. Code: ' + C.code, 3600); } });
      a.popup('💌 Invite your people', `<p>Your circle code is <b style="letter-spacing:2px">${esc(C.code)}</b>. Tap a name to send them an allofus message with it.</p>`, acts); return;
    }
    try { if (navigator.share) { await navigator.share({ title: 'The World Fire', text: 'Join my circle at The World Fire (World VR Mall). Code: ' + C.code, url }); return; } } catch (e) { }
    try { await navigator.clipboard.writeText(url); } catch (e) { }
    a.popup('🔒 Invite your people', `<p>Send them this link: <b>${esc(url)}</b></p><p>Or the code <b style="letter-spacing:2px">${esc(C.code)}</b> (Join with a code at the lobby stone). The link is on your clipboard.</p>`, []);
  }

  /* ===== camera, mic, push to talk ===== */
  async function toggleMic() { const C = st.circle; if (!C) return; if (C.mesh.hasMic) { C.mesh.micOff(); C.mic = 0; } else { const sh = S(); if (!devLocal && sh && sh.canTalk) { const r = sh.canTalk(); if (r && r.ok === false) { a.toast('🔇 ' + (r.why || 'Voice is not open for this account.'), 3600); return; } } C.mesh.resume(); if (await C.mesh.micOn()) C.mic = 1; else a.toast('🎤 No microphone, or permission was declined.', 3600); } trackMe(); drawBar(); }
  async function toggleCam() { const C = st.circle; if (!C) return; if (C.mesh.hasCam) { C.mesh.camOff(); C.cam = 0; } else if (await C.mesh.camOn()) C.cam = 1; else a.toast('📷 No camera here, or permission was declined. (A VR headset has no face camera: voice still works.)', 4200); trackMe(); drawBar(); syncPanels(); }
  function togglePTT() { const C = st.circle; if (!C) return; C.mesh.setPTT(!C.mesh.ptt); a.toast(C.mesh.ptt ? '🎙️ Push to talk: hold Space (or the Talk button; left grip in VR).' : '🎤 Open mic.', 3000); drawBar(); }
  addEventListener('keydown', (e) => { if (e.code !== 'Space' || e.repeat || !st.circle || !st.circle.mesh.ptt || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; e.preventDefault(); st._spaceDown = true; st.circle.mesh.talk(true); drawBar(); });
  addEventListener('keyup', (e) => { if (e.code !== 'Space') return; st._spaceDown = false; if (!st.circle) return; st.circle.mesh.talk(false); drawBar(); });
  let vrTalk = false; function vrPTT() { const C = st.circle; if (!C || !C.mesh.ptt) return; const s = a.renderer.xr.getSession && a.renderer.xr.getSession(); if (!s) return; let down = false; for (const src of s.inputSources) if (src.handedness === 'left' && src.gamepad && src.gamepad.buttons[1] && src.gamepad.buttons[1].pressed) down = true; if (down !== vrTalk) { vrTalk = down; C.mesh.talk(down); drawVR(); } }

  /* ===== the flat control bar + grid ===== */
  const css = document.createElement('style'); css.textContent = `
  #wf-bar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:45;display:none;gap:6px;padding:8px;border-radius:18px;background:rgba(18,10,6,.86);border:1px solid rgba(255,154,74,.45);box-shadow:0 10px 40px rgba(0,0,0,.5),0 0 30px rgba(255,120,40,.15);backdrop-filter:blur(10px);font-family:Poppins,"Segoe UI",Arial,sans-serif;max-width:calc(100vw - 32px);flex-wrap:wrap;justify-content:center}
  #wf-bar.on{display:flex} #wf-bar button{border:0;border-radius:12px;padding:9px 12px;font:600 13px inherit;font-family:inherit;color:#ffe2b8;background:rgba(255,154,74,.12);cursor:pointer;min-width:44px;min-height:40px;touch-action:none} #wf-bar button:hover{background:rgba(255,154,74,.25)} #wf-bar button.live{background:#ff9a4a;color:#1a0e08} #wf-bar button.red{background:rgba(225,29,72,.85);color:#fff} #wf-bar .lbl{color:#c8955a;font-size:12px;align-self:center;padding:0 6px}
  #wf-grid{position:fixed;inset:0;z-index:44;background:rgba(8,5,3,.94);display:none;padding:18px 18px 90px;box-sizing:border-box;overflow:auto;font-family:Poppins,"Segoe UI",Arial,sans-serif}
  #wf-grid.on{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:12px;align-content:start} .wf-tile{position:relative;aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:linear-gradient(#2a1810,#0c0807);border:2px solid #3a2416} .wf-tile.talk{border-color:#ffb060} .wf-tile video{width:100%;height:100%;object-fit:cover;display:block} .wf-tile .nm{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.6);color:#ffe2b8;padding:3px 9px;border-radius:9px;font-size:13px} .wf-tile .ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;color:#ff9a4a}
  @media (max-width:520px){#wf-bar button{padding:8px 9px;font-size:12px}}`; document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'wf-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Fire circle controls'); document.body.appendChild(bar);
  const grid = document.createElement('div'); grid.id = 'wf-grid'; grid.setAttribute('aria-label', 'Everyone in your circle'); document.body.appendChild(grid);
  function showBar() { bar.classList.add('on'); } function hideBar() { bar.classList.remove('on'); vrPanel && (vrPanel.mesh.visible = false); }
  function drawBar() {
    const C = st.circle; if (!C) return; const M = C.mesh; const b = (k, label, cls = '', title = '') => `<button data-k="${k}" class="${cls}" title="${title}" aria-label="${title || label}">${label}</button>`;
    bar.innerHTML = `<span class="lbl">${C.priv ? '🔒 private' : '🔥 circle ' + esc(C.key)} · ${C.members.length}/${CAP}</span>` + b('mic', M.hasMic ? '🎤 Mic on' : '🔇 Mic off', M.hasMic ? 'live' : '', 'Microphone') + (M.hasMic ? b('ptt', M.ptt ? '🎙️ Push to talk' : '🎙️ Open mic', M.ptt ? 'live' : '', 'Push to talk') + (M.ptt ? b('talk', M.micLive ? '🟢 Talking' : '✋ Hold to talk', M.micLive ? 'live' : '', 'Hold to talk') : '') : '') + b('cam', M.hasCam ? '📷 Camera on' : '📷 Camera off', M.hasCam ? 'live' : '', 'Camera') + b('grid', st.grid ? '🔥 Fire view' : '▦ Grid', '', 'Grid view') + b('sit', st.sitting ? '🧍 Stand' : '🪑 Sit', '', 'Sit or stand') + (C.priv ? b('inv', '💌 Invite', '', 'Invite') : '') + (isHost() ? b('host', '👑 Host', '', 'Host controls') : '') + b('leave', '🚪 Leave', 'red', 'Leave the circle');
    drawVR();
  }
  bar.addEventListener('click', (e) => { const k = e.target.closest('[data-k]'); if (!k) return; const v = k.dataset.k; if (v === 'mic') toggleMic(); else if (v === 'ptt') togglePTT(); else if (v === 'cam') toggleCam(); else if (v === 'grid') (st.grid ? closeGrid() : openGrid()); else if (v === 'sit') { st.sitting ? standUp() : st.circle.mySeat >= 0 && sitAt(st.circle.mySeat); drawBar(); } else if (v === 'inv') invite(); else if (v === 'host') hostMenu(); else if (v === 'leave') leaveCircle(); });
  bar.addEventListener('pointerdown', (e) => { const k = e.target.closest('[data-k="talk"]'); if (k && st.circle) { st.circle.mesh.talk(true); k.classList.add('live'); } });
  addEventListener('pointerup', () => { if (st.circle && st.circle.mesh.ptt && st.circle.mesh.micLive && !st._spaceDown) { st.circle.mesh.talk(false); drawBar(); } });
  function openGrid() { st.grid = true; grid.classList.add('on'); drawGrid(); drawBar(); }
  function closeGrid() { if (!st.grid) return; st.grid = false; grid.classList.remove('on'); for (const v of grid.querySelectorAll('video')) { media.appendChild(v); v.play().catch(() => { }); } grid.innerHTML = ''; drawBar(); }
  function drawGrid() {
    const C = st.circle; if (!C || !st.grid) return; for (const v of grid.querySelectorAll('video')) media.appendChild(v); grid.innerHTML = '';
    for (const m of C.members) { const me = m.id === st.me.id; const nm = me ? st.me.name + ' (you)' : cleanName(m.n, m.id); const t = document.createElement('div'); t.className = 'wf-tile'; t.dataset.id = m.id; const v = m.cam ? videoFor(m.id) : null;
      if (v) { t.appendChild(v); v.style.transform = me ? 'scaleX(-1)' : ''; v.play().catch(() => { }); } else t.innerHTML = `<div class="ini">${esc(nm.charAt(0).toUpperCase())}</div>`;
      const n = document.createElement('div'); n.className = 'nm'; n.textContent = (m.id === C.hostId ? '👑 ' : '') + (m.mic ? '🎤 ' : '🔇 ') + nm; t.appendChild(n); if (!me) t.onclick = () => personCard(m.id); grid.appendChild(t); }
  }
  setInterval(() => { const C = st.circle; if (!C || !st.grid) return; for (const t of grid.children) { const id = t.dataset.id; const lv = id === st.me.id ? (C.mesh.micLive ? 0.1 : 0) : C.mesh.level(id); t.classList.toggle('talk', lv > 0.08); } }, 250);

  /* ===== the VR control strip: a lap panel in front of your seat, driven by the laser ===== */
  let vrPanel = null; const VR_BTN = ['mic', 'ptt', 'cam', 'sit', 'host', 'leave'];
  function ensureVR() { if (vrPanel) return vrPanel; vrPanel = makeScreen(a, { w: 1.1, h: 0.2, px: 880, py: 160, transparent: true, down: (u) => { const i = Math.floor(u * VR_BTN.length); const k = VR_BTN[i]; if (k === 'mic') toggleMic(); else if (k === 'ptt') togglePTT(); else if (k === 'cam') toggleCam(); else if (k === 'sit') { st.sitting ? standUp() : st.circle && st.circle.mySeat >= 0 && sitAt(st.circle.mySeat); drawVR(); } else if (k === 'host') (isHost() ? hostMenu() : invite()); else if (k === 'leave') leaveCircle(); } }); vrPanel.mesh.visible = false; SC.add(vrPanel.mesh); return vrPanel; }
  function drawVR() {
    const C = st.circle; if (!C || !(a.renderer.xr && a.renderer.xr.isPresenting)) return; const P = ensureVR(); const g = P.g, M = C.mesh; g.clearRect(0, 0, 880, 160);
    const labels = [M.hasMic ? (M.ptt ? (M.micLive ? '🟢 Talking' : '✋ L-grip') : '🎤 Mic on') : '🔇 Mic off', M.ptt ? '🎙️ PTT on' : '🎙️ PTT off', M.hasCam ? '📷 Cam on' : '📷 Cam off', st.sitting ? '🧍 Stand' : '🪑 Sit', isHost() ? '👑 Host' : (C.priv ? '💌 Invite' : '·'), '🚪 Leave'];
    const live = [M.hasMic, M.ptt, M.hasCam, false, false, false]; const w = 880 / labels.length;
    labels.forEach((l, i) => { g.fillStyle = i === 5 ? 'rgba(225,29,72,.9)' : live[i] ? '#ff9a4a' : 'rgba(30,16,10,.92)'; g.beginPath(); g.roundRect ? g.roundRect(i * w + 5, 8, w - 10, 144, 22) : g.rect(i * w + 5, 8, w - 10, 144); g.fill(); g.strokeStyle = 'rgba(255,154,74,.6)'; g.lineWidth = 3; g.stroke(); g.fillStyle = live[i] ? '#1a0e08' : '#ffe2b8'; g.font = 'bold 30px Poppins, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(l, i * w + w / 2, 80); });
    P.dirty();
  }
  function vrFrame() {
    const C = st.circle; const xr = a.renderer.xr && a.renderer.xr.isPresenting; if (!vrPanel && !(xr && C)) return; const P = ensureVR(); const on = !!(xr && C && st.active === C.slot && C.mySeat >= 0);
    if (on !== P.mesh.visible) { P.mesh.visible = on; if (on) drawVR(); } if (!on) return;
    const [sx, sz] = C.seats[C.mySeat]; const i = C.slot; const fx = SLOTS[i][0], fz = SLOTS[i][1]; const k = (Math.hypot(sx, sz) - 0.9) / Math.hypot(sx, sz);
    P.mesh.position.set(fx + sx * k, st.sitting ? 0.95 : 1.15, fz + sz * k); P.mesh.rotation.set(0, Math.atan2(sx, sz), 0, 'YXZ'); P.mesh.rotateX(-0.6); vrPTT();
  }

  /* ===== crackle + the per-frame work ===== */
  let actrl = null;
  function startCrackle() {
    if (actrl) return; try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 2.5; pan.rolloffFactor = 1.2; const gain = ctx.createGain(); gain.gain.value = 0.55; gain.connect(pan); pan.connect(ctx.destination); actrl = { ctx, pan, gain, src: null };
      const play = (buf) => { if (!actrl || actrl.ctx !== ctx) return; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(gain); s.start(); actrl.src = s; };
      fetch('/audio/world-fire-crackle.mp3').then((r) => { if (!r.ok) throw new Error('no file'); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)).then(play).catch(() => play(crackleBuffer(ctx)));
      const resume = () => { if (actrl && actrl.ctx.state === 'suspended') actrl.ctx.resume().catch(() => { }); }; resume(); addEventListener('pointerdown', resume, { passive: true }); addEventListener('keydown', resume);
    } catch (e) { actrl = null; }
  }
  function stopCrackle() { if (!actrl) return; const c = actrl; actrl = null; try { c.src && c.src.stop(); } catch (e) { } c.ctx.close().catch(() => { }); }
  const aV = new T.Vector3(), aD = new T.Vector3(); let slowT = 0, farT = 0;
  function frame(dt, t) {
    const P = a.player.position; const C = st.circle;
    if (t - slowT > 0.3) { slowT = t; const [i, d] = nearestSlot(P); if (!(C && st.active === C.slot && Math.hypot(P.x - SLOTS[C.slot][0], P.z - SLOTS[C.slot][1]) < 26)) setActive(d < 30 ? i : -1);
      if (st.active >= 0) { act.x = SLOTS[st.active][0]; act.z = SLOTS[st.active][1]; act.r = 7; const lb = actLabel(); if (lb !== act.label) { act.label = lb; a._act = null; } } else act.r = 0;
      /* walked away from your circle: after 4 s more than 28 m off, you leave it */
      if (C && Math.hypot(P.x - SLOTS[C.slot][0], P.z - SLOTS[C.slot][1]) > 28) { farT += 0.3; if (farT > 4) { farT = 0; leaveCircle(); } } else farT = 0;
      if (st.sitting && st.solo && st.active < 0) standUp();
      if (actrl && actrl.ctx.state === 'suspended') actrl.ctx.resume().catch(() => { });
    }
    dragFrame(t); panelFrame(t); vrFrame();
    if (actrl) { const xr = a.renderer.xr && a.renderer.xr.isPresenting; const cam = xr ? a.renderer.xr.getCamera() : a.camera; cam.getWorldPosition(aV); cam.getWorldDirection(aD); const L = actrl.ctx.listener; const fx = st.active >= 0 ? SLOTS[st.active][0] : HALL.x, fz = st.active >= 0 ? SLOTS[st.active][1] : HALL.z; const p = actrl.pan;
      if (L.positionX) { L.positionX.value = aV.x; L.positionY.value = aV.y; L.positionZ.value = aV.z; L.forwardX.value = aD.x; L.forwardY.value = aD.y; L.forwardZ.value = aD.z; L.upY.value = 1; p.positionX.value = fx; p.positionY.value = 0.8; p.positionZ.value = fz; } else { L.setPosition(aV.x, aV.y, aV.z); L.setOrientation(aD.x, aD.y, aD.z, 0, 1, 0); p.setPosition(fx, 0.8, fz); } }
  }
  addEventListener('pagehide', () => { if (st.circle) { try { st.circle.net.leave(); st.circle.mesh.close(); } catch (e) { } } });
  return API;
}
