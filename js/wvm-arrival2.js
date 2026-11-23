/* ============================================================
   World VR Mall · the short VR arrival (v2 · Nov 22 2026)
   Four seconds, standing still, from the first frame of the headset session. Plugged into the shared VR layer (js/wvm-xr.js) through
   opts.arrival; returns the handle the layer expects: { active, card, skip(), dismiss(), done(), k(), parts }.
     frame 0    a dawn sky is already around you: drawn from the WORLD direction, so it tracks the head from the first frame (never black)
     0.1–1.75   3,200 embers drift in from the sky ahead, spiral, and settle on the worldvrmall.com mark 3.2 m in front of your eyes
     1.45–1.95  the mark itself lights up over the embers, a soft halo swells once behind it, the sting plays
     2.05–3.6   the sky dissolves: a ragged glowing edge runs from behind you to the mark and the real world stands where the sky was
     2.55–3.9   the embers let go, rise and fade; the mark fades over the real world · 4.0 s: gone
   After a page hop inside VR, or a second entry in the same browser session (cfg.short), only the last part plays: 0.8 s.
   Rules it keeps: the camera and the player are never moved; nothing is post-processed; no light is added; four draw calls per eye
   (sky, halo, embers, mark); all glow is additive; one soft swell, no flashes; any button skips (the layer calls skip(): input is free
   at once, the picture finishes within 0.3 s). prepareArrival2(app, cfg) builds and compiles everything on the 2D page so the first
   headset frame compiles nothing. Everything is disposed at the end and built again when the session is over.
   ============================================================ */
import * as THREE from 'three'; /* straight from the import map: the engine is loaded with ?v= on these pages, a bare import would run a second copy of it */
const T = THREE;
const N = 3200, MARK_W = 2.4, MARK_H = 1.2, MARK_D = 3.2, T_OPEN = 2.05, T_END = 4.0, SHORT_LEN = 0.8, SKIP_LEN = 0.3;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

const SKY_VS = 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); }';
/* uTh: the angle from the mark beyond which the sky has dissolved (it runs from past 180° down to nothing); the edge is ragged by two reads of a tiny noise texture, looked up by direction (no seam, no pinch at the poles) */
const SKY_FS = 'uniform sampler2D uN; uniform vec3 uDir; uniform vec3 uAcc; uniform float uTh; uniform float uLift; uniform float uGlow; uniform float uT; varying vec3 vD; void main(){ vec3 d = normalize(vD); vec2 q = d.xz / (1.0 + abs(d.y)); float n = texture2D(uN, q * 0.45 + vec2(uT * 0.003, 0.0)).r * 0.62 + texture2D(uN, q * 1.7 - vec2(0.0, uT * 0.005)).r * 0.38; float ang = acos(clamp(dot(d, uDir), -1.0, 1.0)); float a = ang + (n - 0.5) * 0.44; float alpha = 1.0 - smoothstep(uTh - 0.03, uTh + 0.02, a); float edge = smoothstep(uTh - 0.13, uTh - 0.03, a) * alpha; float rim = smoothstep(uTh - 0.34, uTh, a) * alpha; float h = d.y; vec3 col = mix(vec3(0.034, 0.058, 0.125), vec3(0.012, 0.018, 0.062), smoothstep(0.0, 0.7, h)); col = mix(col, vec3(0.010, 0.014, 0.036), smoothstep(0.0, -0.35, h)); col += (uAcc * 0.20 + vec3(0.10, 0.05, 0.12)) * exp(-abs(h) * 9.0); col += (uAcc * 0.5 + vec3(0.25, 0.18, 0.10)) * exp(-ang * ang * 3.0) * uGlow * 0.35; col *= uLift; col += uAcc * 0.22 * rim * rim; col = mix(col, uAcc * 0.55 + vec3(0.5), edge * edge * 0.9); gl_FragColor = vec4(col, alpha); }';
/* the embers: every path is computed here from three numbers (uG gather, uR release, uT clock); no buffer is written after the build */
const PT_VS = 'attribute vec3 aT; attribute vec3 aS; uniform float uG; uniform float uR; uniform float uT; uniform float uPx; uniform float uA; uniform vec3 uAcc; varying float vA; varying vec3 vC; void main(){ float u = clamp((uG - aS.x * 0.5) / 0.5, 0.0, 1.0); float e = 1.0 - pow(1.0 - u, 3.0); float f = 1.0 - e; vec3 off = position * f; float an = f * (1.2 + aS.y * 2.2); float c = cos(an), s = sin(an); off.xy = vec2(c * off.x - s * off.y, s * off.x + c * off.y); off.xy += 0.10 * f * vec2(sin(uT * 0.9 + aS.z * 30.0), cos(uT * 0.7 + aS.x * 30.0)); vec3 p = vec3(aT.xy, 0.0) + off; p.xy += 0.005 * e * vec2(sin(uT * 2.3 + aS.z * 50.0), cos(uT * 1.9 + aS.y * 40.0)); float r = clamp((uR - aS.z * 0.45) / 0.55, 0.0, 1.0); vec2 od = normalize(aT.xy + vec2(0.0001, 0.0002)); p.xy += od * 0.25 * r + vec2(sin(aS.x * 30.0 + r * 4.0) * 0.08 * r, 0.55 * r * r + 0.25 * r); p.z += (aS.y - 0.5) * 0.5 * r; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float tw = 0.78 + 0.22 * sin(uT * (5.0 + aS.x * 6.0) + aS.z * 60.0); float size = (0.015 + 0.02 * aS.y) * (1.0 + 1.6 * f) * (1.0 - 0.5 * r); gl_PointSize = clamp(size * projectionMatrix[1][1] * uPx / max(0.3, -mv.z), 1.5, 48.0); vA = uA * tw * (1.0 - r) * (1.0 - 0.3 * e); vec3 warm = vec3(1.0, 0.66, 0.28); vec3 cool = mix(uAcc, vec3(1.0), 0.45); vC = mix(warm, cool, smoothstep(0.35, 1.0, e) * step(aS.z, 0.86)); }';
const PT_FS = 'varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float g = clamp(1.0 - d, 0.0, 1.0); gl_FragColor = vec4(vC, (g * g * g + g * 0.22) * vA); }';

