/* ============================================================
   World VR Mall · the seed VR arrival (v1 · Oct 21 2026, approved by Zach from the preview the same day)
   Plays on the island page the first time a visitor enters VR in a browser session. Plugged into the shared VR layer (js/wvm-xr.js)
   through opts.arrival; returns the handle the layer expects: { active, card, skip(), dismiss(), done(), k(), parts }.
     0–2.0 s   the mall's green alien (purple neon suit, the makeAlien() design) walks up between you and the mall
     2.3–3.45  its ray gun cuts a hole in the ground: violet laser, sparks, smoke, a glowing rim
     3.6–4.2   it plants a glowing seed · 4.55–5.55 it sweeps soil over it · 5.7–6.95 garden hose, it waters the mound
     6.75–7.5  a sprout curls up · 7.5–11.9 the REAL mall (buildMall's group, app.mallGroup) grows out of the seed and settles at its
              own place and size; the alien steps aside, looks up, waves
   The mall is hidden until it grows and is put back exactly as it was. No light is added (a new light recompiles every shader on the Quest),
   nothing is shadowed, all glow is emissive or additive. prepareSeed(app) builds and compiles the alien and effects on the 2D page.
   Any button skips to the finished mall.
   ============================================================ */
import * as THREE from 'three'; /* straight from the import map: the engine is loaded with ?v= on these pages, a bare import would run a second copy of it */
const T = THREE;
const TL = { walk1: 2.0, fire0: 2.3, fire1: 3.45, seed0: 3.6, drop: 4.2, cover0: 4.55, cover1: 5.55, hose0: 5.7, water0: 5.95, water1: 6.95, sprout0: 6.75, step0: 7.0, step1: 7.8, grow0: 7.5, grow1: 11.9, wave0: 11.7, end: 13.2 };
const HOLE = new T.Vector3(0, 0, -3.2), ALIEN_AT = new T.Vector3(-0.35, 0, -4.35), ALIEN_ASIDE = new T.Vector3(-2.1, 0, -4.4);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rr = (a, b) => a + (b - a) * Math.random();
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
const radialTex = (stops) => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

const STREAK_VS = `attribute vec3 iPos; attribute vec3 iVel; attribute float iHeat; uniform float uShutter; uniform float uWidth; varying vec2 vUv; varying float vHeat;
void main(){ vHeat = iHeat; vUv = uv; vec4 vp = viewMatrix * modelMatrix * vec4(iPos, 1.0); vec3 vv = (viewMatrix * modelMatrix * vec4(iVel, 0.0)).xyz;
  vec2 d = vv.xy - vp.xy * (vv.z / min(vp.z, -0.05)); float l = length(d); vec2 dir = l > 1e-5 ? d / l : vec2(0.0, 1.0); vec2 sd = vec2(-dir.y, dir.x);
  float L = max(uWidth * 1.6, length(vv) * uShutter); float w = iHeat > 0.0 ? uWidth : 0.0; vp.xy += -dir * position.y * L + sd * position.x * w; gl_Position = projectionMatrix * vp; }`;
const STREAK_FS = `uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCold; uniform float uGain; uniform float uAlpha; varying vec2 vUv; varying float vHeat;
void main(){ if (vHeat <= 0.0) discard; float x = abs(vUv.x * 2.0 - 1.0); float a = (1.0 - x * x) * mix(1.0, 0.2, vUv.y);
  vec3 c = vHeat > 0.5 ? mix(uMid, uHot, (vHeat - 0.5) * 2.0) : mix(uCold, uMid, vHeat * 2.0);
  if (uAlpha > 0.0) gl_FragColor = vec4(c, a * uAlpha * min(1.0, vHeat * 3.0)); else gl_FragColor = vec4(c * a * (0.5 + uGain * vHeat), 1.0); }`;
class Streaks {
  constructor(N, o) {
    this.N = N; this.o = o; const base = new T.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
    const g = new T.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.h = new Float32Array(N); this.life = new Float32Array(N); this.max = new Float32Array(N); this.temp = new Float32Array(N);
    this.ap = new T.InstancedBufferAttribute(this.p, 3); this.av = new T.InstancedBufferAttribute(this.v, 3); this.ah = new T.InstancedBufferAttribute(this.h, 1);
    [this.ap, this.av, this.ah].forEach((a) => a.setUsage(T.DynamicDrawUsage)); g.setAttribute('iPos', this.ap); g.setAttribute('iVel', this.av); g.setAttribute('iHeat', this.ah); g.instanceCount = N;
    this.mat = new T.ShaderMaterial({ uniforms: { uShutter: { value: o.shutter }, uWidth: { value: o.width }, uHot: { value: new T.Color(o.hot) }, uMid: { value: new T.Color(o.mid) }, uCold: { value: new T.Color(o.cold) }, uGain: { value: o.gain ?? 2.6 }, uAlpha: { value: o.alpha || 0 } },
      vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: o.alpha ? T.NormalBlending : T.AdditiveBlending, fog: false });
    this.mesh = new T.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.next = 0;
  }
  clear() { this.life.fill(0); this.h.fill(0); this.ah.needsUpdate = true; }
  spawn(x, y, z, vx, vy, vz, life, temp = 1) { const i = this.next; this.next = (this.next + 1) % this.N; const j = i * 3; this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz; this.life[i] = this.max[i] = life; this.temp[i] = temp; }
  step(dt) {
    const o = this.o, p = this.p, v = this.v; let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.h[i] = 0; continue; } any = true;
      this.life[i] -= dt; const j = i * 3; v[j + 1] += o.grav * dt; const dr = 1 - o.drag * dt; v[j] *= dr; v[j + 1] *= dr; v[j + 2] *= dr;
      if (o.swirl) { const x = p[j] - o.swirl.x, z = p[j + 2] - o.swirl.z; v[j] += -z * o.swirl.k * dt; v[j + 2] += x * o.swirl.k * dt; }
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < 0.004 && v[j + 1] < 0) { if (o.stick) this.life[i] = Math.min(this.life[i], 0.05); p[j + 1] = 0.004; v[j + 1] *= -0.3; v[j] *= 0.6; v[j + 2] *= 0.6; }
      const k = Math.max(0, this.life[i] / this.max[i]); this.h[i] = this.life[i] > 0 ? Math.max(0.02, Math.pow(k, 0.7) * this.temp[i]) : 0;
      if (o.fork && this.h[i] > 0.35 && Math.random() < dt * o.fork) { for (let c = 0; c < 3; c++) this.spawn(p[j], p[j + 1], p[j + 2], v[j] * 0.4 + rr(-1.2, 1.2), v[j + 1] * 0.4 + rr(-1.2, 1.2), v[j + 2] * 0.4 + rr(-1.2, 1.2), rr(0.08, 0.18), this.h[i]); }
    }
    if (any || this._any) { this.ap.needsUpdate = this.av.needsUpdate = this.ah.needsUpdate = true; } this._any = any;
  }
}

