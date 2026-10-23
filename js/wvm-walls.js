/* ============================================================
   WALLS, ART & DEPTH for the atrium · Oct 22 2026
   Loaded by wvm-inside.js after the atrium is built: import('/js/wvm-walls.js').then(m => m.installWalls(app)).
   1) PAINT WALL (-15, 0, 4)       a 6 x 3 m canvas you paint with the VR laser (hold the trigger), a finger (hand tracking) or the mouse
   2) PIN THE TAIL (-12, 0, -12)   peek 3 s, lights out, tap where the tail goes · 3 rounds · Bullseye mode
   3) NEON WALL (12, 0, -12)       18 neon tiles you switch on and off + DISCO / LAVA / BLACKLIGHT / PARTY / OFF scenes that tint the room
   4) ART + DEPTH                  6 kinetic mobiles between the aquarium columns, a glowing floor inlay, 6 framed abstracts on pylons, a mezzanine band
   Quest 3 rules kept here: no lights, glow = MeshBasicMaterial / emissive, userData.noFreeze on everything that moves, no per-frame allocations,
   canvases redraw only when something changed (paint 30 Hz while a stroke runs, blackout 30 Hz, neon scenes 20 Hz), 5 canvas textures, ~35 draw calls.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeScreen } from '/js/wvm-screen.js';
import { rand, clamp } from '/js/wvm-engine.js?v=59';

const T = THREE;
const FONT = 'Poppins, Segoe UI, Arial, sans-serif';
/* an object whose front is +z turned so that front looks at the World Fountain at (0, 0) */
const faceFountain = (x, z) => Math.atan2(-x, -z);
/* axis-aligned obstacle for a wall of half width hw (along its own x) and half thickness ht, turned by yaw */
function wallBox(app, x, z, yaw, hw, ht) { const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)); app.addBox(x, z, hw * c + ht * s + 0.15, hw * s + ht * c + 0.15); }
/* a spot d metres in front of a wall (toward the fountain) and the yaw that looks at the wall from there */
function standSpot(x, z, d) { const L = Math.hypot(x, z) || 1; const px = x - x / L * d, pz = z - z / L * d; return { x: px, z: pz, yaw: Math.atan2(-(x - px), -(z - pz)) }; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function installWalls(app) {
  const S = app.scene; const W = { calls: {} };
  const titles = makeTitles(app);
  W.paint = buildPaintWall(app, titles.sign(0));
  W.pin = buildPinTheTail(app, titles.sign(1));
  W.neon = buildNeonWall(app, titles.sign(2));
  W.art = buildArtAndDepth(app);
  S.add(titles.group);
  try { window.WVM_WALLS = W; } catch (e) { }
  return W;
}

/* ------------------------------------------------------------ title signs: ONE 1024x384 canvas, three 128 px rows, one plane each ------------------------------------------------------------ */
function makeTitles(app) {
  const rows = [
    ['PAINT WALL', 'hold the trigger and draw · or drag with your mouse', '#38f0ff'],
    ['PIN THE TAIL', 'peek for 3 seconds · lights out · tap where the tail goes', '#ff4f79'],
    ['NEON WALL', 'tap a tile · pick a scene · DISCO · LAVA · BLACKLIGHT · PARTY', '#b08cff'],
  ];
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const g = c.getContext('2d');
  rows.forEach((r, i) => {
    const y = i * 128; g.fillStyle = '#070a18'; rr(g, 4, y + 4, 1016, 120, 26); g.fill();
    g.lineWidth = 5; g.strokeStyle = r[2]; g.shadowColor = r[2]; g.shadowBlur = 18; rr(g, 8, y + 8, 1008, 112, 24); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.font = 'bold 44px ' + FONT; g.shadowBlur = 22; g.fillText(r[0], 512, y + 44, 980);
    g.shadowBlur = 0; g.fillStyle = r[2]; g.font = '600 26px ' + FONT; g.fillText(r[1], 512, y + 92, 980);
  });
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = T.LinearFilter; tex.anisotropy = 4;
  const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  const group = new T.Group();
  return { group, sign: (i) => { const geo = new T.PlaneGeometry(4.2, 0.525); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / 3); const m = new T.Mesh(geo, mat); group.add(m); return m; } };
}