/* ---- the mark: the site's own logo, its ink turned to light; a plain wordmark stands in until (or unless) the image loads ---- */
const M = { canvas: null, ready: false, targets: null, onReady: null };
function sampleTargets() {
  const c = M.canvas, cw = c.width, ch = c.height; const d = c.getContext('2d').getImageData(0, 0, cw, ch).data; const hits = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 96) hits.push(x, y);
  const n = hits.length / 2; const out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { if (!n) { const a = Math.random() * 6.283; out[i * 2] = Math.cos(a) * 0.5; out[i * 2 + 1] = Math.sin(a) * 0.5; continue; } const j = Math.floor(Math.random() * n); out[i * 2] = ((hits[j * 2] + Math.random()) / cw - 0.5) * MARK_W; out[i * 2 + 1] = (0.5 - (hits[j * 2 + 1] + Math.random()) / ch) * MARK_H; }
  M.targets = out;
}
function loadMark(url, accent) {
  if (M.canvas) return; const c = M.canvas = document.createElement('canvas'); c.width = 600; c.height = 300; const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#eef6ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 64px system-ui, Arial, sans-serif'; g.fillText('worldvrmall.com', 300, 150); sampleTargets();
  if (!url) return;
  try {
    const im = new Image(); im.onload = () => {
      try {
        g.clearRect(0, 0, 600, 300); const s = Math.min(580 / im.width, 284 / im.height), w = im.width * s, h = im.height * s; g.drawImage(im, (600 - w) / 2, (300 - h) / 2, w, h);
        const id = g.getImageData(0, 0, 600, 300), d = id.data; const ar = (accent >> 16) & 255, ag = (accent >> 8) & 255, ab = accent & 255;
        /* dark ink on a pale sheet: the sheet becomes air, the ink becomes light, the blue ink keeps the mall's cyan */
        for (let i = 0; i < d.length; i += 4) { const a0 = d[i + 3]; if (!a0) continue; const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; const ink = clamp01((238 - lum) / 150); const blue = d[i + 2] > d[i] + 40; d[i] = blue ? ar : 236; d[i + 1] = blue ? ag : 246; d[i + 2] = blue ? ab : 255; d[i + 3] = Math.round(a0 * ink); }
        g.putImageData(id, 0, 0); sampleTargets(); M.ready = true; if (M.onReady) M.onReady();
      } catch (e) { }
    }; im.src = url;
  } catch (e) { }
}