/* the alien: the engine's makeAlien() look (green skin, violet suit, big eyes, antennae) with joints and purple neon trim */
function makeAlien() {
  const skin = new T.MeshPhysicalMaterial({ color: 0x46d43a, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6 });
  const suit = new T.MeshPhysicalMaterial({ color: 0x5b2fa3, metalness: 0.3, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2 });
  const dark = new T.MeshStandardMaterial({ color: 0x1b1028, metalness: 0.5, roughness: 0.4 });
  const neon = new T.MeshStandardMaterial({ color: 0xd2a8ff, emissive: 0xb44cff, emissiveIntensity: 4.5, toneMapped: false });
  const eyeM = new T.MeshPhysicalMaterial({ color: 0x050310, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
  const cap = (r, l, m) => { const x = new T.Mesh(new T.CapsuleGeometry(r, l, 6, 14), m); x.castShadow = true; return x; };
  const ring = (r, tube, m) => { const x = new T.Mesh(new T.TorusGeometry(r, tube, 8, 28), m); x.rotation.x = Math.PI / 2; return x; };
  const root = new T.Group(), hips = new T.Group(); hips.position.y = 0.86; root.add(hips);
  const legs = [-1, 1].map((sx) => {
    const hip = new T.Group(); hip.position.set(sx * 0.12, 0, 0); hips.add(hip);
    const th = cap(0.078, 0.28, suit); th.position.y = -0.2; hip.add(th);
    const knee = new T.Group(); knee.position.y = -0.42; hip.add(knee); knee.add(ring(0.085, 0.013, neon));
    const sh = cap(0.068, 0.26, suit); sh.position.y = -0.19; knee.add(sh);
    const foot = cap(0.06, 0.12, dark); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.4, 0.06); knee.add(foot);
    const sole = ring(0.07, 0.01, neon); sole.position.set(0, -0.43, 0.04); knee.add(sole);
    return { hip, knee };
  });
  const spine = new T.Group(); hips.add(spine);
  const body = cap(0.2, 0.34, suit); body.position.y = 0.33; spine.add(body);
  const belt = ring(0.205, 0.014, neon); belt.position.y = 0.1; spine.add(belt);
  const collar = ring(0.12, 0.014, neon); collar.position.y = 0.64; spine.add(collar);
  for (const sx of [-1, 1]) { const st = new T.Mesh(new T.BoxGeometry(0.03, 0.36, 0.014), neon); st.position.set(sx * 0.07, 0.36, 0.198); st.rotation.z = sx * 0.28; spine.add(st); }
  const emblem = new T.Mesh(new T.CircleGeometry(0.045, 24), neon); emblem.position.set(0, 0.5, 0.205); spine.add(emblem);
  const neck = cap(0.05, 0.08, skin); neck.position.y = 0.72; spine.add(neck);
  const head = new T.Group(); head.position.y = 0.95; spine.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.3, 32, 24), skin); skull.scale.set(1, 1.2, 0.95); skull.castShadow = true; head.add(skull);
  for (const sx of [-1, 1]) {
    const e = new T.Mesh(new T.SphereGeometry(0.11, 20, 14), eyeM); e.position.set(sx * 0.13, 0.05, 0.22); e.scale.set(1, 1.55, 0.55); e.rotation.z = sx * 0.42; head.add(e);
    const gl = new T.Mesh(new T.SphereGeometry(0.022, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(sx * 0.105, 0.11, 0.285); head.add(gl);
    const gl2 = new T.Mesh(new T.SphereGeometry(0.012, 8, 6), new T.MeshBasicMaterial({ color: 0xd9b8ff })); gl2.position.set(sx * 0.15, -0.0, 0.28); head.add(gl2);
    const st = new T.Mesh(new T.CylinderGeometry(0.011, 0.013, 0.32, 8), skin); st.position.set(sx * 0.12, 0.45, -0.02); st.rotation.z = sx * -0.32; head.add(st);
    const ball = new T.Mesh(new T.SphereGeometry(0.045, 14, 10), neon); ball.position.set(sx * 0.172, 0.6, -0.02); head.add(ball); const halo = new T.Sprite(new T.SpriteMaterial({ map: radialTex([[0, 'rgba(230,190,255,0.9)'], [0.35, 'rgba(180,80,255,0.35)'], [1, 'rgba(160,60,255,0)']]), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(0.24); ball.add(halo);
  }
  const mouth = new T.Mesh(new T.TorusGeometry(0.045, 0.009, 6, 14, Math.PI), new T.MeshStandardMaterial({ color: 0x2a5a1a })); mouth.position.set(0, -0.15, 0.255); mouth.rotation.z = Math.PI; head.add(mouth);
  const arms = [-1, 1].map((sx) => {
    const sh = new T.Group(); sh.position.set(sx * 0.29, 0.6, 0); spine.add(sh);
    const pad = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), suit); sh.add(pad);
    const up = cap(0.055, 0.24, skin); up.position.y = -0.16; sh.add(up);
    const elbow = new T.Group(); elbow.position.y = -0.33; sh.add(elbow); elbow.add(ring(0.06, 0.011, neon));
    const fo = cap(0.05, 0.22, skin); fo.position.y = -0.14; elbow.add(fo);
    const hand = new T.Group(); hand.position.y = -0.31; elbow.add(hand);
    const palm = new T.Mesh(new T.SphereGeometry(0.058, 12, 10), skin); palm.scale.set(1, 1.1, 0.7); hand.add(palm);
    for (const f of [-1, 0, 1]) { const fi = cap(0.016, 0.07, skin); fi.position.set(f * 0.03, -0.08, 0.01); fi.rotation.z = f * 0.18; hand.add(fi); }
    return { sh, elbow, hand };
  });
  /* ray gun (violet coils), garden nozzle, both carried in the right hand */
  const gun = new T.Group(); arms[1].hand.add(gun); gun.position.set(0, -0.04, 0.03);
  const barrel = new T.Mesh(new T.CylinderGeometry(0.028, 0.034, 0.22, 16), new T.MeshPhysicalMaterial({ color: 0xd9dde6, metalness: 1, roughness: 0.2 })); barrel.position.y = -0.11; gun.add(barrel);
  for (let i = 0; i < 3; i++) { const c = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 8, 20), neon); c.rotation.x = Math.PI / 2; c.position.y = -0.05 - i * 0.055; gun.add(c); }
  const tip = new T.Mesh(new T.SphereGeometry(0.03, 12, 8), neon); tip.position.y = -0.23; gun.add(tip);
  const muzzle = new T.Object3D(); muzzle.position.y = -0.25; gun.add(muzzle);
  const nozzle = new T.Group(); arms[1].hand.add(nozzle); nozzle.position.set(0, -0.03, 0.03);
  const nb = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.12, 14), new T.MeshStandardMaterial({ color: 0x2e8b3a, roughness: 0.5 })); nb.position.y = -0.04; nozzle.add(nb);
  const brass = new T.Mesh(new T.CylinderGeometry(0.014, 0.024, 0.12, 14), new T.MeshPhysicalMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.25 })); brass.position.y = -0.16; nozzle.add(brass);
  const spout = new T.Object3D(); spout.position.y = -0.23; nozzle.add(spout);
  const hoseEnd = new T.Object3D(); hoseEnd.position.y = 0.04; nozzle.add(hoseEnd);
  const pouch = new T.Mesh(new T.SphereGeometry(0.06, 12, 10), dark); pouch.position.set(0.17, 0.05, 0.12); pouch.scale.set(1, 0.8, 0.6); spine.add(pouch);
  
  return { root, hips, spine, head, legs, arms, gun, muzzle, nozzle, spout, hoseEnd, neon };
}