/* ------------------------------------------------------------ 1) PAINT WALL ------------------------------------------------------------ */
function buildPaintWall(app, sign) {
  const X = -15, Z = 4, WW = 6, HH = 3, BOT = 0.4; const yaw = faceFountain(X, Z);
  const COLORS = ['#ffffff', '#ff3d6e', '#ff9f1c', '#ffe94a', '#5cff6a', '#38f0ff', '#7b6bff', '#ff5cf0'];
  const SIZES = [6, 14, 28]; const BG = '#0a0e1f';
  const P = { color: 2, size: 1, neon: true, eraser: false, strokes: 0, saved: false, painting: false };
  let stroke = null, needs = false, lastFlush = 0;
  const sc = makeScreen(app, { w: WW, h: HH, px: 1024, py: 512, hover, down, up, leave });
  const g = sc.g, PW = sc.pw, PH = sc.ph, STRIP = Math.round(PH * 0.88);
  g.fillStyle = BG; g.fillRect(0, 0, PW, PH);
  /* the palette strip: 8 colors, 3 sizes, NEON, ERASE, CLEAR, SAVE · hit regions */
  const BTN = []; const addBtn = (x, w, id, v) => BTN.push({ x, w, id, v });
  COLORS.forEach((cc, i) => addBtn(14 + i * 50, 46, 'color', i)); SIZES.forEach((s, i) => addBtn(430 + i * 46, 42, 'size', i));
  addBtn(584, 92, 'neon'); addBtn(684, 92, 'erase'); addBtn(784, 92, 'clear'); addBtn(884, 126, 'save');
  function drawStrip() {
    g.save(); g.shadowBlur = 0; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#121735'; g.fillRect(0, STRIP, PW, PH - STRIP); g.fillStyle = '#2a3366'; g.fillRect(0, STRIP, PW, 2);
    const cy = STRIP + (PH - STRIP) / 2;
    for (const b of BTN) {
      if (b.id === 'color') { g.fillStyle = COLORS[b.v]; rr(g, b.x, cy - 20, b.w, 40, 9); g.fill(); if (P.color === b.v && !P.eraser) { g.lineWidth = 4; g.strokeStyle = '#fff'; rr(g, b.x - 3, cy - 23, b.w + 6, 46, 11); g.stroke(); } }
      else if (b.id === 'size') { g.fillStyle = P.size === b.v ? '#ffffff' : '#7f8ac4'; g.beginPath(); g.arc(b.x + b.w / 2, cy, 5 + b.v * 5, 0, 7); g.fill(); }
      else { const on = (b.id === 'neon' && P.neon) || (b.id === 'erase' && P.eraser); const col = b.id === 'save' ? '#5cff6a' : b.id === 'clear' ? '#ff4f79' : '#38f0ff'; g.fillStyle = on ? col : '#1b2250'; rr(g, b.x, cy - 21, b.w, 42, 10); g.fill(); g.lineWidth = 2; g.strokeStyle = col; g.stroke(); g.fillStyle = on ? '#07102a' : '#eaf3ff'; g.font = 'bold 22px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.id === 'save' ? (P.saved ? 'SAVED ✓' : 'SAVE') : b.id.toUpperCase(), b.x + b.w / 2, cy + 1); }
    }
    g.restore(); needs = true;
  }
  function hitStrip(x) { for (const b of BTN) if (x >= b.x && x <= b.x + b.w) return b; return null; }
  function clearAll() { g.save(); g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0; g.fillStyle = BG; g.fillRect(0, 0, PW, STRIP); g.restore(); P.strokes = 0; P.saved = false; drawStrip(); }
  function save() {
    let q = 0.82, url = ''; for (let i = 0; i < 6; i++) { url = sc.canvas.toDataURL('image/jpeg', q); if (url.length <= 200 * 1024) break; q *= 0.7; }
    try { localStorage.setItem('wvm_paint', url); P.saved = true; app.toast('🎨 Saved on this wall · ' + Math.round(url.length / 1024) + ' KB', 2200); } catch (e) { app.toast('Could not save (storage full?)', 2200); }
    drawStrip();
  }
  function restore() { let url = null; try { url = localStorage.getItem('wvm_paint'); } catch (e) { } if (!url) return; const im = new Image(); im.onload = () => { g.save(); g.shadowBlur = 0; g.drawImage(im, 0, 0, PW, PH); g.restore(); P.saved = true; drawStrip(); }; im.src = url; }
  function segment(x, y) {
    const s = stroke; const mx = (s.x + x) / 2, my = (s.y + y) / 2; const col = P.eraser ? BG : COLORS[P.color]; const lw = SIZES[P.size] * (P.eraser ? 2.2 : 1);
    g.save(); g.beginPath(); g.rect(0, 0, PW, STRIP); g.clip(); g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke(); };
    g.strokeStyle = col; g.lineWidth = lw; if (P.neon && !P.eraser) { g.shadowColor = col; g.shadowBlur = lw * 1.6; } path();
    if (P.neon && !P.eraser) { g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(1.5, lw * 0.35); path(); }
    g.restore(); s.x = x; s.y = y; s.mx = mx; s.my = my; needs = true;
  }
  function dot(x, y) { const col = P.eraser ? BG : COLORS[P.color]; const lw = SIZES[P.size] * (P.eraser ? 2.2 : 1); g.save(); g.beginPath(); g.rect(0, 0, PW, STRIP); g.clip(); g.fillStyle = col; if (P.neon && !P.eraser) { g.shadowColor = col; g.shadowBlur = lw * 1.6; } g.beginPath(); g.arc(x, y, lw / 2, 0, 7); g.fill(); g.restore(); needs = true; }
  function down(u, v, info) {
    const [x, y] = sc.px(u, v);
    if (y >= STRIP) { const b = hitStrip(x); if (!b) return; if (b.id === 'color') { P.color = b.v; P.eraser = false; } else if (b.id === 'size') P.size = b.v; else if (b.id === 'neon') P.neon = !P.neon; else if (b.id === 'erase') P.eraser = !P.eraser; else if (b.id === 'clear') { clearAll(); app.toast('Wall wiped clean', 1400); return; } else if (b.id === 'save') { save(); return; } drawStrip(); return; }
    stroke = { x, y, mx: x, my: y, hd: info.hd }; P.painting = true; P.strokes++; P.saved = false; dot(x, y);
  }
  function hover(u, v, info) { if (!stroke || !info.pressed) return; const [x, y] = sc.px(u, v); if (y >= STRIP) return; if (Math.abs(x - stroke.x) + Math.abs(y - stroke.y) < 1.5) return; segment(x, y); }
  function up() { if (stroke) { stroke = null; P.painting = false; drawStrip(); } }
  function leave() { up(); }
  drawStrip(); restore();
  /* texture uploads at most 30 times a second while a stroke runs (one upload per frame is the Quest's enemy) */
  app.onUpdate((dt, t) => { if (!needs) return; if (t - lastFlush < 1 / 30) return; lastFlush = t; needs = false; sc.dirty(); });
  /* the wall itself: a dark backing slab behind the screen */
  const grp = new T.Group(); grp.position.set(X, 0, Z); grp.rotation.y = yaw;
  sc.mesh.position.set(0, BOT + HH / 2, 0.06); grp.add(sc.mesh);
  const back = new T.Mesh(new T.BoxGeometry(WW + 0.3, HH + 0.3, 0.12), new T.MeshStandardMaterial({ color: 0x0c1230, roughness: 0.6, metalness: 0.3, emissive: 0x38f0ff, emissiveIntensity: 0.12 })); back.position.set(0, BOT + HH / 2, -0.02); grp.add(back);
  sign.position.set(0, BOT + HH + 0.48, 0.02); grp.add(sign);
  app.scene.add(grp); wallBox(app, X, Z, yaw, WW / 2 + 0.15, 0.1);
  const sp = standSpot(X, Z, 2.6);
  app.addPlace({ id: 'paint-wall', name: 'Paint Wall · draw with your laser', icon: '🎨', x: sp.x, z: sp.z, yaw: sp.yaw, cat: 'Fun', top: true, keys: 'paint wall draw drawing graffiti art canvas brush neon color', say: 'The Paint Wall. Hold the trigger and draw. 🎨' });
  app.addInteractable(sp.x, sp.z, 4.5, '🎨 Paint Wall · how it works', (a) => a.toast('🎨 Point at the wall, hold the trigger (or drag the mouse) and draw. Colors, sizes, NEON and SAVE live on the bottom strip.', 4200));
  return { get state() { return Object.assign({}, P, { colorHex: COLORS[P.color], sizePx: SIZES[P.size] }); }, screen: sc, group: grp, clear: clearAll, save };
}

