/* ============================================================
   THE ARCADE RING · Oct 22 2026 · VR-native games around the World Fountain
   Air hockey (0, 15) and a standing tic-tac-toe board (14, 6). Both are driven by the one pointer system (wvm-screen.js):
   the VR laser (hover every frame, trigger = down/up) and the desktop mouse / finger. No lights, no per-frame allocations,
   canvases redrawn only when something changed, everything that moves is flagged noFreeze.
   Debug: window.WVM_ARCADE = { hockey, ttt } (state getters + the same actions the buttons fire).
   ============================================================ */
import * as THREE from 'three';
import { makeScreen, screenOn } from '/js/wvm-screen.js';
import { clamp, pick } from '/js/wvm-engine.js?v=59';
const T = THREE;

export function installArcade(app) {
  const hockey = buildAirHockey(app);
  const ttt = buildTicTacToe(app);
  window.WVM_ARCADE = { hockey, ttt };
  return window.WVM_ARCADE;
}

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const std = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o));
const glow = (color) => new T.MeshBasicMaterial({ color, toneMapped: false });

/* =================================================================== AIR HOCKEY =================================================================== */
function buildAirHockey(app) {
  const S = app.scene; const CX = 0, CZ = 15, TY = 0.85; /* table center, top height */
  const HL = 1.1, HW = 0.6; /* half length (x, east-west) and half width (z) of the playing surface */
  const PR = 0.045, PAD = 0.09, GOAL = 0.2; /* puck radius, paddle radius, goal half width */
  const MAXV = 6.5, FRICTION = 0.25, E = 0.92;

  /* ---- the table: base, rails with the two goal gaps, the glowing goal mouths ---- */
  const base = new T.Mesh(new T.BoxGeometry(2.36, 0.72, 1.36), std(0x1a2440, { roughness: 0.5 })); base.position.set(CX, 0.36, CZ); S.add(base);
  const railM = std(0x2b3760, { roughness: 0.35, metalness: 0.3 }); const RH = 0.07, RT = 0.08;
  const rail = (w, d, x, z) => { const m = new T.Mesh(new T.BoxGeometry(w, RH, d), railM); m.position.set(CX + x, TY + RH / 2 - 0.005, CZ + z); S.add(m); return m; };
  rail(2.2 + RT * 2, RT, 0, -(HW + RT / 2)); rail(2.2 + RT * 2, RT, 0, HW + RT / 2);
  const endSeg = (HW - GOAL); const endRails = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) endRails.push(rail(RT, endSeg, sx * (HL + RT / 2), sz * (GOAL + endSeg / 2)));
  const goalM = [glow(0xff3b6b), glow(0x38f0ff)]; const goalMouth = [];
  for (const sx of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(RT, 0.02, GOAL * 2), goalM[sx < 0 ? 0 : 1]); m.position.set(CX + sx * (HL + RT / 2), TY + 0.005, CZ); S.add(m); goalMouth.push(m); }
  app.addBox(CX, CZ, 1.35, 1.3);

  /* ---- the top: a canvas plane (markings drawn once) that is also the pointer target ---- */
  const top = makeScreen(app, { w: 2.2, h: 1.2, px: 1024, hover: (u, v, info) => onHover(u, v, info), down: (u, v, info) => onHover(u, v, info), leave: () => { /* keep the paddle where it is */ } });
  top.mesh.rotation.x = -Math.PI / 2; top.mesh.position.set(CX, TY, CZ); S.add(top.mesh);
  { const g = top.g, W = top.pw, H = top.ph; g.fillStyle = '#0d1630'; g.fillRect(0, 0, W, H); const grad = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6); grad.addColorStop(0, 'rgba(56,240,255,0.10)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, H * 0.22, 0, Math.PI * 2); g.stroke();
    const px = (m) => m * W / 2.2; for (const sx of [0, W]) { g.beginPath(); g.arc(sx, H / 2, px(0.36), 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(sx, H / 2, px(0.75), 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,59,107,0.45)'; g.fillRect(0, H / 2 - px(GOAL), 10, px(GOAL * 2)); g.fillStyle = 'rgba(56,240,255,0.45)'; g.fillRect(W - 10, H / 2 - px(GOAL), 10, px(GOAL * 2));
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.font = '900 54px Poppins, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WEST', W * 0.25, H * 0.5); g.fillText('EAST', W * 0.75, H * 0.5); top.dirty(); }

  /* ---- puck and paddles (noFreeze: the engine freezes static matrices) ---- */
  const puck = new T.Mesh(new T.CylinderGeometry(PR, PR, 0.022, 28), glow(0xff5a3b)); puck.position.set(CX, TY + 0.012, CZ); puck.userData.noFreeze = true; S.add(puck);
  const mkPaddle = (color) => { const g = new T.Group(); g.add(new T.Mesh(new T.CylinderGeometry(PAD, PAD, 0.03, 32), glow(color))); const knob = new T.Mesh(new T.CylinderGeometry(0.035, 0.045, 0.07, 20), std(color, { emissive: color, emissiveIntensity: 0.5 })); knob.position.y = 0.05; g.add(knob); g.position.set(CX, TY + 0.016, CZ); g.userData.noFreeze = true; S.add(g); return g; };
  const paddleMesh = [mkPaddle(0xff3b6b), mkPaddle(0x38f0ff)]; /* 0 = west, 1 = east */

  /* ---- state ---- */
  const P = [{ x: -HL * 0.75, z: 0, tx: -HL * 0.75, tz: 0, vx: 0, vz: 0, ctl: 'none', speed: 7, seen: 0 }, { x: HL * 0.75, z: 0, tx: HL * 0.75, tz: 0, vx: 0, vz: 0, ctl: 'none', speed: 7, seen: 0 }];
  const K = { x: 0, z: 0, vx: 0, vz: 0, live: false, serveAt: 0, serveDir: 1 }; /* the puck */
  const G = { mode: '1p', level: 'normal', human: -1, score: [0, 0], over: false, status: '', flash: [0, 0], aiWob: 0, aiWobT: 0, stall: 0, retreat: 0, dead: 0, pinN: 0 };
  const LEVELS = { easy: { speed: 1.3, react: 0.55, wobble: 0.3, aim: 0 }, normal: { speed: 2.6, react: 0.25, wobble: 0.1, aim: 0.4 }, hard: { speed: 4.6, react: 0.08, wobble: 0, aim: 1 } };

  /* ---- scoreboard (redrawn only on change) ---- */
  const board = makeScreen(app, { w: 1.5, h: 0.5, px: 600, doubleSide: true }); board.mesh.position.set(CX, 2.05, CZ); S.add(board.mesh); board.enabled = false;
  const modeLabel = () => G.mode === '1p' ? ('1 player · ' + G.level.toUpperCase() + (G.human < 0 ? ' · point at the table to pick your side' : ' · you are ' + (G.human ? 'EAST' : 'WEST'))) : G.mode === '2hands' ? '2 hands · left = WEST · right = EAST' : '2 players · mouse = EAST · keys (WASD / IJKL) = WEST';
  const drawBoard = () => { const g = board.g, W = board.pw, H = board.ph; g.clearRect(0, 0, W, H); g.fillStyle = '#0b1230'; rr(g, 0, 0, W, H, 26); g.fill(); g.strokeStyle = '#38f0ff'; g.lineWidth = 5; rr(g, 3, 3, W - 6, H - 6, 24); g.stroke(); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 86px Poppins, Arial'; g.fillStyle = '#ff5a8a'; g.fillText(String(G.score[0]), W * 0.3, H * 0.42); g.fillStyle = '#38f0ff'; g.fillText(String(G.score[1]), W * 0.7, H * 0.42); g.fillStyle = '#fff'; g.font = '700 40px Poppins, Arial'; g.fillText('·', W / 2, H * 0.42);
    g.font = '800 26px Poppins, Arial'; g.fillStyle = '#ff9ab8'; g.fillText('WEST', W * 0.3, H * 0.12); g.fillStyle = '#9af5ff'; g.fillText('EAST', W * 0.7, H * 0.12);
    g.font = '700 22px Poppins, Arial'; g.fillStyle = G.over ? '#ffd23f' : '#cfd8ff'; g.fillText(G.status || modeLabel(), W / 2, H * 0.78, W - 30); if (G.status) { g.font = '600 16px Poppins, Arial'; g.fillStyle = '#8fa0d0'; g.fillText(modeLabel(), W / 2, H * 0.93, W - 30); } board.dirty(); };

  /* ---- mode panel at the near (south) side, with tappable buttons ---- */
  const BTN = [['1P Easy', () => setMode('1p', 'easy')], ['1P Normal', () => setMode('1p', 'normal')], ['1P Hard', () => setMode('1p', 'hard')], ['2 hands (VR)', () => setMode('2hands')], ['2 players (keys)', () => setMode('2keys')], ['New game', () => newGame()]];
  let hotBtn = -1; const btnAt = (u, v) => { const col = Math.floor(u * 3), row = v > 0.5 ? 0 : 1; const vv = row ? (1 - v) * 2 - 1 : (1 - v) * 2; /* 0..1 inside the row */ if (vv < 0.1 || vv > 0.9) return -1; return clamp(row * 3 + col, 0, 5); };
  const panel = makeScreen(app, { w: 1.7, h: 0.5, px: 816, hover: (u, v) => { const b = btnAt(u, v); if (b !== hotBtn) { hotBtn = b; drawPanel(); } }, leave: () => { if (hotBtn !== -1) { hotBtn = -1; drawPanel(); } }, down: (u, v) => { const b = btnAt(u, v); if (b >= 0) { BTN[b][1](); try { app.buzz && app.buzz(30); } catch (e) { } } } });
  panel.mesh.position.set(CX, 0.62, CZ + HW + 0.42); panel.mesh.rotation.x = -0.35; S.add(panel.mesh);
  const activeBtn = () => G.mode === '1p' ? ['easy', 'normal', 'hard'].indexOf(G.level) : G.mode === '2hands' ? 3 : 4;
  const drawPanel = () => { const g = panel.g, W = panel.pw, H = panel.ph; g.clearRect(0, 0, W, H); g.fillStyle = '#0b1230'; rr(g, 0, 0, W, H, 22); g.fill(); const act = activeBtn(); const bw = W / 3, bh = H / 2; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 30px Poppins, Arial';
    BTN.forEach(([label], i) => { const x = (i % 3) * bw, y = Math.floor(i / 3) * bh; const on = i === act, hot = i === hotBtn; g.fillStyle = on ? '#38f0ff' : hot ? '#2a3d7a' : '#182452'; rr(g, x + 10, y + 12, bw - 20, bh - 24, 18); g.fill(); if (hot && !on) { g.strokeStyle = '#38f0ff'; g.lineWidth = 4; g.stroke(); } g.fillStyle = on ? '#07122e' : '#fff'; g.fillText(label, x + bw / 2, y + bh / 2, bw - 36); }); panel.dirty(); };

  /* ---- game flow ---- */
  const setStatus = (s, over) => { G.status = s || ''; if (over !== undefined) G.over = over; drawBoard(); };
  const resetPuck = (dir) => { K.x = 0; K.z = 0; K.vx = 0; K.vz = 0; K.live = false; K.serveDir = dir; K.serveAt = app.t + 1.1; };
  const newGame = () => { G.score = [0, 0]; G.over = false; G.human = -1; G.status = ''; P[0].ctl = P[1].ctl = 'none'; for (const p of P) { p.vx = p.vz = 0; } P[0].x = P[0].tx = -HL * 0.75; P[1].x = P[1].tx = HL * 0.75; P[0].z = P[0].tz = P[1].z = P[1].tz = 0; resetPuck(Math.random() < 0.5 ? -1 : 1); if (G.mode === '1p') { K.live = false; K.serveAt = 1e12; /* waits for the human to pick a side */ } drawBoard(); drawPanel(); };
  const setMode = (mode, level) => { G.mode = mode; if (level) G.level = level; newGame(); app.toast(mode === '1p' ? 'Air hockey vs the computer (' + G.level + '). Point at the table: that half is yours.' : mode === '2hands' ? 'Two hands: the left controller is the WEST paddle, the right one EAST.' : 'Two players: the mouse drives the EAST paddle, WASD or IJKL the WEST one.', 3200); };
  const assignHuman = (side) => { if (G.human >= 0) return; G.human = side; P[side].ctl = 'pointer'; P[1 - side].ctl = 'ai'; resetPuck(side ? 1 : -1); drawBoard(); };
  const scored = (endSide) => { /* the puck went into the goal on endSide (0 = west goal, 1 = east goal): the other side scores */ const who = 1 - endSide; G.score[who]++; G.flash[endSide] = app.t + 0.7; goalM[endSide].color.setHex(0xffffff);
    if (G.score[who] >= 7) { G.over = true; const human = G.mode === '1p' ? (who === G.human) : true; setStatus((who ? 'EAST' : 'WEST') + ' WINS ' + G.score[who] + '–' + G.score[1 - who] + (G.mode === '1p' ? (human ? ' · you beat the computer!' : ' · the computer takes it') : ''), true); if (human) app.celebrate('🏒'); K.live = false; K.serveAt = 1e12; app.toast('Game over. Tap New game on the panel for another.', 3000); return; }
    setStatus((who ? 'EAST' : 'WEST') + ' scores! ' + G.score[0] + ' – ' + G.score[1]); resetPuck(endSide ? 1 : -1); };

  /* ---- pointer input (hover = the paddle follows the pointer) ---- */
  const toTable = (u, v) => [(u - 0.5) * 2.2, -(v - 0.5) * 1.2]; /* texture coords -> table-local x, z (v = 1 is the north edge) */
  const clampSide = (p, side) => { p.tx = side ? clamp(p.tx, PAD + 0.01, HL - PAD) : clamp(p.tx, -HL + PAD, -PAD - 0.01); p.tz = clamp(p.tz, -HW + PAD, HW - PAD); };
  function onHover(u, v, info) { if (G.mode === '2hands' && app.renderer.xr.isPresenting) return; const [x, z] = toTable(u, v); let side; if (G.mode === '1p') { if (G.human < 0) assignHuman(x < 0 ? 0 : 1); side = G.human; } else if (G.mode === '2keys') side = 1; else side = x < 0 ? 0 : 1; const p = P[side]; p.tx = x; p.tz = z; p.seen = app.t; clampSide(p, side); }

  /* ---- physics ---- */
  const keyAxis = () => { const k = app.keys || {}; let dx = 0, dz = 0; if (k.KeyA || k.KeyJ) dx -= 1; if (k.KeyD || k.KeyL) dx += 1; if (k.KeyW || k.KeyI) dz -= 1; if (k.KeyS || k.KeyK) dz += 1; if (G.mode === '2keys') { k.KeyW = k.KeyA = k.KeyS = k.KeyD = false; } return [dx, dz]; };
  const rayToTable = (hd) => { const api = app._xrApi; if (!api || !api.ray) return null; const r = api.ray(hd); if (!r) return null; const d = r.direction, o = r.origin; if (d.y > -0.02) return null; const t = (TY - o.y) / d.y; if (t < 0 || t > 6) return null; const x = o.x + d.x * t - CX, z = o.z + d.z * t - CZ; if (Math.abs(x) > HL + 0.5 || Math.abs(z) > HW + 0.5) return null; return [x, z]; };
  const aiThink = (p, side, dt) => { const L = LEVELS[G.level]; const dir = side ? 1 : -1; /* dir: the way from the center toward this paddle's own goal */ const home = dir * HL * 0.72;
    if (app.t > G.aiWobT) { G.aiWobT = app.t + 0.7; G.aiWob = (Math.random() * 2 - 1) * L.wobble; }
    const incoming = (K.vx * dir) > 0.05 || (K.x * dir) > 0; let tx = home, tz = K.z * 0.4 + G.aiWob;
    /* a puck that stalls in my half (pinned against a rail, or resting): back off for a moment so it can be struck again */ const sp = Math.hypot(K.vx, K.vz); if (K.live && (K.x * dir) > 0 && sp < 0.25) G.stall += dt; else G.stall = 0; if (G.stall > 0.9 || G.pinN > 24) { G.retreat = app.t + 0.7; G.stall = 0; G.pinN = 0; } if (G.pinN > 0) G.pinN -= 0.5;
    if (app.t < G.retreat) { /* back straight away from the puck (never through it: that was an own goal) */ let ax = p.x - K.x, az = p.z - K.z; const an = Math.hypot(ax, az) || 1; tx = p.x + ax / an * 0.5; tz = p.z + az / an * 0.5; } else if (K.live && incoming) { /* predict where the puck crosses the paddle's x */ const dxp = p.x - K.x; const tt = Math.abs(K.vx) > 0.05 ? clamp(dxp / K.vx, 0, 1.5) : 0; let pz = K.z + K.vz * tt; while (Math.abs(pz) > HW - PR) pz = pz > 0 ? 2 * (HW - PR) - pz : -2 * (HW - PR) - pz; tz = pz + G.aiWob;
      const mine = (K.x * dir) > 0; if (mine) { /* the puck is in my half: go hit it, Hard aims it at the far goal */ if (L.aim >= 1 && Math.hypot(K.vx, K.vz) < 2.2) { /* Hard: get on the far side of the puck from the opponent's goal, then swing through it at the goal */ const gx = -dir * HL; let nx = K.x - gx, nz = K.z; const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n; const behind = (p.x - K.x) * nx + (p.z - K.z) * nz > (PAD + PR) * 0.6; if (behind) { tx = K.x - nx * 0.35; tz = K.z - nz * 0.35; } else { tx = K.x + nx * (PAD + PR) * 1.3; tz = K.z + nz * (PAD + PR) * 1.3 + (nz === 0 ? 0.001 : 0); } } else if ((K.x - p.x) * dir > 0.02) { /* the puck is between me and my goal: go around it, never through it */ tx = K.x + dir * 0.03; tz = K.z + (K.z > p.z ? -1 : 1) * (PAD + PR) * 1.4; } else { tx = K.x + dir * 0.03; tz = K.z + G.aiWob; } } else tx = home; }
    p.tx = tx; p.tz = tz; clampSide(p, side); p.speed = L.speed; p.react = L.react; };
  const movePaddle = (p, dt) => { const sp = p.speed || 7; let dx = p.tx - p.x, dz = p.tz - p.z; const d = Math.hypot(dx, dz); const maxStep = sp * dt; if (p.ctl === 'ai' && p.react) { /* lag: the computer eases toward its target */ const k = 1 - Math.pow(0.001, dt / Math.max(0.05, p.react * 2)); dx *= k; dz *= k; } if (Math.hypot(dx, dz) > maxStep) { const s = maxStep / Math.hypot(dx, dz); dx *= s; dz *= s; } p.px = p.x; p.pz = p.z; p.x += dx; p.z += dz; const nvx = dx / dt, nvz = dz / dt; p.vx = p.vx * 0.5 + nvx * 0.5; p.vz = p.vz * 0.5 + nvz * 0.5; };
  const collidePaddle = (p) => { let nx = K.x - p.x, nz = K.z - p.z; const d = Math.hypot(nx, nz); const R = PAD + PR; if (d >= R) return false; if (d < 1e-5) { nx = 1; nz = 0; } else { nx /= d; nz /= d; } /* push out */ K.x = p.x + nx * (R + 0.002); K.z = p.z + nz * (R + 0.002); const rvx = K.vx - p.vx, rvz = K.vz - p.vz; const vn = rvx * nx + rvz * nz; if (vn < 0) { K.vx -= (1 + E) * vn * nx; K.vz -= (1 + E) * vn * nz; } /* the paddle always imparts at least its own motion along the normal */ const pn = p.vx * nx + p.vz * nz; if (pn > 0) { const kn = K.vx * nx + K.vz * nz; if (kn < pn) { K.vx += (pn - kn) * nx; K.vz += (pn - kn) * nz; } } settle(p); try { app.buzz && app.buzz(12); } catch (e) { } return true; };
  /* a paddle may not push the puck through a rail: slide it along the rail instead, and pop it out of a corner it is pinned in */
  const settle = (p) => { const R = PAD + PR + 0.002; let hitX = false, hitZ = false; if (K.z > HW - PR) { K.z = HW - PR; hitZ = true; } else if (K.z < -HW + PR) { K.z = -HW + PR; hitZ = true; } const inMouth = Math.abs(K.z) < GOAL - PR * 0.3; if (!inMouth) { if (K.x > HL - PR) { K.x = HL - PR; hitX = true; } else if (K.x < -HL + PR) { K.x = -HL + PR; hitX = true; } } if (!hitX && !hitZ) return;
    if (hitZ && !hitX) { const dz = K.z - p.z, d2 = R * R - dz * dz; if (d2 > 0) { const dx = Math.sqrt(d2); K.x = p.x + (K.x >= p.x ? dx : -dx); } } else if (hitX && !hitZ) { const dx = K.x - p.x, d2 = R * R - dx * dx; if (d2 > 0) { const dz = Math.sqrt(d2); K.z = p.z + (K.z >= p.z ? dz : -dz); } }
    K.z = clamp(K.z, -HW + PR, HW - PR); if (!inMouth) K.x = clamp(K.x, -HL + PR, HL - PR); if (Math.hypot(K.x - p.x, K.z - p.z) < R - 0.004) { /* pinned: pop toward the middle of the table, and the computer lets go (see aiThink) */ K.vx = -Math.sign(K.x || 1) * 2.2; K.vz = -Math.sign(K.z || 1) * 2.2; G.pinN += 2; } else G.pinN += 0.25; };
  const stepPuck = (dt) => { /* one sub step */ K.x += K.vx * dt; K.z += K.vz * dt; if (K.z > HW - PR) { K.z = HW - PR; K.vz = -Math.abs(K.vz) * 0.95; } else if (K.z < -HW + PR) { K.z = -HW + PR; K.vz = Math.abs(K.vz) * 0.95; }
    if (K.x > HL - PR) { if (Math.abs(K.z) < GOAL - PR * 0.3) { if (K.x > HL + PR * 0.5) { scored(1); return; } } else { K.x = HL - PR; K.vx = -Math.abs(K.vx) * 0.95; } } else if (K.x < -HL + PR) { if (Math.abs(K.z) < GOAL - PR * 0.3) { if (K.x < -HL - PR * 0.5) { scored(0); return; } } else { K.x = -HL + PR; K.vx = Math.abs(K.vx) * 0.95; } } };

  const update = app.onUpdate((dt, t) => {
    if (!dt) return; const presenting = !!(app.renderer.xr && app.renderer.xr.isPresenting);
    /* inputs */ if (G.mode === '2hands' && presenting) { for (let s = 0; s < 2; s++) { const h = rayToTable(s ? 'right' : 'left'); if (h) { P[s].tx = h[0]; P[s].tz = h[1]; P[s].seen = t; clampSide(P[s], s); } } }
    if (G.mode === '2keys') { const [dx, dz] = keyAxis(); if (dx || dz) { const p = P[0]; p.tx = p.x + dx * 3 * dt; p.tz = p.z + dz * 3 * dt; clampSide(p, 0); } }
    if (G.mode === '1p' && G.human >= 0 && !G.over) aiThink(P[1 - G.human], 1 - G.human, dt);
    for (let s = 0; s < 2; s++) { const p = P[s]; p.speed = p.ctl === 'ai' ? p.speed : 7; movePaddle(p, dt); }
    /* serve */ if (!K.live && !G.over && K.serveAt < 1e11 && t < K.serveAt - 1.5) K.serveAt = t + 1.1; /* the clock went backwards (a test harness, a resumed tab): re-arm */ if (!K.live && !G.over && t >= K.serveAt) { K.live = true; K.vx = K.serveDir * 1.6; K.vz = (Math.random() * 2 - 1) * 0.6; }
    /* puck */ if (K.live) { const sp = Math.hypot(K.vx, K.vz); if (sp > MAXV) { K.vx *= MAXV / sp; K.vz *= MAXV / sp; } const fr = Math.exp(-FRICTION * dt); K.vx *= fr; K.vz *= fr; const n = clamp(Math.ceil(Math.max(sp, 7) * dt / (PR * 0.8)), 1, 14); const sdt = dt / n;
      for (let i = 0; i < n && K.live; i++) { stepPuck(sdt); if (!K.live) break; const f = (i + 1) / n; for (let s = 0; s < 2; s++) { const p = P[s]; if (p.ctl === 'none' && G.mode === '1p') continue; /* interpolate the paddle along its frame move so a fast swing never jumps over the puck */ const sx = p.x, sz = p.z; p.x = p.px + (p.x - p.px) * f; p.z = p.pz + (p.z - p.pz) * f; collidePaddle(p); p.x = sx; p.z = sz; } const s2 = Math.hypot(K.vx, K.vz); if (s2 > MAXV) { K.vx *= MAXV / s2; K.vz *= MAXV / s2; } }
      /* a paddle resting on the puck pushes it along instead of swallowing it */ if (K.live) for (let s = 0; s < 2; s++) collidePaddle(P[s]);
      if (K.live) { const s3 = Math.hypot(K.vx, K.vz); if (s3 > MAXV) { K.vx *= MAXV / s3; K.vz *= MAXV / s3; } if (s3 < 0.03) { K.vx = K.vz = 0; } if (s3 < 0.05) { G.dead += dt; if (G.dead > 5) { G.dead = 0; resetPuck(Math.random() < 0.5 ? -1 : 1); app.toast('Stalled puck. New serve.', 1800); } } else G.dead = 0; } }
    /* visuals */ puck.position.set(CX + K.x, TY + 0.012 + (K.live ? 0 : Math.sin(t * 4) * 0.004 + 0.004), CZ + K.z); puck.rotation.y = t * 1.5;
    for (let s = 0; s < 2; s++) { paddleMesh[s].position.set(CX + P[s].x, TY + 0.016, CZ + P[s].z); const live = !(G.mode === '1p' && G.human < 0); paddleMesh[s].scale.setScalar(live ? 1 : 0.6); }
    for (let s = 0; s < 2; s++) if (G.flash[s] && t > G.flash[s]) { G.flash[s] = 0; goalM[s].color.setHex(s ? 0x38f0ff : 0xff3b6b); }
  });

  /* ---- place, action button, first draw ---- */
  app.addPlace({ id: 'air-hockey', name: '🏒 Air Hockey · the Arcade Ring', icon: '🏒', x: CX, z: CZ + 4, look: [CX, CZ], cat: 'Fun', top: true, keys: 'air hockey arcade game puck table', say: 'Air hockey. Point at the table and the paddle follows you.' });
  app.addInteractable(CX, CZ + 2.6, 3.2, '🏒 Play air hockey', () => { newGame(); app.toast(G.mode === '1p' ? 'Point at the table: the half you point at is yours. First to 7.' : 'New game. First to 7.', 3200); });
  drawBoard(); drawPanel(); newGame();

  return { state: () => ({ mode: G.mode, level: G.level, human: G.human, score: G.score.slice(), over: G.over, status: G.status, puck: { x: +K.x.toFixed(3), z: +K.z.toFixed(3), vx: +K.vx.toFixed(2), vz: +K.vz.toFixed(2), live: K.live }, paddles: P.map((p) => ({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), ctl: p.ctl })) }), setMode, newGame, serveNow: () => { K.serveAt = 0; }, tick: (dt = 1 / 72, n = 1) => { for (let i = 0; i < n; i++) { app.t += dt; update(dt, app.t); } }, pointAt: (u, v) => onHover(u, v, { hd: 'debug' }), mesh: top.mesh, panel: panel.mesh, _K: K, _P: P, _G: G };
}