let KIT = null;
export function prepareSeed(app) {
  if (KIT) return KIT;
  const K = KIT = {}; const root = K.root = new T.Group(); root.visible = false; root.position.set(0, -500, 0); /* parked under the world while it is not playing */
  const tl = new T.TextureLoader(); const tex = (n, rep, srgb = true) => { const t = tl.load('/textures/' + n + '.jpg'); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
  const dirt = tex('dirt', 1.5), dirtN = tex('dirt-n', 1.5, false);
  const fade = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  K.patch = new T.Mesh(new T.CircleGeometry(0.85, 48), new T.MeshStandardMaterial({ map: dirt, normalMap: dirtN, roughness: 1, transparent: true, alphaMap: fade })); K.patch.rotation.x = -Math.PI / 2; K.patch.position.copy(HOLE).setY(0.012); root.add(K.patch);
  K.burn = new T.Mesh(new T.CircleGeometry(0.42, 40), new T.MeshBasicMaterial({ map: radialTex([[0, 'rgba(10,6,4,1)'], [0.45, 'rgba(25,14,8,0.9)'], [0.75, 'rgba(60,35,20,0.35)'], [1, 'rgba(60,35,20,0)']]), transparent: true, depthWrite: false })); K.burn.rotation.x = -Math.PI / 2; K.burn.position.copy(HOLE).setY(0.014); root.add(K.burn);
  K.hole = new T.Mesh(new T.CircleGeometry(0.2, 40), new T.MeshBasicMaterial({ color: 0x050302 })); K.hole.rotation.x = -Math.PI / 2; K.hole.position.copy(HOLE).setY(0.016); root.add(K.hole);
  K.rimMat = new T.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff7a2a, emissiveIntensity: 0, roughness: 1 }); K.rim = new T.Mesh(new T.TorusGeometry(0.205, 0.03, 10, 48), K.rimMat); K.rim.rotation.x = -Math.PI / 2; K.rim.position.copy(HOLE).setY(0.02); root.add(K.rim);
  K.mound = new T.Mesh(new T.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ map: dirt, normalMap: dirtN, roughness: 1, color: 0xa08a78 })); K.mound.position.copy(HOLE); root.add(K.mound);
  K.seed = new T.Mesh(new T.SphereGeometry(0.032, 16, 12), new T.MeshStandardMaterial({ color: 0xd8ff9a, emissive: 0x8dff5a, emissiveIntensity: 2.4, toneMapped: false })); K.seed.scale.set(1, 1.4, 1); root.add(K.seed);
  const halo = (stops) => new T.Sprite(new T.SpriteMaterial({ map: radialTex(stops), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
  K.seedHalo = halo([[0, 'rgba(220,255,190,1)'], [0.3, 'rgba(140,255,90,0.55)'], [1, 'rgba(120,255,80,0)']]); root.add(K.seedHalo);
  const stemCurve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0.02, 0.12, 0), new T.Vector3(-0.03, 0.25, 0.02), new T.Vector3(0.02, 0.36, 0), new T.Vector3(0.07, 0.42, 0)]);
  K.stem = new T.Mesh(new T.TubeGeometry(stemCurve, 48, 0.012, 8, false), new T.MeshStandardMaterial({ color: 0x5fe05a, emissive: 0x39d13a, emissiveIntensity: 0.9, roughness: 0.5 })); K.stem.position.copy(HOLE).setY(0.08); root.add(K.stem);
  const leaf = new T.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(0.06, 0.03, 0.13, 0); leaf.quadraticCurveTo(0.06, -0.03, 0, 0);
  [-1, 1].forEach((sx, i) => { const l = new T.Mesh(new T.ShapeGeometry(leaf, 10), new T.MeshStandardMaterial({ color: 0x6ff060, emissive: 0x3ccf3c, emissiveIntensity: 0.8, side: T.DoubleSide })); l.position.set(0, 0.2 + i * 0.1, 0); l.rotation.set(0.3, i * Math.PI, sx * 0.4); K.stem.add(l); });
  K.al = makeAlien(); K.al.root.scale.setScalar(0.92); root.add(K.al.root);
  K.hoseMat = new T.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.45, metalness: 0.05 }); K.hose = new T.Mesh(new T.TubeGeometry(new T.LineCurve3(new T.Vector3(0, 0, 0), new T.Vector3(0, 0.1, 0)), 2, 0.018, 8, false), K.hoseMat); K.hose.frustumCulled = false; root.add(K.hose);
  K.reel = new T.Group(); const reelM = new T.MeshStandardMaterial({ color: 0x3b2a5a, metalness: 0.5, roughness: 0.4 }); const drum = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.22, 24), K.hoseMat); drum.rotation.z = Math.PI / 2; K.reel.add(drum); for (const sx of [-1, 1]) { const w = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.02, 24), reelM); w.rotation.z = Math.PI / 2; w.position.x = sx * 0.12; K.reel.add(w); } K.reel.position.set(-2.6, 0.33, -4.6); root.add(K.reel);
  K.beamCore = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 1, 8, 1, true), new T.MeshBasicMaterial({ color: new T.Color(3, 2.6, 3.4), toneMapped: false })); K.beamGlow = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1, 12, 1, true), new T.MeshBasicMaterial({ color: 0xa040ff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false })); root.add(K.beamCore, K.beamGlow);
  K.impact = halo([[0, 'rgba(255,240,255,1)'], [0.25, 'rgba(210,140,255,0.8)'], [0.6, 'rgba(150,60,255,0.25)'], [1, 'rgba(120,40,255,0)']]); K.impact.renderOrder = 9; root.add(K.impact);
  K.zapGlow = new T.Mesh(new T.CircleGeometry(1.2, 32), new T.MeshBasicMaterial({ map: radialTex([[0, 'rgba(200,120,255,0.5)'], [1, 'rgba(160,60,255,0)']]), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); K.zapGlow.rotation.x = -Math.PI / 2; K.zapGlow.position.copy(HOLE).setY(0.02); root.add(K.zapGlow);
  K.sparks = new Streaks(1500, { shutter: 0.018, width: 0.006, grav: -9.8, drag: 0.5, fork: 1.0, hot: 0xfff2ff, mid: 0xd08cff, cold: 0x7a2cff });
  K.embers = new Streaks(400, { shutter: 0.01, width: 0.009, grav: 0.5, drag: 1.4, hot: 0xffe0a0, mid: 0xff8a3d, cold: 0xa02000 });
  K.water = new Streaks(1600, { shutter: 0.03, width: 0.008, grav: -9.8, drag: 0.15, hot: 0xffffff, mid: 0xcfeaff, cold: 0x9cc8ee, alpha: 0.75, stick: true });
  K.splash = new Streaks(600, { shutter: 0.02, width: 0.005, grav: -9.8, drag: 0.4, hot: 0xffffff, mid: 0xdff0ff, cold: 0xb0d4f0, alpha: 0.7 });
  K.dirtP = new Streaks(500, { shutter: 0.012, width: 0.012, grav: -9.8, drag: 0.3, hot: 0x8a6a4a, mid: 0x6a4e34, cold: 0x4a3524, alpha: 0.95, stick: true });
  K.glitter = new Streaks(1800, { shutter: 0.05, width: 0.06, grav: 1.2, drag: 0.6, hot: 0xffffff, mid: 0xb08cff, cold: 0x7cff6b, gain: 2.2 });
  K.fx = [K.sparks, K.embers, K.water, K.splash, K.dirtP, K.glitter]; K.fx.forEach((s) => root.add(s.mesh));
  const sTex = canvasTex(128, 128, (g) => { for (let i = 0; i < 26; i++) { const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 16 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } }); K.smoke = [];
  for (let i = 0; i < 40; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: sTex, color: 0x6a625a, transparent: true, opacity: 0, depthWrite: false })); sp.visible = false; root.add(sp); K.smoke.push({ sp, life: 0, max: 1, vx: 0, vy: 0, s0: 0.1, s1: 0.5, op: 0.3 }); }
  K.front = new T.Mesh(new T.TorusGeometry(1, 0.012, 8, 120), new T.MeshBasicMaterial({ color: new T.Color(0.75, 1.6, 0.7), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })); K.front.rotation.x = Math.PI / 2; root.add(K.front);
  root.traverse((o) => { o.userData.introDome = true; o.userData.noCull = true; o.userData.noFreeze = true; if (o.isMesh || o.isSprite) { o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m) m.fog = false; }); } });
  try { app.scene.add(root); root.visible = true; const R = app.renderer; const done = () => { root.visible = false; }; if (R.compileAsync) R.compileAsync(root, app.camera, app.scene).then(done, done); else { R.compile(root, app.camera, app.scene); done(); } } catch (e) { root.visible = false; }
  return K;
}