/* ------------------------------------------------------------ 2) PIN THE TAIL ------------------------------------------------------------ */
function buildPinTheTail(app, sign) {
  const X = -12, Z = -12, SZ = 2.4, BOT = 0.6; const yaw = faceFountain(X, Z);
  const G = { phase: 'idle', round: 0, scores: [], pins: [], bullseye: false, t0: 0, dx: 0, dy: 0, last: null, total: 0, best: 0 };
  const sc = makeScreen(app, { w: SZ, h: SZ, px: 768, py: 768, down }); const g = sc.g, PW = sc.pw, PH = sc.ph;
  const TAIL = { x: 236, y: 396 }, BULL = { x: 384, y: 372 };
  const spot = () => G.bullseye ? BULL : TAIL;
  const LINES = [
    [95, ['Dead center. Did you peek?', 'The donkey is speechless.', 'A legend is born.']],
    [75, ['So close the donkey flinched.', 'Nearly perfect. Nearly.', 'That is a very respectable tail.']],
    [45, ['The donkey has questions.', 'Right zip code, wrong house.', 'Close enough to be a tail-ish thing.']],
    [15, ['That is an ear now. Congratulations.', 'The donkey would like a word.', 'Bold placement. Very bold.']],
    [0, ['You pinned the wall.', 'The tail is now a wall decoration.', 'Somewhere, a donkey sighs.']],
  ];
  const lineFor = (s) => { for (const L of LINES) if (s >= L[0]) return L[1][Math.floor(Math.random() * L[1].length)]; return LINES[4][1][0]; };
  let needs = false, lastDraw = 0, pendingRedraw = 0;
  function donkey(ox, oy, sil, tail) {
    const body = sil ? '#15151c' : '#9d8b7a', dark = sil ? '#15151c' : '#6f5f52', light = sil ? '#15151c' : '#d9c9b6';
    g.save(); g.translate(ox, oy);
    g.fillStyle = dark; for (const lx of [250, 300, 440, 490]) { rr(g, lx, 420, 34, 150, 12); g.fill(); } /* legs */
    g.fillStyle = body; g.beginPath(); g.ellipse(380, 380, 160, 96, 0, 0, 7); g.fill(); /* body */
    g.beginPath(); g.ellipse(520, 290, 60, 54, 0.4, 0, 7); g.fill(); /* neck */
    g.beginPath(); g.ellipse(585, 250, 78, 50, 0.15, 0, 7); g.fill(); /* head */
    g.fillStyle = light; g.beginPath(); g.ellipse(630, 262, 36, 28, 0.15, 0, 7); g.fill(); /* muzzle */
    g.fillStyle = dark; for (const e of [[540, 180, -0.3], [580, 170, 0.15]]) { g.beginPath(); g.ellipse(e[0], e[1], 16, 44, e[2], 0, 7); g.fill(); } /* ears */
    g.beginPath(); g.moveTo(470, 240); for (let i = 0; i < 7; i++) g.lineTo(480 + i * 12, 232 - (i % 2) * 18); g.lineTo(560, 236); g.lineTo(560, 262); g.lineTo(470, 290); g.closePath(); g.fill(); /* mane */
    if (!sil) { g.fillStyle = '#111'; g.beginPath(); g.arc(600, 238, 6, 0, 7); g.fill(); g.beginPath(); g.arc(648, 266, 3, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.arc(626, 276, 14, 0.2, 2.6); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(602, 236, 2, 0, 7); g.fill(); }
    if (tail) { g.strokeStyle = sil ? '#15151c' : dark; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(TAIL.x, TAIL.y); g.quadraticCurveTo(190, 430, 200, 500); g.stroke(); g.fillStyle = sil ? '#15151c' : '#3c3028'; g.beginPath(); g.ellipse(200, 505, 22, 34, 0.3, 0, 7); g.fill(); }
    else if (!sil) { g.strokeStyle = 'rgba(255,79,121,0.9)'; g.setLineDash([8, 8]); g.lineWidth = 4; g.beginPath(); g.arc(TAIL.x, TAIL.y, 22, 0, 7); g.stroke(); g.setLineDash([]); }
    g.restore();
  }
  function target(ox, oy, sil) { g.save(); g.translate(ox, oy); const cols = sil ? ['#15151c', '#15151c', '#15151c', '#15151c', '#15151c'] : ['#ffffff', '#111111', '#2f6bff', '#ff2d2d', '#ffd23f']; for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(BULL.x, BULL.y, 230 - i * 44, 0, 7); g.fill(); } g.restore(); }
  function subject(ox, oy, sil, tail) { if (G.bullseye) target(ox, oy, sil); else donkey(ox, oy, sil, tail); }
  function bg() { const gr = g.createLinearGradient(0, 0, 0, PH); gr.addColorStop(0, '#f6e7c8'); gr.addColorStop(1, '#e2c9a0'); g.fillStyle = gr; g.fillRect(0, 0, PW, PH); g.fillStyle = '#7a4b2a'; g.fillRect(0, 580, PW, PH - 580); }
  function text(s, x, y, size, col, bold = true) { g.font = (bold ? 'bold ' : '600 ') + size + 'px ' + FONT; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y, PW - 40); }
  function button(x, y, w, h, label, col) { g.fillStyle = col; rr(g, x, y, w, h, 18); g.fill(); text(label, x + w / 2, y + h / 2, 30, '#0b1020'); }
  const BTN_PLAY = { x: 184, y: 640, w: 400, h: 70 }, BTN_MODE = { x: 534, y: 20, w: 214, h: 54 };
  function drawIdle() { bg(); subject(0, 0, false, true); text(G.bullseye ? 'BULLSEYE' : 'PIN THE TAIL', 260, 60, 56, '#3b2416'); text('on the ' + (G.bullseye ? 'target' : 'donkey'), 260, 110, 28, '#6a4a2a', false); button(BTN_PLAY.x, BTN_PLAY.y, BTN_PLAY.w, BTN_PLAY.h, 'TAP TO PLAY · 3 rounds', '#ffd23f'); button(BTN_MODE.x, BTN_MODE.y, BTN_MODE.w, BTN_MODE.h, G.bullseye ? 'Donkey mode' : 'Bullseye mode', '#7cf8ff'); needs = true; }
  function drawPeek(left) { bg(); subject(0, 0, false, false); text('PEEK!', 260, 60, 56, '#3b2416'); text('Remember where the ' + (G.bullseye ? 'bullseye' : 'tail') + ' goes', 260, 110, 26, '#6a4a2a', false); g.fillStyle = '#ff4f79'; g.beginPath(); g.arc(680, 64, 44, 0, 7); g.fill(); text(String(Math.ceil(left)), 680, 66, 54, '#fff'); text('Round ' + (G.round + 1) + ' of 3', 384, 700, 30, '#ffe9c0'); needs = true; }
  function drawDark(t) {
    g.fillStyle = '#07070a'; g.fillRect(0, 0, PW, PH);
    const sx = 384 + Math.sin(t * 0.9) * 170 + Math.sin(t * 2.3) * 60, sy = 380 + Math.cos(t * 1.3) * 120;
    const gr = g.createRadialGradient(sx, sy, 10, sx, sy, 230); gr.addColorStop(0, 'rgba(255,240,200,0.16)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, PW, PH);
    G.dx = Math.sin(t * 0.7) * 26 + Math.sin(t * 1.9) * 10; G.dy = Math.cos(t * 0.5) * 18;
    subject(G.dx, G.dy, true, false);
    text('lights out · tap where the ' + (G.bullseye ? 'bullseye' : 'tail') + ' goes', 384, 40, 24, 'rgba(255,255,255,0.35)', false); needs = true;
  }
  function drawResult() {
    bg(); subject(G.dx, G.dy, false, true); const p = G.last; const s = spot();
    g.strokeStyle = 'rgba(255,79,121,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(s.x + G.dx, s.y + G.dy); g.lineTo(p.x, p.y); g.stroke();
    g.fillStyle = '#ff4f79'; g.beginPath(); g.arc(p.x, p.y, 14, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(20,10,5,0.78)'; rr(g, 40, 596, PW - 80, 140, 20); g.fill(); text(p.score + ' points', 384, 640, 48, '#ffd23f'); text(p.line, 384, 700, 26, '#fff', false); needs = true;
  }
  function drawFinal() { bg(); g.fillStyle = 'rgba(20,10,5,0.82)'; rr(g, 60, 90, PW - 120, 560, 26); g.fill(); text('RESULTS', 384, 150, 50, '#ffd23f'); G.scores.forEach((s, i) => text('Round ' + (i + 1) + ' · ' + s + ' pts', 384, 230 + i * 60, 34, '#fff', false)); text('Total ' + G.total + ' / 300', 384, 440, 44, '#7cf8ff'); text(G.total >= 240 ? 'Tail whisperer.' : G.total >= 150 ? 'Solid pinning.' : G.total >= 60 ? 'The donkey survived.' : 'The wall thanks you.', 384, 500, 28, '#ffe9c0', false); button(BTN_PLAY.x, 560, BTN_PLAY.w, BTN_PLAY.h, 'Play again', '#ffd23f'); button(BTN_MODE.x, BTN_MODE.y, BTN_MODE.w, BTN_MODE.h, G.bullseye ? 'Donkey mode' : 'Bullseye mode', '#7cf8ff'); needs = true; }
  function inBtn(x, y, b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function start() { G.round = 0; G.scores = []; G.pins = []; G.total = 0; G.phase = 'peek'; G.t0 = app.t; drawPeek(3); }
  function pin(x, y, line) {
    const s = spot(); const d = Math.hypot(x - (s.x + G.dx), y - (s.y + G.dy)); const score = Math.round(clamp(100 * (1 - d / (0.6 * PW)), 0, 100));
    G.last = { x, y, score, line: line || lineFor(score), d: Math.round(d) }; G.scores.push(score); G.pins.push(G.last); G.total += score; G.best = Math.max(G.best, score); G.phase = 'result'; G.t0 = app.t; drawResult();
    if (score >= 95) app.celebrate('🎯'); app.toast((score >= 75 ? '🎯 ' : '📌 ') + score + ' pts · ' + G.last.line, 2400);
  }
  function next() { G.round++; if (G.round >= 3) { G.phase = 'final'; drawFinal(); if (G.total >= 240) app.celebrate('🏆'); } else { G.phase = 'peek'; G.t0 = app.t; drawPeek(3); } }
  function down(u, v) {
    const [x, y] = sc.px(u, v);
    if (G.phase === 'idle' || G.phase === 'final') { if (inBtn(x, y, BTN_MODE)) { G.bullseye = !G.bullseye; G.phase = 'idle'; drawIdle(); app.toast(G.bullseye ? '🎯 Bullseye mode' : '🫏 Donkey mode', 1200); return; } if (G.phase === 'final' && !inBtn(x, y, BTN_PLAY)) { G.phase = 'idle'; drawIdle(); return; } start(); return; }
    if (G.phase === 'peek') { app.toast('👀 Not yet · wait for the lights to go out', 1200); return; }
    if (G.phase === 'dark') { pin(x, y); return; }
    if (G.phase === 'result') { next(); }
  }
  drawIdle();
  app.onUpdate((dt, t) => {
    const k = t - G.t0;
    if (G.phase === 'peek') { if (k >= 3) { G.phase = 'dark'; G.t0 = t; G.dx = G.dy = 0; drawDark(0); } else if (t - lastDraw >= 0.1) { drawPeek(3 - k); } }
    else if (G.phase === 'dark') { if (k >= 15) { pin(-999, -999, 'Too slow. The donkey wandered off.'); } else if (t - lastDraw >= 1 / 30) drawDark(k); }
    else if (G.phase === 'result') { if (k >= 3) next(); }
    if (needs) { needs = false; lastDraw = t; sc.dirty(); }
  });
  const grp = new T.Group(); grp.position.set(X, 0, Z); grp.rotation.y = yaw;
  sc.mesh.position.set(0, BOT + SZ / 2, 0.06); grp.add(sc.mesh);
  const frame = new T.Mesh(new T.BoxGeometry(SZ + 0.3, SZ + 0.3, 0.14), new T.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.7, metalness: 0.1, emissive: 0xff4f79, emissiveIntensity: 0.08 })); frame.position.set(0, BOT + SZ / 2, -0.02); grp.add(frame);
  const legs = new T.Mesh(new T.BoxGeometry(0.16, BOT + 0.2, 0.16), new T.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.8 })); legs.position.set(-SZ / 2 + 0.1, (BOT + 0.2) / 2, -0.02); grp.add(legs); const leg2 = legs.clone(); leg2.position.x = SZ / 2 - 0.1; grp.add(leg2);
  sign.position.set(0, BOT + SZ + 0.5, 0.02); sign.scale.setScalar(0.72); grp.add(sign);
  app.scene.add(grp); wallBox(app, X, Z, yaw, SZ / 2 + 0.15, 0.1);
  const sp = standSpot(X, Z, 2.2);
  app.addPlace({ id: 'pin-the-tail', name: 'Pin the Tail on the Donkey', icon: '🫏', x: sp.x, z: sp.z, yaw: sp.yaw, cat: 'Fun', top: true, keys: 'pin the tail donkey party game bullseye target blindfold', say: 'Pin the Tail. Peek, then the lights go out. 🫏' });
  app.addInteractable(sp.x, sp.z, 4, '🫏 Pin the Tail · play', () => { if (G.phase === 'idle' || G.phase === 'final') { start(); } else app.toast('Game on · tap the board', 1200); });
  return { get state() { return { phase: G.phase, round: G.round, scores: G.scores.slice(), total: G.total, bullseye: G.bullseye, last: G.last, drift: [G.dx, G.dy] }; }, screen: sc, group: grp, start, _g: G };
}