/* =================================================================== TIC-TAC-TOE =================================================================== */
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winLine = (b, p) => LINES.find((l) => l.every((i) => b[i] === p)) || null;
const freeCells = (b) => b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
/* the three computers. 'me' moves now, 'you' is the other mark. */
export function tttMove(b, level, me, you) {
  const free = freeCells(b); if (!free.length) return -1;
  if (level === 'easy') return pick(free);
  const winAt = (p) => free.find((i) => { b[i] = p; const w = !!winLine(b, p); b[i] = null; return w; });
  if (level === 'normal') { const w = winAt(me); if (w !== undefined) return w; const blk = winAt(you); if (blk !== undefined && Math.random() < 0.6) return blk; return pick(free); }
  /* hard: minimax, unbeatable */ let best = -1, bestV = -Infinity; const order = free.slice().sort(() => Math.random() - 0.5);
  for (const i of order) { b[i] = me; const v = -negamax(b, you, me, 1); b[i] = null; if (v > bestV) { bestV = v; best = i; } } return best;
}
function negamax(b, me, you, depth) { if (winLine(b, you)) return -10 + depth; const free = freeCells(b); if (!free.length) return 0; let best = -Infinity; for (const i of free) { b[i] = me; const v = -negamax(b, you, me, depth + 1); b[i] = null; if (v > best) best = v; } return best; }