/* ---- the sting: a rising fifth that opens into a small bell chord as the mark lights. Oscillators only, nothing is downloaded. ---- */
let AC = null;
function audioReady() { try { if (localStorage.getItem('xr_quiet') === '1') return null; } catch (e) { } try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; if (!AC) { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null; AC = new A(); } if (AC.state === 'suspended') AC.resume().catch(() => { }); return AC; } catch (e) { return null; } }
function sting() {
  const C = audioReady(); if (!C) return null;
  try {
    const t0 = C.currentTime + 0.03; const out = C.createGain(); out.gain.value = 0.8; out.connect(C.destination);
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.setValueAtTime(260, t0); lp.frequency.exponentialRampToValueAtTime(2600, t0 + 1.75); lp.connect(out);
    for (const [f, pk] of [[146.83, 0.05], [220, 0.04], [329.63, 0.026]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.97, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 1.5); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(pk, t0 + 1.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.9); o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + 3); }
    [[73.42, 0.07, 0], [587.33, 0.04, 0], [880, 0.034, 0.05], [1318.51, 0.024, 0.1], [1479.98, 0.016, 0.16]].forEach(([f, pk, dl]) => { const o = C.createOscillator(), g = C.createGain(), ts = t0 + 1.75 + dl; o.type = 'sine'; o.frequency.setValueAtTime(f, ts); g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(pk, ts + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ts + 1.9); o.connect(g); g.connect(out); o.start(ts); o.stop(ts + 2); });
    return { hush: () => { try { const n = C.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0.0001, n + 0.25); } catch (e) { } } };
  } catch (e) { return null; }
}