/* ------------------------------------------------------------ 3) NEON WALL ------------------------------------------------------------ */
function buildNeonWall(app, sign) {
  const X = 12, Z = -12, WW = 6, HH = 3, BOT = 0.4; const yaw = faceFountain(X, Z);
  const TILES = ['W', 'O', 'R', 'L', 'D', '⭐', 'V', 'R', '🐸', '🚀', '💖', '⚡', 'M', 'A', 'L', 'L', '🌙', '🪐'];
  const COLS = 6, ROWS = 3; const N = { scene: 'none', on: TILES.map((_, i) => i % 3 !== 1), partyT0: 0, acc: 0, draws: 0 };
  const sc = makeScreen(app, { w: WW, h: HH, px: 1024, py: 512, down }); const g = sc.g, PW = sc.pw, PH = sc.ph;
  const BAR = 84, TW = PW / COLS, TH = (PH - BAR) / ROWS;
  const SCENES = [['DISCO', 'disco', '#ff5cf0'], ['LAVA', 'lava', '#ff6a1c'], ['BLACKLIGHT', 'blacklight', '#b08cff'], ['PARTY', 'party', '#ffd23f'], ['OFF', 'none', '#9aa7c7']];
  const BW = PW / SCENES.length;
  const hueOf = (i) => (i * 37 + 190) % 360;
  const CONF = []; for (let i = 0; i < 90; i++) CONF.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, h: 0, s: 0 });
  const tileColor = (i, t) => {
    if (N.scene === 'disco') return 'hsl(' + ((hueOf(i) + t * 120) % 360) + ',100%,62%)';
    if (N.scene === 'lava') { const p = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.8); return 'hsl(' + Math.round(8 + p * 28) + ',100%,' + Math.round(45 + p * 15) + '%)'; }
    if (N.scene === 'blacklight') return 'hsl(' + (268 + (i % 3) * 8) + ',100%,' + (66 + (i % 2) * 8) + '%)';
    if (N.scene === 'party') return 'hsl(' + ((hueOf(i) * 3 + t * 400) % 360) + ',100%,65%)';
    return 'hsl(' + hueOf(i) + ',100%,64%)';
  };
  function draw(t) {
    g.fillStyle = N.scene === 'blacklight' ? '#08031a' : N.scene === 'lava' ? '#190804' : '#06081a'; g.fillRect(0, 0, PW, PH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < TILES.length; i++) {
      const cx = (i % COLS) * TW + TW / 2, cy = Math.floor(i / COLS) * TH + TH / 2; const on = N.on[i]; const col = tileColor(i, t);
      g.strokeStyle = on ? col : 'rgba(255,255,255,0.08)'; g.lineWidth = 3; g.shadowBlur = on ? 16 : 0; g.shadowColor = col; rr(g, cx - TW / 2 + 10, cy - TH / 2 + 10, TW - 20, TH - 20, 16); g.stroke();
      g.font = 'bold 86px ' + FONT; if (on) { g.shadowBlur = 28; g.fillStyle = col; g.fillText(TILES[i], cx, cy + 4); g.shadowBlur = 0; g.globalAlpha = 0.55; g.fillStyle = '#fff'; g.font = 'bold 84px ' + FONT; g.fillText(TILES[i], cx, cy + 4); g.globalAlpha = 1; }
      else { g.shadowBlur = 0; g.globalAlpha = 0.16; g.fillStyle = '#ffffff'; g.fillText(TILES[i], cx, cy + 4); g.globalAlpha = 1; }
    }
    g.shadowBlur = 0; g.fillStyle = '#0c1030'; g.fillRect(0, PH - BAR, PW, BAR); g.fillStyle = '#242c60'; g.fillRect(0, PH - BAR, PW, 2);
    SCENES.forEach((s, i) => { const on = N.scene === s[1] && s[1] !== 'none'; g.fillStyle = on ? s[2] : '#141a44'; rr(g, i * BW + 10, PH - BAR + 12, BW - 20, BAR - 24, 14); g.fill(); g.lineWidth = 2; g.strokeStyle = s[2]; g.stroke(); g.font = 'bold 26px ' + FONT; g.fillStyle = on ? '#0a0c20' : '#eaf3ff'; g.fillText(s[0], i * BW + BW / 2, PH - BAR / 2 + 1); });
    if (N.scene === 'party') { for (const c of CONF) { if (c.y > PH + 20) continue; g.fillStyle = 'hsl(' + c.h + ',100%,60%)'; g.save(); g.translate(c.x, c.y); g.rotate(c.s * 4); g.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r); g.restore(); } }
    sc.dirty(); N.draws++;
  }
  function burst() { for (const c of CONF) { c.x = PW / 2 + rand(-80, 80); c.y = PH * 0.45 + rand(-40, 40); const a = rand(0, Math.PI * 2), v = rand(180, 520); c.vx = Math.cos(a) * v; c.vy = Math.sin(a) * v - 220; c.r = rand(5, 12); c.h = rand(0, 360); c.s = rand(0, 6); } }
  function stepConfetti(dt) { for (const c of CONF) { c.vy += 520 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.995; c.s += dt; } }
  /* the room mood: app.hemi only (no lights added, ever) · base saved once, OFF restores it exactly */
  const hemi = app.hemi; const base = hemi ? { color: hemi.color.clone(), intensity: hemi.intensity } : null; const tgt = new T.Color(); const tmp = new T.Color(); let tgtI = base ? base.intensity : 0; let moodLive = false;
  function setScene(s) {
    if (s === 'party') { burst(); N.partyT0 = app.t; }
    N.scene = s; if (base) moodLive = true; draw(app.t); tubes.material.color.set(SCENES.find(q => q[1] === s)[2]).multiplyScalar(s === 'none' ? 0.55 : 1);
  }
  function down(u, v) {
    const [x, y] = sc.px(u, v);
    if (y >= PH - BAR) { const i = clamp(Math.floor(x / BW), 0, SCENES.length - 1); setScene(SCENES[i][1]); app.toast(SCENES[i][1] === 'none' ? '💡 Neon scene off · room lights restored' : '✨ ' + SCENES[i][0] + ' scene', 1400); return; }
    const i = Math.floor(x / TW) + Math.floor(y / TH) * COLS; if (i < 0 || i >= TILES.length) return; N.on[i] = !N.on[i]; draw(app.t);
  }
  /* the tubes around the wall: 4 thin cylinders merged into ONE mesh, MeshBasicMaterial follows the scene color */
  const tubeGeos = []; const tg = (len, rx, rz, x, y) => { const q = new T.CylinderGeometry(0.035, 0.035, len, 8); q.rotateX(rx); q.rotateZ(rz); q.translate(x, y, 0.02); tubeGeos.push(q); };
  tg(WW + 0.5, 0, Math.PI / 2, 0, BOT + HH + 0.22); tg(WW + 0.5, 0, Math.PI / 2, 0, BOT - 0.22); tg(HH + 0.5, 0, 0, -WW / 2 - 0.25, BOT + HH / 2); tg(HH + 0.5, 0, 0, WW / 2 + 0.25, BOT + HH / 2);
  const tubes = new T.Mesh(mergeGeometries(tubeGeos), new T.MeshBasicMaterial({ color: 0x5a6a7a, toneMapped: false }));
  const grp = new T.Group(); grp.position.set(X, 0, Z); grp.rotation.y = yaw;
  sc.mesh.position.set(0, BOT + HH / 2, 0.06); grp.add(sc.mesh); grp.add(tubes);
  const back = new T.Mesh(new T.BoxGeometry(WW + 0.3, HH + 0.3, 0.12), new T.MeshStandardMaterial({ color: 0x090c22, roughness: 0.5, metalness: 0.4 })); back.position.set(0, BOT + HH / 2, -0.02); grp.add(back);
  sign.position.set(0, BOT + HH + 0.62, 0.02); grp.add(sign);
  app.scene.add(grp); wallBox(app, X, Z, yaw, WW / 2 + 0.3, 0.1);
  draw(0); tubes.material.color.set('#9aa7c7').multiplyScalar(0.55);
  app.onUpdate((dt, t) => {
    const anim = N.scene === 'disco' || N.scene === 'lava' || N.scene === 'party';
    if (anim) { N.acc += dt; if (N.scene === 'party') { stepConfetti(dt); if (t - N.partyT0 > 6) { N.scene = 'none'; moodLive = true; draw(t); tubes.material.color.set('#9aa7c7').multiplyScalar(0.55); } } if (N.acc >= 0.05) { N.acc = 0; draw(t); if (N.scene === 'disco') tubes.material.color.setHSL(((t * 120) % 360) / 360, 1, 0.6); else if (N.scene === 'lava') tubes.material.color.setHSL(0.04, 1, 0.45 + 0.15 * Math.sin(t * 3)); } }
    if (!moodLive || !hemi) return;
    if (N.scene === 'disco') { tgt.setHSL(((t * 120) % 360) / 360, 0.35, 0.72); tgtI = base.intensity; }
    else if (N.scene === 'lava') { tgt.copy(base.color).lerp(tmp.set(0xff7a2a), 0.35); tgtI = base.intensity; }
    else if (N.scene === 'blacklight') { tgt.copy(base.color).lerp(tmp.set(0x7a3dff), 0.4); tgtI = base.intensity * 0.65; }
    else if (N.scene === 'party') { tgt.setHSL(((t * 400) % 360) / 360, 0.3, 0.72); tgtI = base.intensity; }
    else { tgt.copy(base.color); tgtI = base.intensity; }
    const k = Math.min(1, dt * 3); hemi.color.lerp(tgt, k); hemi.intensity += (tgtI - hemi.intensity) * k;
    if (N.scene === 'none' && Math.abs(hemi.intensity - base.intensity) < 0.002 && Math.abs(hemi.color.r - base.color.r) + Math.abs(hemi.color.g - base.color.g) + Math.abs(hemi.color.b - base.color.b) < 0.004) { hemi.color.copy(base.color); hemi.intensity = base.intensity; moodLive = false; }
  });
  const sp = standSpot(X, Z, 2.8);
  app.addPlace({ id: 'neon-wall', name: 'Neon Wall · scenes & tiles', icon: '🌈', x: sp.x, z: sp.z, yaw: sp.yaw, cat: 'Fun', top: true, keys: 'neon wall lights disco lava blacklight party tiles glow switch', say: 'The Neon Wall. Tap tiles, pick a scene. 🌈' });
  app.addInteractable(sp.x, sp.z, 4.5, '🌈 Neon Wall · how it works', (a) => a.toast('🌈 Tap any tile to switch it. The bottom row sets the mood: DISCO, LAVA, BLACKLIGHT, PARTY. OFF restores the room.', 4200));
  return { get state() { return { scene: N.scene, on: N.on.slice(), draws: N.draws, hemi: hemi ? { color: hemi.color.getHexString(), intensity: hemi.intensity } : null, base: base ? { color: base.color.getHexString(), intensity: base.intensity } : null }; }, screen: sc, group: grp, setScene, _n: N };
}