const tmp = new T.Vector3(), DOWN = new T.Vector3(0, -1, 0), qA = new T.Quaternion();
function aimArm(arm, target, w) { const par = arm.sh.parent; par.updateMatrixWorld(true); tmp.copy(target); par.worldToLocal(tmp); tmp.sub(arm.sh.position).normalize(); qA.setFromUnitVectors(DOWN, tmp); arm.sh.quaternion.slerp(qA, w); arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, 0, w); }
function walkPose(A, ph, amp) {
  A.legs.forEach((l, i) => { const s = Math.sin(ph + i * Math.PI); l.hip.rotation.x = -s * 0.5 * amp; l.knee.rotation.x = Math.max(0, Math.sin(ph + i * Math.PI + 1.2)) * 0.8 * amp; });
  A.arms.forEach((a, i) => { a.sh.rotation.set(Math.sin(ph + i * Math.PI) * 0.45 * amp, 0, (i ? -1 : 1) * 0.12); a.elbow.rotation.x = -0.25 - 0.2 * amp; });
  A.hips.position.y = 0.86 + Math.abs(Math.cos(ph)) * 0.035 * amp;
}

/* the arrival. cfg.mall = the mall group (buildMall); without it, or when you are not 60-450 m from the mall, it returns null so the page can fall back */
export function seedArrival(app, cfg = {}) {
  const G = cfg.mall || app.mallGroup; if (!G) return null;
  const R = app.renderer, scene = app.scene; /* Oct 22: your feet, not the XR camera. At 'sessionstart' the headset camera has no pose yet (it read as the world origin, the distance test failed and the seed never played in a real headset; the desktop simulator positions its camera early, so it passed there) */ const P0 = app.player.position.clone(); P0.y += 1.6;
  const mallC = new T.Vector3(); G.getWorldPosition(mallC); const dist = Math.hypot(mallC.x - P0.x, mallC.z - P0.z); if (dist < 60 || dist > 450) return null;
  const K = prepareSeed(app); const root = K.root; const A = K.al;
  const orig = { p: G.position.clone(), s: G.scale.clone(), vis: G.visible, nf: G.userData.noFreeze, nc: G.userData.noCull };
  let t = 0, done = false, started = false, fast = false; const S = { seedFree: null, acc: 0, wacc: 0, haps: new Set() };
  const begin = () => {
    started = true; const dx = mallC.x - P0.x, dz = mallC.z - P0.z, L = Math.hypot(dx, dz) || 1;
    /* the stage stands on the real ground at the seed (you may spawn on a raised pad) */ const gyf = app.opts && app.opts.groundY; const fy = gyf ? gyf(P0.x + dx / L * 3.2, P0.z + dz / L * 3.2) : app.player.position.y; root.position.set(P0.x, Number.isFinite(fy) ? fy : app.player.position.y, P0.z); root.rotation.set(0, Math.atan2(-dx / L, -dz / L), 0); root.visible = true; if (!root.parent) scene.add(root);
    G.visible = false; G.userData.noFreeze = true; G.userData.noCull = true; /* the engine caches each top-level bounding sphere (_cs): never let it cache the seedling */ K.fx.forEach((f) => f.clear()); K.smoke.forEach((s) => { s.life = 0; s.sp.visible = false; });
  };
  const restoreMall = () => { G.position.copy(orig.p); G.scale.copy(orig.s); G.visible = orig.vis; G.userData.noFreeze = orig.nf; G.userData.noCull = orig.nc; delete G.userData._cs; G.updateMatrixWorld(true); }; /* (the mall floats ±0.35 m on its own updater; it runs before this one, so the growth wins every frame and the float resumes after) */
  const hap = (key, a, ms) => { if (S.haps.has(key)) return; S.haps.add(key); try { cfg.haptic && cfg.haptic(a, ms); } catch (e) { } };
  const smoke = (pos, o) => { const s = K.smoke.find((x) => x.life <= 0); if (!s) return; Object.assign(s, { life: o.life, max: o.life, vx: rr(-0.05, 0.05), vy: o.vy, s0: o.s0, s1: o.s1, op: o.op }); s.sp.position.copy(pos); s.sp.material.color.set(o.col); s.sp.visible = true; };
  const seedW = new T.Vector3(), lp = new T.Vector3();
  const fx = (dt) => {
    if (done) return; if (!started) begin(); dt = Math.min(dt, 0.05); t += dt; if (fast && t < TL.grow1) t = TL.grow1;
    const inLocal = (v) => root.worldToLocal(v);
    /* the alien's path and pose (stage space: you at the origin, the mall straight ahead down -Z) */
    let pos, yaw, walking = 0; const ph = t * 7.5; const facing = Math.atan2(HOLE.x - ALIEN_AT.x, HOLE.z - ALIEN_AT.z); const asideYaw = Math.atan2(ALIEN_ASIDE.x - ALIEN_AT.x, ALIEN_ASIDE.z - ALIEN_AT.z);
    if (t < TL.walk1) { const w = Math.min(1, t / (TL.walk1 - 0.15)); pos = new T.Vector3(lerp(-5.2, ALIEN_AT.x, w), 0, lerp(-5.0, ALIEN_AT.z, w)); yaw = lerp(Math.PI / 2 - 0.1, facing, smooth(TL.walk1 - 0.5, TL.walk1, t)); walking = 1 - smooth(TL.walk1 - 0.25, TL.walk1, t); }
    else if (t < TL.step0) { pos = ALIEN_AT.clone(); yaw = facing; }
    else { const w = smooth(TL.step0, TL.step1, t); pos = ALIEN_AT.clone().lerp(ALIEN_ASIDE, w); const look = Math.atan2(HOLE.x - pos.x, HOLE.z - pos.z) - 0.2; yaw = t < TL.step0 + 0.15 ? lerp(facing, asideYaw, smooth(TL.step0, TL.step0 + 0.15, t)) : t < TL.step1 ? lerp(asideYaw, look, smooth(TL.step1 - 0.3, TL.step1, t)) : look; walking = t < TL.step1 - 0.15 ? 1 : 1 - smooth(TL.step1 - 0.15, TL.step1, t); }
    A.root.position.copy(pos); A.root.rotation.y = yaw; walkPose(A, ph, walking);
    if (walking < 0.05) { A.legs.forEach((l) => { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }); A.hips.position.y = 0.86 + Math.sin(t * 2.2) * 0.006; A.arms.forEach((a, i) => { a.sh.rotation.set(0.05, 0, (i ? -1 : 1) * 0.1); a.elbow.rotation.x = -0.2; }); }
    const crouch = smooth(TL.seed0, TL.seed0 + 0.35, t) * (1 - smooth(TL.cover1 - 0.1, TL.cover1 + 0.2, t)); A.hips.position.y -= 0.24 * crouch; A.legs.forEach((l) => { l.hip.rotation.x += -0.85 * crouch; l.knee.rotation.x += 1.45 * crouch; }); A.spine.rotation.x = 0.55 * crouch; A.head.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const fwd = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); const W = (v) => root.localToWorld(v.clone());
    /* gun */
    A.gun.visible = t > TL.walk1 - 0.1 && t < TL.seed0 - 0.05; const aimW = smooth(TL.walk1, TL.fire0, t) * (1 - smooth(TL.fire1, TL.seed0, t));
    if (aimW > 0) { aimArm(A.arms[1], W(pos.clone().addScaledVector(fwd, 0.9).add(new T.Vector3(0.25, 0.35, 0))), aimW); A.head.rotation.x = 0.35 * aimW; }
    const firing = t >= TL.fire0 && t < TL.fire1; root.updateMatrixWorld(true);
    const muzzle = inLocal(A.muzzle.getWorldPosition(new T.Vector3())); const wob = 0.12 * (1 - smooth(TL.fire0, TL.fire1, t)); const hit = HOLE.clone().add(new T.Vector3(Math.cos(t * 23) * wob, 0.01, Math.sin(t * 23) * wob));
    K.beamCore.visible = K.beamGlow.visible = K.impact.visible = firing; K.zapGlow.visible = firing;
    if (firing) { hap('zap', 0.4, 1100); const d = hit.clone().sub(muzzle), Ln = d.length(); const mid = muzzle.clone().add(hit).multiplyScalar(0.5); const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); for (const b of [K.beamCore, K.beamGlow]) { b.position.copy(mid); b.quaternion.copy(q); b.scale.set(1, Ln, 1); } K.beamGlow.scale.x = K.beamGlow.scale.z = 0.8 + Math.random() * 0.5; K.impact.position.copy(hit).setY(0.05); K.impact.scale.setScalar(rr(0.3, 0.45)); K.zapGlow.material.opacity = rr(0.6, 1);
      S.acc += 800 * dt; while (S.acc >= 1) { S.acc -= 1; const a = Math.random() * Math.PI * 2, sp = rr(1.5, 5.5); K.sparks.spawn(hit.x, 0.02, hit.z, Math.cos(a) * sp * 0.7, rr(1.5, 4.5), Math.sin(a) * sp * 0.7, rr(0.2, 0.7), rr(0.85, 1)); }
      if (Math.random() < dt * 40) K.embers.spawn(hit.x + rr(-0.1, 0.1), 0.02, hit.z + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(0.3, 0.8), rr(-0.2, 0.2), rr(0.8, 1.6), 0.8);
      if (Math.random() < dt * 18) smoke(hit.clone().setY(0.08), { life: 2.2, vy: 0.35, s0: 0.12, s1: 0.8, op: 0.35, col: 0x4a4048 }); }
    const dig = smooth(TL.fire0 + 0.1, TL.fire1, t), cover = smooth(TL.cover0, TL.cover1, t), growM = smooth(TL.grow0, TL.grow0 + 1.4, t);
    K.burn.visible = dig > 0 && growM < 1; K.burn.scale.setScalar(0.3 + 0.7 * dig); K.burn.material.opacity = 1 - 0.75 * cover; K.hole.visible = dig > 0 && cover < 1; K.hole.scale.setScalar(Math.max(0.01, dig * (1 - cover))); K.rim.visible = dig > 0 && cover < 0.98; K.rim.scale.setScalar(Math.max(0.01, dig * (1 - cover * 0.6))); K.rimMat.emissiveIntensity = 3 * dig * Math.exp(-Math.max(0, t - TL.fire1) / 0.9);
    K.mound.visible = cover > 0 && growM < 1; K.mound.scale.set(0.3 * (0.6 + 0.4 * cover), 0.13 * cover * (1 - growM), 0.3 * (0.6 + 0.4 * cover));
    /* the seed */
    if (t > TL.seed0 + 0.15 && t < TL.drop) { aimArm(A.arms[1], W(HOLE.clone().add(new T.Vector3(0, 0.05, 0))), smooth(TL.seed0, TL.seed0 + 0.4, t)); root.updateMatrixWorld(true); }
    if (t < TL.seed0 + 0.2) K.seed.visible = false;
    else if (t < TL.drop) { K.seed.visible = true; K.seed.position.copy(inLocal(A.arms[1].hand.getWorldPosition(new T.Vector3()))); K.seed.position.y -= 0.07; S.seedFree = null; }
    else { if (!S.seedFree) S.seedFree = { p: K.seed.position.clone(), v: new T.Vector3((HOLE.x - K.seed.position.x) * 2.2, 0.2, (HOLE.z - K.seed.position.z) * 2.2) }; const f = S.seedFree; if (f.p.y > -0.05) { f.v.y -= 9.8 * dt; f.p.addScaledVector(f.v, dt); if (f.p.y < -0.03) { f.p.y = -0.03; f.v.set(0, 0, 0); hap('plink', 0.3, 40); } } K.seed.position.copy(f.p); K.seed.visible = cover < 0.6; }
    K.seedHalo.visible = K.seed.visible || (cover > 0 && t < TL.grow0 + 0.3); K.seedHalo.position.copy(K.seed.visible ? K.seed.position : HOLE.clone().setY(0.1)); K.seedHalo.scale.setScalar((K.seed.visible ? 0.2 : 0.35 * smooth(TL.water0, TL.water1, t)) * (0.9 + 0.1 * Math.sin(t * 9)));
    /* covering */
    if (t > TL.cover0 && t < TL.cover1) { const sw = Math.sin((t - TL.cover0) * 14); aimArm(A.arms[0], W(HOLE.clone().add(new T.Vector3(sw * 0.2 - 0.1, 0.02, 0.05))), 0.9); aimArm(A.arms[1], W(HOLE.clone().add(new T.Vector3(-sw * 0.2 + 0.1, 0.02, 0.05))), 0.9); root.updateMatrixWorld(true); if (Math.random() < dt * 120) { const a = Math.random() * Math.PI * 2; K.dirtP.spawn(HOLE.x + Math.cos(a) * 0.32, 0.03, HOLE.z + Math.sin(a) * 0.32, -Math.cos(a) * rr(0.4, 1.0), rr(0.6, 1.5), -Math.sin(a) * rr(0.4, 1.0), rr(0.4, 0.8), 1); } }
    /* hose + water */
    const hoseOn = t > TL.hose0 && t < TL.step0 + 0.2; A.nozzle.visible = hoseOn; K.hose.visible = hoseOn;
    if (hoseOn) { aimArm(A.arms[1], W(pos.clone().addScaledVector(fwd, 1.0).add(new T.Vector3(0.2, 0.75, 0))), smooth(TL.hose0, TL.hose0 + 0.25, t)); root.updateMatrixWorld(true);
      const he = inLocal(A.hoseEnd.getWorldPosition(new T.Vector3())), reel = K.reel.position; const mid = new T.Vector3(lerp(he.x, reel.x, 0.4), 0.03, lerp(he.z, reel.z, 0.5) + 0.35);
      const c = new T.CatmullRomCurve3([he.clone(), he.clone().add(new T.Vector3(-0.08, -0.35, -0.05)), new T.Vector3(he.x - 0.25, 0.05, he.z + 0.1), mid, new T.Vector3(reel.x + 0.15, 0.1, reel.z + 0.2), new T.Vector3(reel.x + 0.05, 0.3, reel.z + 0.26)]);
      K.hose.geometry.dispose(); K.hose.geometry = new T.TubeGeometry(c, 60, 0.018, 8, false); }
    if (t > TL.water0 && t < TL.water1) { hap('water', 0.15, 1000); const sp = inLocal(A.spout.getWorldPosition(new T.Vector3())), sp2 = inLocal(A.nozzle.localToWorld(new T.Vector3(0, -0.4, 0))); const dir = sp2.sub(sp).normalize(); S.wacc += 600 * dt; while (S.wacc >= 1) { S.wacc -= 1; const s = rr(1.9, 2.4); K.water.spawn(sp.x, sp.y, sp.z, dir.x * s + rr(-0.12, 0.12), dir.y * s + rr(0.9, 1.3), dir.z * s + rr(-0.12, 0.12), rr(0.6, 1.0), 1); } }
    for (let i = 0; i < K.water.N; i++) { if (K.water.life[i] > 0 && K.water.life[i] <= 0.05 && K.water.p[i * 3 + 1] < 0.02 && Math.random() < 0.5) { const j = i * 3; for (let k = 0; k < 2; k++) K.splash.spawn(K.water.p[j], 0.02, K.water.p[j + 2], rr(-0.6, 0.6), rr(0.6, 1.4), rr(-0.6, 0.6), rr(0.15, 0.35), 1); K.water.life[i] = 0; } }
    const sprout = smooth(TL.sprout0, TL.grow0 + 0.1, t) * (1 - smooth(TL.grow0 + 0.3, TL.grow0 + 0.8, t)); K.stem.visible = sprout > 0.001; K.stem.scale.setScalar(Math.max(0.001, sprout)); K.stem.rotation.y = t * 0.8;
    /* the REAL mall grows from the seed: an organic stretch (height trails the spread), from the seed to its own place */
    const gu = clamp01((t - TL.grow0) / (TL.grow1 - TL.grow0)); const ge = gu < 1 ? 1 - Math.pow(1 - gu, 2.2) : 1; const s0 = 0.004, s = s0 * Math.pow(1 / s0, ge);
    seedW.copy(W(HOLE)); const k = (s - s0) / (1 - s0); const ry = gu >= 1 ? 1 : Math.min(1, 0.25 + 1.1 * smooth(0, 0.85, gu));
    if (t > TL.grow0 + 0.15) { G.visible = orig.vis; G.position.set(lerp(seedW.x, orig.p.x, k), lerp(seedW.y + 0.1, orig.p.y, k), lerp(seedW.z, orig.p.z, k)); G.scale.set(orig.s.x * s, orig.s.y * s * ry, orig.s.z * s); if (gu > 0) hap('grow', 0.25, 4400); }
    lp.copy(inLocal(G.getWorldPosition(new T.Vector3())));
    K.front.visible = gu > 0 && gu < 1; K.front.position.set(lp.x, 200 * s * ry * 0.98, lp.z); K.front.scale.setScalar(Math.max(0.01, 70 * s)); K.front.material.opacity = 0.9 * (1 - smooth(0.8, 1, gu));
    if (gu > 0 && gu < 1) { K.glitter.o.swirl = { x: lp.x, z: lp.z, k: 1.2 }; K.glitter.mat.uniforms.uWidth.value = 0.004 + 0.1 * s; for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) { const a = Math.random() * Math.PI * 2, r = 85 * s * rr(0.6, 1.1); K.glitter.spawn(lp.x + Math.cos(a) * r, rr(0, 200 * s * ry), lp.z + Math.sin(a) * r, -Math.sin(a) * 60 * s, rr(20, 80) * s, Math.cos(a) * 60 * s, rr(0.5, 1.2), rr(0.3, 0.75)); } }
    if (gu >= 1) { restoreMall(); H.active = false; hap('done', 0.7, 120); }
    /* the alien looks up, then waves */
    if (t > TL.step1) { const up = smooth(TL.grow0, TL.grow0 + 2, t); A.head.rotation.x = -0.45 * up; A.spine.rotation.x = -0.08 * up; }
    if (t > TL.wave0) { const w = smooth(TL.wave0, TL.wave0 + 0.3, t); A.arms[1].sh.rotation.set(0, 0, -2.6 * w); A.arms[1].elbow.rotation.x = 0; A.arms[1].elbow.rotation.z = Math.sin(t * 9) * 0.5 * w; A.head.rotation.y = -0.5 * w; A.root.rotation.y = lerp(A.root.rotation.y, Math.atan2(-A.root.position.x, -A.root.position.z), w * 0.7); } else A.arms[1].elbow.rotation.z = 0;
    K.fx.forEach((f) => f.step(dt));
    for (const s2 of K.smoke) { if (s2.life <= 0) { s2.sp.visible = false; continue; } s2.life -= dt; const kk = 1 - s2.life / s2.max; s2.sp.position.x += s2.vx * dt; s2.sp.position.y += s2.vy * dt; s2.sp.scale.setScalar(s2.s0 + (s2.s1 - s2.s0) * Math.sqrt(kk)); s2.sp.material.opacity = s2.op * smooth(0, 0.12, kk) * (1 - kk); }
    if (t >= TL.end || (fast && t >= TL.grow1 + 0.6)) H.done();
  };
  const H = {
    active: true, card: false, parts: K, k: () => t,
    skip: () => { if (fast || done) return; fast = true; H.active = false; root.visible = false; },
    dismiss: () => { },
    done: () => { if (done) return; done = true; H.active = false; app.updaters = app.updaters.filter((u) => u !== fx); restoreMall(); root.visible = false; root.position.y = -500; try { if (cfg.onDone) cfg.onDone(); } catch (e) { } },
  };
  app.onUpdate(fx); return H;
}