function buildTicTacToe(app) {
  const S = app.scene; const BX = 14, BZ = 6, BY = 1.4, SIZE = 1.5; const yaw = Math.atan2(0 - BX, 0 - BZ); /* the plane's +z normal points at the fountain */
  const B = { b: Array(9).fill(null), mode: '1p', level: 'normal', turn: 'X', over: false, line: null, msg: '', hot: -1, hotBtn: -1, thinking: false, token: 0, score: { X: 0, O: 0, D: 0 } };
  const HUMAN = 'X', CPU = 'O';
  const PX = 768, TOP = 90, GRID = 530, BTNY = PX - 112; const cellPx = GRID / 3;
  const GX = (PX - GRID) / 2; /* the grid is centered: its left edge */
  const cellAt = (u, v) => { const x = u * PX, y = (1 - v) * PX; if (y < TOP || y > TOP + GRID || x < GX || x > GX + GRID) return -1; const c = Math.floor((x - GX) / cellPx), r = Math.floor((y - TOP) / cellPx); return clamp(r * 3 + c, 0, 8); };
  const BTN = [['Easy', () => setMode('1p', 'easy')], ['Normal', () => setMode('1p', 'normal')], ['Hard', () => setMode('1p', 'hard')], ['2 players', () => setMode('2p')], ['New game', () => newGame(true)]];
  const btnAt = (u, v) => { const x = u * PX, y = (1 - v) * PX; if (y < BTNY + 8 || y > PX - 16) return -1; return clamp(Math.floor(x / (PX / 5)), 0, 4); };
  const sc = makeScreen(app, { w: SIZE, h: SIZE, px: PX, hover: (u, v) => { const c = cellAt(u, v), b = btnAt(u, v); if (c !== B.hot || b !== B.hotBtn) { B.hot = c; B.hotBtn = b; draw(); } }, leave: () => { if (B.hot !== -1 || B.hotBtn !== -1) { B.hot = -1; B.hotBtn = -1; draw(); } }, down: (u, v) => { const b = btnAt(u, v); if (b >= 0) { BTN[b][1](); try { app.buzz && app.buzz(30); } catch (e) { } return; } const c = cellAt(u, v); if (c >= 0) tap(c); } });
  sc.mesh.position.set(BX, BY, BZ); sc.mesh.rotation.y = yaw; S.add(sc.mesh);
  /* the stand: a frame behind the screen, a post, a foot (merged where easy: one material) */
  const frameM = std(0x1c2650, { roughness: 0.5, metalness: 0.2 }); const frame = new T.Mesh(new T.BoxGeometry(SIZE + 0.14, SIZE + 0.14, 0.08), frameM); frame.position.set(BX - Math.sin(yaw) * 0.045, BY, BZ - Math.cos(yaw) * 0.045); frame.rotation.y = yaw; S.add(frame);
  const post = new T.Mesh(new T.BoxGeometry(0.14, BY - SIZE / 2 + 0.02, 0.14), frameM); post.position.set(BX - Math.sin(yaw) * 0.045, (BY - SIZE / 2) / 2, BZ - Math.cos(yaw) * 0.045); S.add(post);
  const foot = new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 0.08, 24), frameM); foot.position.set(BX, 0.04, BZ); S.add(foot);
  app.addObstacle(BX, BZ, 0.95);

  const draw = () => { const g = sc.g, W = PX; g.clearRect(0, 0, W, W); g.fillStyle = '#0b1230'; rr(g, 0, 0, W, W, 28); g.fill(); g.textAlign = 'center'; g.textBaseline = 'middle';
    /* title strip: scores + status */ g.font = '800 26px Poppins, Arial'; g.fillStyle = '#ff6b9a'; g.textAlign = 'left'; g.fillText('❌ ' + B.score.X, 22, 30); g.fillStyle = '#38f0ff'; g.textAlign = 'right'; g.fillText(B.score.O + ' ⭕', W - 22, 30); g.textAlign = 'center'; g.fillStyle = '#8fa0d0'; g.font = '700 20px Poppins, Arial'; g.fillText('draws ' + B.score.D, W / 2, 30);
    const status = B.msg || (B.thinking ? 'thinking…' : B.mode === '1p' ? (B.turn === HUMAN ? 'Your move · you are ❌' : 'computer…') : ('Player ' + B.turn + ' to move'));
    g.font = '800 30px Poppins, Arial'; g.fillStyle = B.over ? '#ffd23f' : '#fff'; g.fillText(status, W / 2, 68, W - 40);
    /* grid */ const x0 = (W - GRID) / 2, y0 = TOP; for (let i = 0; i < 9; i++) { const c = i % 3, r = Math.floor(i / 3); const x = x0 + c * cellPx, y = y0 + r * cellPx; const inLine = B.line && B.line.includes(i); g.fillStyle = inLine ? 'rgba(255,210,63,0.35)' : (B.hot === i && !B.b[i] && !B.over && !B.thinking) ? 'rgba(56,240,255,0.22)' : 'rgba(255,255,255,0.06)'; rr(g, x + 7, y + 7, cellPx - 14, cellPx - 14, 18); g.fill(); if (B.b[i]) { g.font = '900 120px Poppins, Arial'; g.fillStyle = B.b[i] === 'X' ? '#ff6b9a' : '#38f0ff'; g.fillText(B.b[i], x + cellPx / 2, y + cellPx / 2 + 6); } }
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 6; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x0 + i * cellPx, y0 + 6); g.lineTo(x0 + i * cellPx, y0 + GRID - 6); g.stroke(); g.beginPath(); g.moveTo(x0 + 6, y0 + i * cellPx); g.lineTo(x0 + GRID - 6, y0 + i * cellPx); g.stroke(); }
    /* buttons */ g.font = '700 18px Poppins, Arial'; g.fillStyle = '#8fa0d0'; g.textAlign = 'left'; g.fillText('vs computer:', 24, BTNY - 8); if (B.mode === '1p' && B.level === 'hard') { g.textAlign = 'right'; g.fillStyle = '#ffd23f'; g.fillText('Hard is unbeatable. Draws are the win.', W - 24, BTNY - 8); } g.textAlign = 'center';
    const bw = W / 5, bh = PX - 16 - (BTNY + 8); const act = B.mode === '1p' ? ['easy', 'normal', 'hard'].indexOf(B.level) : 3; g.font = '800 26px Poppins, Arial'; BTN.forEach(([label], i) => { const x = i * bw; const on = i === act, hot = i === B.hotBtn; g.fillStyle = on ? '#38f0ff' : hot ? '#2a3d7a' : '#182452'; rr(g, x + 8, BTNY + 8, bw - 16, bh, 16); g.fill(); if (hot && !on) { g.strokeStyle = '#38f0ff'; g.lineWidth = 4; g.stroke(); } g.fillStyle = on ? '#07122e' : '#fff'; g.fillText(label, x + bw / 2, BTNY + 8 + bh / 2 + 1, bw - 24); }); sc.dirty(); };

  const newGame = (keepScore) => { B.b = Array(9).fill(null); B.turn = 'X'; B.over = false; B.line = null; B.msg = ''; B.thinking = false; B.token++; if (!keepScore) B.score = { X: 0, O: 0, D: 0 }; draw(); };
  const setMode = (mode, level) => { B.mode = mode; if (level) B.level = level; newGame(false); app.toast(mode === '1p' ? 'Tic-tac-toe vs the computer (' + level + '). You are ❌.' : 'Tic-tac-toe, two players: ❌ then ⭕, tap a square on your turn.', 2600); };
  const finish = () => { const w = winLine(B.b, B.turn); if (w) { B.over = true; B.line = w; B.score[B.turn]++; const humanWon = B.mode === '2p' || B.turn === HUMAN; B.msg = B.mode === '1p' ? (humanWon ? 'You win! 🏆' : 'The computer wins 🤖') : 'Player ' + B.turn + ' wins! 🏆'; if (humanWon) app.celebrate(B.turn === 'X' ? '❌' : '⭕'); draw(); return true; } if (!freeCells(B.b).length) { B.over = true; B.score.D++; B.msg = 'Draw 🤝 · tap New game'; draw(); return true; } return false; };
  const place = (i) => { if (B.over || B.b[i]) return false; B.b[i] = B.turn; if (finish()) return true; B.turn = B.turn === 'X' ? 'O' : 'X'; draw(); return true; };
  const cpuTurn = () => { B.thinking = true; draw(); const tok = ++B.token; setTimeout(() => { if (tok !== B.token || B.over) return; B.thinking = false; const i = tttMove(B.b, B.level, CPU, HUMAN); if (i >= 0) place(i); else draw(); }, 700); };
  const tap = (i) => { if (B.over || B.thinking) return; if (B.mode === '1p' && B.turn !== HUMAN) return; if (!place(i)) return; if (B.mode === '1p' && !B.over) cpuTurn(); };

  app.addPlace({ id: 'tic-tac-toe', name: '❌⭕ Tic-Tac-Toe · the Arcade Ring', icon: '⭕', x: BX + Math.sin(yaw) * 1.6, z: BZ + Math.cos(yaw) * 1.6, look: [BX, BZ], cat: 'Fun', top: true, keys: 'tic tac toe noughts crosses arcade board game', say: 'Tic-tac-toe. Point at a square and pull the trigger.' });
  app.addInteractable(BX + Math.sin(yaw) * 1.6, BZ + Math.cos(yaw) * 1.6, 3, '❌⭕ Play tic-tac-toe', () => { newGame(true); app.toast('Point at a square and tap it. Buttons at the bottom pick the computer level.', 3000); });
  draw();
  return { state: () => ({ board: B.b.slice(), mode: B.mode, level: B.level, turn: B.turn, over: B.over, line: B.line, msg: B.msg, thinking: B.thinking, score: Object.assign({}, B.score) }), tap, setMode, newGame, mesh: sc.mesh, move: tttMove };
}