/* ------------------------------------------------------------ 4) ART + DEPTH ------------------------------------------------------------ */
function buildArtAndDepth(app) {
  const S = app.scene; const out = { sculptures: 6, art: 6, posts: 0 };
  /* (a) six kinetic mobiles at radius 34, hung between the aquarium columns: 18 rings in ONE InstancedMesh, cables merged into one mesh */
  { const ANG = [0, 45, 135, 180, 225, 315]; const R = 34; const RINGS = []; const cableGeos = [];
    const palette = [0x38f0ff, 0xff5cf0, 0xffd23f, 0x7cff6b, 0xff8a3d, 0xb08cff];
    ANG.forEach((a, i) => { const rad = a * Math.PI / 180; const x = Math.cos(rad) * R, z = Math.sin(rad) * R, y = 9.5 + (i % 3) * 1.6; const spin = (i % 2 ? 1 : -1) * (0.25 + i * 0.05);
      for (let k = 0; k < 3; k++) RINGS.push({ x, y, z, s: 1.7 - k * 0.5, ax: k * 1.1 + i, ay: i * 0.7, az: k * 0.6, vx: spin * (k === 1 ? 0.6 : 0.25), vy: spin * (1 + k * 0.35), vz: k === 2 ? spin * 0.5 : 0, col: palette[(i + k * 2) % palette.length] });
      const cg = new T.CylinderGeometry(0.015, 0.015, 18 - y, 5); cg.translate(x, y + (18 - y) / 2, z); cableGeos.push(cg); });
    const im = new T.InstancedMesh(new T.TorusGeometry(1, 0.05, 8, 40), new T.MeshBasicMaterial({ toneMapped: false }), RINGS.length); im.userData.noFreeze = true; im.frustumCulled = false;
    const col = new T.Color(); RINGS.forEach((r, i) => { im.setColorAt(i, col.set(r.col)); }); im.instanceColor.needsUpdate = true;
    const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), SC = new T.Vector3();
    app.onUpdate((dt, t) => { for (let i = 0; i < RINGS.length; i++) { const r = RINGS[i]; E.set(r.ax + t * r.vx, r.ay + t * r.vy, r.az + t * r.vz); Q.setFromEuler(E); V.set(r.x, r.y + Math.sin(t * 0.6 + i) * 0.12, r.z); SC.setScalar(r.s); M.compose(V, Q, SC); im.setMatrixAt(i, M); } im.instanceMatrix.needsUpdate = true; });
    S.add(im); const cables = new T.Mesh(mergeGeometries(cableGeos), new T.MeshStandardMaterial({ color: 0x8a94b8, metalness: 0.6, roughness: 0.4 })); S.add(cables); out.rings = im; }
  /* (b) the floor inlay: two bright rings at 10.5 and 21.5 plus four dim step rings between, ONE merged mesh with vertex colors */
  { const geos = []; const col = new T.Color(); const ring = (r, tube, c, bright) => { const q = new T.TorusGeometry(r, tube, 6, 160); q.rotateX(-Math.PI / 2); q.translate(0, 0.03, 0); col.set(c).multiplyScalar(bright); const n = q.attributes.position.count; const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; } q.setAttribute('color', new T.BufferAttribute(arr, 3)); geos.push(q); };
    ring(10.5, 0.07, 0x38f0ff, 1.2); ring(21.5, 0.07, 0xb08cff, 1.2); [12.7, 14.9, 17.1, 19.3].forEach((r, i) => ring(r, 0.03, i % 2 ? 0x7cf8ff : 0xd3b8ff, 0.35));
    const m = new T.Mesh(mergeGeometries(geos), new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); m.renderOrder = 1; S.add(m); out.inlay = m; }
  /* (c) six framed abstracts on 5 m pylons at radius 26 (away from the booths band at +z): pictures on ONE 1024x640 atlas, planes merged into ONE mesh, frames + pylons merged into ONE mesh */
  { const ANG = [20, 160, 200, 250, 290, 340]; const R = 26; const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 640; const ag = atlas.getContext('2d');
    const picGeos = [], frameGeos = []; const fc = new T.Color(); const paintCol = (q, c) => { const n = q.attributes.position.count; const arr = new Float32Array(n * 3); fc.set(c); for (let i = 0; i < n; i++) { arr[i * 3] = fc.r; arr[i * 3 + 1] = fc.g; arr[i * 3 + 2] = fc.b; } q.setAttribute('color', new T.BufferAttribute(arr, 3)); };
    ANG.forEach((a, i) => { const pc = paintAbstract(i + 11); ag.drawImage(pc, (i % 4) * 256, Math.floor(i / 4) * 320, 256, 320);
      const rad = a * Math.PI / 180; const x = Math.cos(rad) * R, z = Math.sin(rad) * R; const yaw = faceFountain(x, z); const M = new T.Matrix4().makeRotationY(yaw); M.setPosition(x, 0, z);
      const pg = new T.PlaneGeometry(1.6, 2.0); const uv = pg.attributes.uv; for (let k = 0; k < uv.count; k++) { uv.setXY(k, ((i % 4) + uv.getX(k)) / 4, 1 - (Math.floor(i / 4) + 1 - uv.getY(k)) / 2); } pg.translate(0, 3.6, 0.07); pg.applyMatrix4(M); picGeos.push(pg);
      const fr = new T.BoxGeometry(1.85, 2.25, 0.08); fr.translate(0, 3.6, 0); paintCol(fr, 0x151a33); fr.applyMatrix4(M); frameGeos.push(fr);
      const py = new T.BoxGeometry(0.26, 5, 0.26); py.translate(0, 2.5, -0.1); paintCol(py, 0x2b3461); py.applyMatrix4(M); frameGeos.push(py);
      const lip = new T.BoxGeometry(1.95, 0.06, 0.3); lip.translate(0, 4.78, 0.08); paintCol(lip, 0xb08cff); lip.applyMatrix4(M); frameGeos.push(lip);
      app.addObstacle(x, z, 0.6); });
    const tex = new T.CanvasTexture(atlas); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const pics = new T.Mesh(mergeGeometries(picGeos), new T.MeshBasicMaterial({ map: tex })); S.add(pics);
    const frames = new T.Mesh(mergeGeometries(frameGeos), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })); S.add(frames); out.pics = pics; }
  /* (d) the mezzanine illusion: a dark balcony band at y 13..15 (radius 37.5), a floor lip, a glowing rail, 90 posts in ONE InstancedMesh */
  { const band = new T.Mesh(new T.CylinderGeometry(37.5, 37.5, 2, 72, 1, true), new T.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.8, metalness: 0.2, side: T.BackSide })); band.position.y = 14; S.add(band);
    const lip = new T.Mesh(new T.TorusGeometry(37.5, 0.18, 6, 96), new T.MeshStandardMaterial({ color: 0x1c2548, roughness: 0.6, metalness: 0.3 })); lip.rotation.x = Math.PI / 2; lip.position.y = 15; S.add(lip);
    const rail = new T.Mesh(new T.TorusGeometry(37.2, 0.045, 6, 128), new T.MeshBasicMaterial({ color: 0x38f0ff, toneMapped: false })); rail.rotation.x = Math.PI / 2; rail.position.y = 16.15; S.add(rail);
    const NP = 90; const posts = new T.InstancedMesh(new T.CylinderGeometry(0.03, 0.03, 1.15, 6), new T.MeshStandardMaterial({ color: 0x9aa7c7, metalness: 0.7, roughness: 0.3 }), NP); const M = new T.Matrix4(); for (let i = 0; i < NP; i++) { const a = i / NP * Math.PI * 2; M.makeTranslation(Math.cos(a) * 37.2, 15.58, Math.sin(a) * 37.2); posts.setMatrixAt(i, M); } posts.instanceMatrix.needsUpdate = true; posts.frustumCulled = false; S.add(posts); out.posts = NP; }
  return out;
}