/* ---- the kit: four meshes. Built and compiled on the 2D page; thrown away after each arrival. ---- */
let K = null, playing = false, hooked = false;
function build(app, accent) {
  const ACC = new T.Color(accent); const mats = [], geos = [], texs = []; const flag = (o) => { o.frustumCulled = false; o.userData.noCull = true; o.userData.noFreeze = true; o.userData.noShadow = true; o.userData.mapHide = true; o.userData.noOcclude = true; o.castShadow = false; o.receiveShadow = false; return o; };
  const grp = flag(new T.Group()), root = flag(new T.Group()); grp.add(root); grp.userData.arrival2 = true;
  /* the sky */
  const nd = new Uint8Array(16 * 16 * 4); for (let i = 0; i < 16 * 16; i++) { const v = Math.floor(Math.random() * 256); nd[i * 4] = nd[i * 4 + 1] = nd[i * 4 + 2] = v; nd[i * 4 + 3] = 255; }
  const noise = new T.DataTexture(nd, 16, 16, T.RGBAFormat); noise.wrapS = noise.wrapT = T.RepeatWrapping; noise.magFilter = noise.minFilter = T.LinearFilter; noise.needsUpdate = true; texs.push(noise);
  const skyU = { uN: { value: noise }, uDir: { value: new T.Vector3(0, 0, -1) }, uAcc: { value: ACC }, uTh: { value: -1 }, uLift: { value: 0.6 }, uGlow: { value: 0 }, uT: { value: 0 } };
  const skyG = new T.SphereGeometry(10, 32, 16), skyM = new T.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: T.BackSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const sky = flag(new T.Mesh(skyG, skyM)); sky.renderOrder = 990; grp.add(sky); geos.push(skyG); mats.push(skyM);
  /* the halo behind the mark */
  const hc = document.createElement('canvas'); hc.width = hc.height = 128; { const g = hc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const haloT = new T.CanvasTexture(hc); haloT.colorSpace = T.SRGBColorSpace; texs.push(haloT);
  const quad = new T.PlaneGeometry(1, 1); geos.push(quad);
  const haloM = new T.MeshBasicMaterial({ map: haloT, color: ACC.clone().lerp(new T.Color(0xffffff), 0.25), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const halo = flag(new T.Mesh(quad, haloM)); halo.scale.set(MARK_W * 1.9, MARK_H * 2.4, 1); halo.position.z = -0.05; halo.renderOrder = 991; root.add(halo); mats.push(haloM);
  /* the embers */
  const pos = new Float32Array(N * 3), aT = new Float32Array(N * 3), aS = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { /* each starts 2.2 to 6 m from its place on the mark, to the sides, above and beyond it: never between the mark and your face */ const a = Math.random() * 6.283, zz = -Math.random(), rr = Math.sqrt(1 - zz * zz * 0.8), r = 2.2 + Math.random() * 3.8; pos[i * 3] = Math.cos(a) * rr * r; pos[i * 3 + 1] = Math.sin(a) * rr * r * 0.75 + 0.4; pos[i * 3 + 2] = zz * r; aS[i * 3] = Math.random(); aS[i * 3 + 1] = Math.random(); aS[i * 3 + 2] = Math.random(); }
  const ptG = new T.BufferGeometry(); ptG.setAttribute('position', new T.BufferAttribute(pos, 3)); const tAttr = new T.BufferAttribute(aT, 3); ptG.setAttribute('aT', tAttr); ptG.setAttribute('aS', new T.BufferAttribute(aS, 3)); ptG.boundingSphere = new T.Sphere(new T.Vector3(), 12);
  const ptU = { uG: { value: 0 }, uR: { value: 0 }, uT: { value: 0 }, uPx: { value: 500 }, uA: { value: 0 }, uAcc: { value: ACC } };
  const ptM = new T.ShaderMaterial({ uniforms: ptU, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const pts = flag(new T.Points(ptG, ptM)); pts.renderOrder = 992; root.add(pts); geos.push(ptG); mats.push(ptM);
  /* the mark */
  const logoT = new T.CanvasTexture(M.canvas); logoT.colorSpace = T.SRGBColorSpace; logoT.generateMipmaps = false; logoT.minFilter = T.LinearFilter; texs.push(logoT);
  const logoM = new T.MeshBasicMaterial({ map: logoT, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const logo = flag(new T.Mesh(quad, logoM)); logo.scale.set(MARK_W, MARK_H, 1); logo.position.z = 0.01; logo.renderOrder = 993; root.add(logo); mats.push(logoM);
  const setTargets = () => { const t = M.targets; for (let i = 0; i < N; i++) { aT[i * 3] = t[i * 2]; aT[i * 3 + 1] = t[i * 2 + 1]; } tAttr.needsUpdate = true; logoT.needsUpdate = true; };
  setTargets();
  return { grp, root, sky, skyU, halo, haloM, pts, ptU, logo, logoM, logoT, mats, geos, texs, setTargets, compiled: false };
}
function dispose() { const k = K; K = null; if (!k) return; try { if (k.grp.parent) k.grp.parent.remove(k.grp); k.geos.forEach((g) => g.dispose()); k.mats.forEach((m) => m.dispose()); k.texs.forEach((t) => t.dispose()); } catch (e) { } }

/* Build the kit and compile its four programs now, on the 2D page. While it compiles it is in the scene but draws nothing you can see
   (dissolved sky, zero opacity), because a hidden object is skipped by the compile. */
export function prepareArrival2(app, cfg = {}) {
  if (K) return K; const R = app.renderer, scene = app.scene;
  const acc0 = typeof cfg.accent === 'string' ? parseInt(cfg.accent.replace('#', ''), 16) : cfg.accent; const accent = acc0 || 0x22d3ee;
  loadMark(cfg.logoUrl || '/images/world-vr-mall-logo-600.png', accent);
  const k = K = build(app, accent); M.onReady = () => { if (K && !playing) { K.setTargets(); try { R.initTexture && R.initTexture(K.logoT); } catch (e) { } } };
  scene.add(k.grp); k.grp.visible = true; k.root.visible = true; k.root.position.set(0, -500, 0); k.root.updateMatrixWorld(true);
  const done = () => { if (K === k) { k.compiled = true; if (!playing) k.grp.visible = false; } };
  try { k.texs.forEach((t) => { try { R.initTexture && R.initTexture(t); } catch (e) { } }); if (R.compileAsync) R.compileAsync(k.grp, app.camera, scene).then(done, done); else { R.compile(k.grp, app.camera, scene); done(); } } catch (e) { done(); }
  if (!hooked) { hooked = true; try { R.xr.addEventListener('sessionend', () => setTimeout(() => { try { if (!K && !R.xr.isPresenting) prepareArrival2(app, cfg); } catch (e) { } }, 800)); } catch (e) { } }
  return k;
}

export function arrival2(app, cfg = {}) {
  const R = app.renderer, cam = app.camera; const k = prepareArrival2(app, cfg); const short = !!cfg.short;
  playing = true; k.grp.visible = true; k.root.visible = false; /* the sky is up before the first headset frame; the mark waits for the head pose */
  k.skyU.uTh.value = 4; k.skyU.uLift.value = short ? 1 : 0.6; k.skyU.uGlow.value = 0; k.ptU.uA.value = 0; k.logoM.opacity = 0; k.haloM.opacity = 0;
  let t = short ? T_OPEN : 0, rate = short ? (T_END - T_OPEN) / SHORT_LEN : 1, clock = 0, wait = 0, last = 0, locked = false, done = false, lit = false, snd = null;
  const _p = new T.Vector3(), _f = new T.Vector3(), _v = new T.Vector2();
  /* three keys every program on the scene's light and shadow state, and the VR layer changes that state as the session starts: the programs compiled on the 2D page may not be the ones a headset frame asks for. Compile again here, in the session-start task with the VR state already set, so any compile lands before the first frame and never on a drawn one. */
  try { R.compile(k.grp, cam, app.scene); } catch (e) { }
  if (!short) audioReady(); /* the audio context is made here, in the session-start task, not on a drawn frame */
  const lock = () => {
    locked = true; cam.updateMatrixWorld(true); cam.getWorldPosition(_p); cam.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
    k.root.position.set(_p.x + _f.x * MARK_D, _p.y - 0.12, _p.z + _f.z * MARK_D); k.root.rotation.set(0, Math.atan2(-_f.x, -_f.z), 0); k.root.updateMatrixWorld(true); k.root.visible = true;
    k.skyU.uDir.value.copy(k.root.position).sub(_p).normalize();
    if (!short) snd = sting();
  };
  const fx = () => {
    let dt; if (done) return; /* its own wall clock: the engine caps a frame at 50 ms, which would stretch the four seconds on a slow device */ const now = performance.now(); dt = last ? Math.min((now - last) / 1000, 0.25) : 0.016; last = now;
    if (!locked) { /* at 'sessionstart' the headset has no pose yet: wait for one (a third of a second at most), the sky is already tracking */ wait += dt; if (cam.position.y > 0.3 || cam.position.lengthSq() > 0.01 || wait > 0.35) lock(); else return; }
    t += dt * rate; clock += dt;
    try { const xc = R.xr.isPresenting && R.xr.getCamera && R.xr.getCamera(); const vp = xc && xc.cameras && xc.cameras[0] && xc.cameras[0].viewport; k.ptU.uPx.value = (vp && vp.w > 0 ? vp.w : R.getDrawingBufferSize(_v).y) * 0.5; } catch (e) { }
    const out = 1 - smooth(2.9, 3.65, t);
    k.skyU.uT.value = clock; k.ptU.uT.value = clock;
    k.skyU.uLift.value = short ? 1 : 0.6 + 0.4 * smooth(0, 0.6, t);
    k.skyU.uGlow.value = smooth(0.8, 1.9, t) * out;
    const ou = clamp01((t - T_OPEN) / 1.55); k.skyU.uTh.value = ou <= 0 ? 4 : 3.6 - 4.0 * (1 - Math.pow(1 - ou, 1.7));
    k.ptU.uG.value = short ? 1 : clamp01((t - 0.1) / 1.65); k.ptU.uR.value = clamp01((t - 2.55) / 1.3);
    k.ptU.uA.value = (short ? 1 : smooth(0, 0.3, t)) * (1 - smooth(3.5, 3.95, t));
    k.logoM.opacity = 0.95 * (short ? 1 : smooth(1.45, 1.95, t)) * out;
    const swell = smooth(1.6, 1.95, t) * (1 - smooth(1.95, 2.6, t)); /* one soft swell as the mark lights: 0.35 s up, 0.65 s down */
    k.haloM.opacity = (0.15 * smooth(1.2, 1.8, t) + 0.2 * swell) * out; k.halo.scale.set(MARK_W * (1.9 + 0.25 * swell), MARK_H * (2.4 + 0.3 * swell), 1);
    if (!lit && t >= 1.8 && !short && rate === 1) { lit = true; try { cfg.haptic && cfg.haptic(0.35, 80); } catch (e) { } try { sessionStorage.setItem('wvm_arrival_seen', '1'); } catch (e) { } }
    if (t >= T_END) H.done();
  };
  const H = {
    active: true, card: false, parts: k, short, k: () => t,
    skip: () => { if (done || !H.active) return; H.active = false; if (!locked) lock(); if (t < T_OPEN) t = T_OPEN; rate = Math.max(rate, (T_END - t) / SKIP_LEN); if (snd) snd.hush(); },
    dismiss: () => { },
    done: () => { if (done) return; done = true; H.active = false; playing = false; k.sky.onBeforeRender = () => { }; if (snd && t < T_END) snd.hush(); if (K === k) dispose(); try { cfg.onDone && cfg.onDone(); } catch (e) { } },
  };
  /* it advances from the sky's own draw, once per rendered frame (both eyes share one tick): while the sky is on screen the arrival cannot stall, even if a popup pauses the app's own updaters */
  let lastFrame = -1; k.sky.onBeforeRender = (r) => { const f = r.info.render.frame; if (f === lastFrame) return; lastFrame = f; fx(); };
  return H;
}