/* a seeded abstract on a 512x640 canvas: gradients + shapes, no two alike */
function paintAbstract(seed) {
  const R = mulberry(seed * 7919 + 13); const c = document.createElement('canvas'); c.width = 512; c.height = 640; const g = c.getContext('2d');
  const h0 = R() * 360, h1 = (h0 + 120 + R() * 120) % 360, h2 = (h0 + 40) % 360; const hs = (h, s, l, a = 1) => 'hsla(' + Math.round(h) + ',' + s + '%,' + l + '%,' + a + ')';
  const gr = g.createLinearGradient(0, 0, R() * 512, 640); gr.addColorStop(0, hs(h0, 70, 18)); gr.addColorStop(1, hs(h1, 60, 30)); g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
  const style = Math.floor(R() * 4);
  if (style === 0) { for (let i = 0; i < 14; i++) { g.globalAlpha = 0.25 + R() * 0.5; g.fillStyle = hs((h0 + R() * 160) % 360, 85, 55 + R() * 25); g.beginPath(); g.ellipse(R() * 512, R() * 640, 40 + R() * 120, 40 + R() * 160, R() * 3, 0, 7); g.fill(); } }
  else if (style === 1) { for (let i = 0; i < 9; i++) { g.globalAlpha = 0.5 + R() * 0.5; g.fillStyle = hs((h2 + i * 20) % 360, 80, 50 + R() * 30); const w = 30 + R() * 120; g.fillRect(R() * 500, 0, w, 640); } g.globalCompositeOperation = 'overlay'; for (let i = 0; i < 4; i++) { g.fillStyle = hs(h1, 60, 60); g.fillRect(0, R() * 600, 512, 20 + R() * 60); } g.globalCompositeOperation = 'source-over'; }
  else if (style === 2) { for (let i = 0; i < 10; i++) { g.globalAlpha = 0.35 + R() * 0.5; g.strokeStyle = hs((h0 + i * 30) % 360, 90, 65); g.lineWidth = 6 + R() * 26; g.beginPath(); g.arc(256 + (R() - 0.5) * 200, 320 + (R() - 0.5) * 300, 40 + i * 28, R() * 6, R() * 6 + 1.5 + R() * 4); g.stroke(); } }
  else { for (let i = 0; i < 7; i++) { g.globalAlpha = 0.4 + R() * 0.5; g.fillStyle = hs((h1 + i * 25) % 360, 85, 55); g.beginPath(); const y0 = R() * 640; g.moveTo(0, y0); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + Math.sin(x / 60 + i) * (30 + R() * 50)); g.lineTo(512, 640); g.lineTo(0, 640); g.closePath(); g.fill(); } }
  g.globalAlpha = 1; g.globalCompositeOperation = 'screen'; const sp = g.createRadialGradient(R() * 512, R() * 640, 10, 256, 320, 500); sp.addColorStop(0, hs(h2, 90, 70, 0.55)); sp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sp; g.fillRect(0, 0, 512, 640); g.globalCompositeOperation = 'source-over';
  return c;
}
