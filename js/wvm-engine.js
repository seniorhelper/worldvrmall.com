/* ============================================================
   World VR Mall — shared engine  (worldvrmall.com)
   One engine, every page: outside world, mall, park, stores.
   Three.js r160 (ES modules via import map in each page).
   Runs on phone, laptop, and WebXR headsets from one URL.
   ============================================================ */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

export { THREE };
export const WVM_VERSION = '4';
export const LANG = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').slice(0, 2).toLowerCase();
/* Pick a language variant: value may be a string/array or an object keyed by language code. */
export function L(v) { if (v && typeof v === 'object' && !Array.isArray(v)) return v[LANG] || v.en || Object.values(v)[0]; return v; }

/* ------------------------------------------------------------
   Small helpers
------------------------------------------------------------ */
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* A canvas-text texture for signs, banners, price tags, labels. */
export function makeTextTexture(lines, opts = {}) {
  const {
    w = 1024, h = 512, bg = '#0b1a3a', fg = '#ffffff', accent = '#38f0ff',
    font = 'bold 72px Poppins, Segoe UI, Arial, sans-serif', pad = 40, radius = 40,
    align = 'center', glow = true, border = accent, lineGap = 1.15, small = null,
  } = opts;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  // background
  g.fillStyle = bg;
  roundRect(g, 0, 0, w, h, radius); g.fill();
  if (border) { g.lineWidth = 12; g.strokeStyle = border; roundRect(g, 6, 6, w - 12, h - 12, radius); g.stroke(); }
  g.textAlign = align; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  g.font = font;
  const m = /(\d+)px/.exec(font); const size = m ? parseInt(m[1], 10) : 64;
  const total = arr.length * size * lineGap;
  let y = h / 2 - total / 2 + size * lineGap / 2;
  const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
  for (const line of arr) {
    if (glow) { g.shadowColor = accent; g.shadowBlur = 24; }
    g.fillStyle = fg; g.fillText(line, x, y, w - pad * 2);
    g.shadowBlur = 0;
    y += size * lineGap;
  }
  if (small) {
    g.font = 'bold 34px Poppins, Segoe UI, Arial, sans-serif'; g.fillStyle = accent;
    g.fillText(small, w / 2, h - pad, w - pad * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* A flat sign (plane) with text, optional posts. */
export function makeSign(lines, opts = {}) {
  const { width = 6, height = 3, posts = true, postHeight = 2.5, double = true } = opts;
  const tex = makeTextTexture(lines, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: double ? THREE.DoubleSide : THREE.FrontSide, transparent: true });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  const g = new THREE.Group();
  plane.position.y = postHeight + height / 2;
  g.add(plane);
  if (posts) {
    const pm = new THREE.MeshStandardMaterial({ color: 0x9aa7c7, metalness: 0.7, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, postHeight + height, 8), pm);
      p.position.set(sx * (width / 2 - 0.3), (postHeight + height) / 2, -0.06);
      g.add(p);
    }
  }
  g.userData.plane = plane;
  return g;
}

/* Floating text sprite (labels, affirmations, fun facts). */
export function makeSprite(text, opts = {}) {
  const { scale = 4, bg = 'rgba(8,20,50,0.85)', fg = '#fff', accent = '#7cf8ff', font = 'bold 56px Poppins, Segoe UI, Arial' } = opts;
  const tex = makeTextTexture(text, { w: 1024, h: 256, bg, fg, accent, font, radius: 120, border: accent, glow: true });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale / 4, 1);
  return s;
}

/* ------------------------------------------------------------
   A simple low-poly person (NPC + player avatar)
------------------------------------------------------------ */
const skinTones = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac, 0xd8a27a, 0x7a4a2a];
const hairColors = { blonde: 0xd9b36c, brown: 0x4a2e15, black: 0x1a1a1a, red: 0xb5432b, grey: 0x9a9a9a, white: 0xf0f0f0, auburn: 0x7a3b1e };
const shirtColors = [0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff, 0xff8a3d, 0xffffff, 0x2f6bff, 0x1e2a4a, 0x9ad0ff, 0xf2b5d4, 0x2b8a3e];
/* A varied low-poly person. Every option is random unless given:
   age: 'kid' | 'adult' | 'senior'; hairStyle: 'short' | 'long' | 'ponytail' | 'bald' | 'bun' | 'curly'; dress: true for a dress instead of pants. */
export function makePerson(opts = {}) {
  const age = opts.age || pick(['adult', 'adult', 'adult', 'adult', 'kid', 'senior']);
  const o = Object.assign({
    shirt: pick(shirtColors), pants: pick([0x1e2a4a, 0x2b2b2b, 0x4a3b8c, 0x3a6ea5, 0x6b4f2a, 0x8a1c3a, 0x556b2f]),
    skin: pick(skinTones), hair: age === 'senior' ? pick([hairColors.grey, hairColors.white]) : pick(Object.values(hairColors).slice(0, 4).concat([hairColors.auburn])),
    hairStyle: pick(['short', 'short', 'long', 'ponytail', 'curly', 'bun', age === 'senior' ? 'bald' : 'short']), dress: Math.random() < 0.3,
    faceTex: null, bag: Math.random() < 0.5, hat: Math.random() < 0.12, glasses: age === 'senior' ? Math.random() < 0.6 : Math.random() < 0.15, beard: Math.random() < 0.12,
    scale: age === 'kid' ? rand(0.55, 0.72) : age === 'senior' ? rand(0.9, 1.0) : rand(0.92, 1.1),
  }, opts);
  const g = new THREE.Group();
  const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
  const skinM = M(o.skin), hairM = M(o.hair), shirtM = M(o.shirt), pantsM = M(o.pants);
  // legs / dress
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.55, 4, 8);
  const lL = new THREE.Mesh(legGeo, o.dress ? skinM : pantsM); lL.position.set(-0.14, 0.45, 0);
  const lR = lL.clone(); lR.position.x = 0.14;
  if (o.dress) { const dr = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 12, 1, true), M(o.pants, { side: THREE.DoubleSide })); dr.position.y = 0.72; g.add(dr); }
  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), shirtM); body.position.y = 1.12;
  // arms (sleeves + hands)
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
  const aL = new THREE.Mesh(armGeo, shirtM); aL.position.set(-0.38, 1.12, 0);
  const aR = aL.clone(); aR.position.x = 0.38;
  for (const a of [aL, aR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skinM); hand.position.y = -0.34; a.add(hand); }
  // head + face (proud of the sphere so it reads from the front)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skinM); head.position.y = 1.72;
  const face = new THREE.Group(); face.position.set(0, 1.72, 0); g.add(face);
  if (o.faceTex && o.portrait) {
    // oval portrait (head + shoulders) replaces the head; double-sided so it reads from behind too
    head.visible = false; o.hairStyle = 'bald';
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.06), new THREE.MeshBasicMaterial({ map: o.faceTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.2 })); fm.position.set(0, -0.2, 0.02); face.add(fm); g.userData.face = fm; g.userData.portrait = true;
  } else if (o.faceTex) {
    const fm = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: o.faceTex, transparent: true })); fm.position.set(0, 0, 0.215); face.add(fm); g.userData.face = fm;
  } else {
    const eyeM = M(0xffffff, { roughness: 0.3 }), pupM = M(0x111111);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeM); e.position.set(sx * 0.085, 0.04, 0.215); face.add(e); const pu = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pupM); pu.position.set(sx * 0.085, 0.04, 0.252); face.add(pu); const br = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), hairM); br.position.set(sx * 0.085, 0.1, 0.225); br.rotation.z = sx * -0.15; face.add(br); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), skinM); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, 0.255); face.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI), M(0xb03a4a)); smile.position.set(0, -0.07, 0.22); smile.rotation.z = Math.PI; face.add(smile);
    if (o.glasses) { for (const sx of [-1, 1]) { const gl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16), M(0x222222, { metalness: 0.6 })); gl.position.set(sx * 0.085, 0.04, 0.24); face.add(gl); } }
    if (o.beard && age !== 'kid') { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), hairM); bd.position.set(0, -0.04, 0.09); bd.scale.set(1, 0.9, 1); face.add(bd); }
  }
  // hair
  if (o.hairStyle !== 'bald') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); cap.position.y = 1.74; g.add(cap);
    if (o.hairStyle === 'long') { const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), hairM); back.position.set(0, 1.45, -0.12); back.scale.set(1, 1, 0.55); g.add(back); }
    if (o.hairStyle === 'ponytail') { const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.35, 4, 8), hairM); pt.position.set(0, 1.5, -0.26); pt.rotation.x = 0.35; g.add(pt); g.userData.ponytail = pt; }
    if (o.hairStyle === 'bun') { const bn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hairM); bn.position.set(0, 1.9, -0.18); g.add(bn); }
    if (o.hairStyle === 'curly') { for (let i = 0; i < 6; i++) { const cu = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hairM); const a = i / 6 * Math.PI * 2; cu.position.set(Math.cos(a) * 0.2, 1.9 + Math.sin(i) * 0.03, Math.sin(a) * 0.2 - 0.03); g.add(cu); } }
  } else if (!g.userData.portrait) { const fringe = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16, Math.PI), hairM); fringe.position.set(0, 1.7, -0.02); fringe.rotation.x = Math.PI / 2; fringe.rotation.z = Math.PI; g.add(fringe); }
  g.add(lL, lR, body, aL, aR, head);
  if (o.hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 12), M(pick([0xff4f79, 0x38f0ff, 0x1e2a4a, 0xffffff]))); h.position.y = 1.98; g.add(h); const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), h.material); brim.position.set(0, 1.92, 0.3); g.add(brim); }
  if (o.bag) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), M(pick([0xff4f79, 0x38f0ff, 0xffd23f, 0xffffff, 0x7cff6b])));
    b.position.set(0.5, 0.75, 0); g.add(b);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), M(0x222222)); hd.position.set(0.5, 0.92, 0); g.add(hd);
  }
  if (age === 'senior') { g.rotation.x = 0.06; }
  g.scale.setScalar(o.scale);
  g.userData.limbs = { lL, lR, aL, aR };
  g.userData.phase = Math.random() * 10; g.userData.age = age;
  return g;
}
/* Two-mesh rider for coaster cars (cheap). */
export function makeRider(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 6), new THREE.MeshStandardMaterial({ color: color || pick([0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff]) })); b.position.y = 0.35; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: pick(skinTones) })); h.position.y = 0.78; g.add(h);
  return g;
}
export function animatePerson(p, t, speed = 1) {
  const L = p.userData.limbs; if (!L) return;
  const s = Math.sin((t + p.userData.phase) * 8 * speed) * 0.55 * Math.min(1, speed);
  L.lL.rotation.x = s; L.lR.rotation.x = -s; L.aL.rotation.x = -s * 0.8; L.aR.rotation.x = s * 0.8;
  if (p.userData.ponytail) p.userData.ponytail.rotation.x = 0.35 + s * 0.3;
}

/* ------------------------------------------------------------
   The Engine
------------------------------------------------------------ */
export class WVM {
  constructor(opts = {}) {
    this.opts = Object.assign({
      title: 'World VR Mall', sky: '/images/sky.jpg', fog: 0x9fd3ff, fogNear: 60, fogFar: 420,
      spawn: new THREE.Vector3(0, 0, 20), spawnYaw: Math.PI, thirdPerson: true,
      groundY: () => 0, walkSpeed: 6.5, runSpeed: 11, worldName: 'Outside World', page: 'index',
      showSelfieOnFirstVisit: true, exposure: 1.0,
    }, opts);
    this.t = 0; this.clock = new THREE.Clock();
    this.updaters = []; this.hotspots = []; this.obstacles = []; this.npcs = [];
    this.keys = {}; this.moveVec = new THREE.Vector2(); this.running = false;
    this.yaw = this.opts.spawnYaw; this.pitch = -0.18; this.dist = this.opts.thirdPerson ? 6 : 0.01;
    this.targetDist = this.dist; this.walkTarget = null;
    this.zones = []; this.paused = false;
    this._build();
  }

  /* ----- setup ----- */
  _build() {
    const o = this.opts;
    document.body.classList.add('wvm');
    this._injectCSS();
    this._buildHUD();

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure;
    renderer.xr.enabled = true;
    renderer.domElement.id = 'wvm-canvas';
    this.stage.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(o.fog, o.fogNear, o.fogFar);
    const camera = this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 900);
    this.rig = new THREE.Group(); this.rig.add(camera); scene.add(this.rig);
    this.baseFov = 70;

    // lights
    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x4a6b3a, 0.9); scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(-120, 90, -160); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfe1ff, 0.35); fill.position.set(80, 40, 120); scene.add(fill);

    // loading manager → teleport bar
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (u, l, t) => this._progress(0.15 + 0.6 * (l / Math.max(1, t)));
    this.texLoader = new THREE.TextureLoader(this.manager);

    // sky
    this._loadSky(o.sky);

    // player
    this.player = new THREE.Group(); this.player.position.copy(o.spawn); scene.add(this.player);
    this._buildAvatar();

    // events
    this._bindInput();
    addEventListener('resize', () => this._resize());
    this._resize();

    // VR
    try {
      if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) { const btn = VRButton.createButton(renderer); btn.id = 'wvm-vr'; this.hud.appendChild(btn); } else this._vrBadge(); }).catch(() => this._vrBadge());
        renderer.xr.addEventListener('sessionstart', () => this._xrStart());
        renderer.xr.addEventListener('sessionend', () => this._xrEnd());
      }
    } catch (e) { this._vrBadge(); }
    if (!('xr' in navigator)) this._vrBadge();

    // shopping list + face from storage
    this.list = this._load('wvm_list', []);
    this._renderList();
  }

  _vrBadge() { if (this.hud.querySelector('.wvm-vrbadge')) return; const b = document.createElement('div'); b.className = 'wvm-vrbadge'; b.textContent = '🥽 Works on VR headsets too'; b.title = 'Open this same address in a headset browser and an Enter VR button appears'; this.hud.appendChild(b); }
  _loadSky(url) {
    this.texLoader.load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromEquirectangular(tex).texture; pm.dispose();
    }, undefined, () => { this.scene.background = new THREE.Color(0x87c6ff); });
  }

  _buildAvatar() {
    const saved = this._load('wvm_avatar', null);
    const faceData = localStorage.getItem('wvm_face');
    let faceTex = null;
    if (faceData) { const im = new Image(); im.src = faceData; faceTex = new THREE.Texture(im); faceTex.colorSpace = THREE.SRGBColorSpace; im.onload = () => { faceTex.needsUpdate = true; }; }
    if (this.avatar) this.player.remove(this.avatar);
    this.avatar = makePerson(Object.assign({ bag: false, faceTex, portrait: !!faceTex, age: 'adult', scale: 1, glasses: false, beard: false, dress: false, hairStyle: 'short', hair: 0x4a2e15, skin: 0xe0ac7e, shirt: 0x38f0ff, pants: 0x1e2a4a, hat: false }, saved || {}));
    this.avatar.visible = this.dist > 0.5;
    this.player.add(this.avatar);
    this.faceTex = faceTex;
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  /* ----- public API for pages ----- */
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  addObstacle(x, z, r) { this.obstacles.push({ x, z, r }); }
  addBox(x, z, hw, hd) { this.obstacles.push({ x, z, hw, hd }); }
  _blocked(nx, nz) { for (const ob of this.obstacles) { if (ob.hw !== undefined) { if (Math.abs(nx - ob.x) < ob.hw && Math.abs(nz - ob.z) < ob.hd) return true; } else { const dx = nx - ob.x, dz = nz - ob.z; if (dx * dx + dz * dz < ob.r * ob.r) return true; } } return false; }
  addHotspot(obj, data) { obj.traverse(c => { c.userData.hotspot = data; }); this.hotspots.push(obj); return obj; }
  addZone(name, center, radius, build) { this.zones.push({ name, center, radius, build, built: false }); }
  addTrigger(x, z, r, fn) { (this.triggers = this.triggers || []).push({ x, z, r, fn, fired: false }); }
  /* Something you can DO when standing near it: shows a big green button with the label. */
  addInteractable(x, z, r, label, fn) { (this.interactables = this.interactables || []).push({ x, z, r, label, fn }); }
  _updateInteractables() {
    if (!this.interactables) return; const p = this.player.position; let best = null, bd = 1e9;
    for (const it of this.interactables) { const dx = p.x - it.x, dz = p.z - it.z, d = dx * dx + dz * dz; if (d < it.r * it.r && d < bd) { bd = d; best = it; } }
    if (this.ride || this.paused) best = null;
    if (best !== this._act) { this._act = best; this.actBtn.textContent = best ? best.label : ''; this.actBtn.classList.toggle('on', !!best); }
  }
  addNPC(person, path, opts = {}) {
    const n = { p: person, path, i: 0, speed: opts.speed || rand(1.2, 2.2), wait: 0, loop: opts.loop !== false, pause: opts.pause || 0 };
    person.position.copy(path[0]); this.scene.add(person); this.npcs.push(n); return n;
  }
  /* A ball you can kick by walking into it. bounds = {x1,z1,x2,z2} it stays inside. */
  addBall(mesh, radius, bounds) { (this.balls = this.balls || []).push({ m: mesh, r: radius, v: new THREE.Vector3(), b: bounds }); }
  _updateBalls(dt) {
    if (!this.balls) return; const p = this.player.position;
    for (const b of this.balls) {
      const dx = b.m.position.x - p.x, dz = b.m.position.z - p.z, d = Math.hypot(dx, dz);
      if (d < b.r + 0.75 && d > 0.001) { const k = this.moving ? 7 : 3; b.v.x = dx / d * k; b.v.z = dz / d * k; this.toast('⚽ Kick!', 700); }
      if (b.v.lengthSq() > 0.0001) {
        b.m.position.x += b.v.x * dt; b.m.position.z += b.v.z * dt; b.v.multiplyScalar(0.985);
        const q = b.b; if (q) { if (b.m.position.x < q.x1 + b.r) { b.m.position.x = q.x1 + b.r; b.v.x *= -0.8; } if (b.m.position.x > q.x2 - b.r) { b.m.position.x = q.x2 - b.r; b.v.x *= -0.8; } if (b.m.position.z < q.z1 + b.r) { b.m.position.z = q.z1 + b.r; b.v.z *= -0.8; } if (b.m.position.z > q.z2 - b.r) { b.m.position.z = q.z2 - b.r; b.v.z *= -0.8; } }
        for (const ob of this.obstacles) { if (ob.hw !== undefined) continue; const ox = b.m.position.x - ob.x, oz = b.m.position.z - ob.z, od = Math.hypot(ox, oz); if (od < ob.r + b.r && od > 0.001) { b.m.position.x = ob.x + ox / od * (ob.r + b.r); b.m.position.z = ob.z + oz / od * (ob.r + b.r); const n = new THREE.Vector3(ox / od, 0, oz / od); const dot = b.v.dot(n); b.v.addScaledVector(n, -2 * dot).multiplyScalar(0.8); } }
        b.m.rotation.x += b.v.z * dt / b.r; b.m.rotation.z -= b.v.x * dt / b.r;
      }
      b.m.position.y = this.opts.groundY(b.m.position.x, b.m.position.z) + b.r;
    }
  }
  /* Drive a cart: player moves 2.5x faster, the cart mesh follows, avatar rides in it. */
  driveCart(cart, opts = {}) {
    if (this.vehicle) return; this.vehicle = { m: cart, speed: opts.speed || 2.6 }; this.avatar.position.y = 0.5; this.toast(opts.label || '🚗 Vroom. Tap the button to hop out.', 3000);
    const it = { x: 0, z: 0, r: 1e9, label: '🚪 Hop out of the cart', fn: (a) => { const v = a.vehicle; a.vehicle = null; a.avatar.position.y = 0; a.interactables = a.interactables.filter(i => i !== it); v.m.position.copy(a.player.position); v.m.position.x += 2; v.m.rotation.y = a.avatar.rotation.y; if (v.park) v.park(v); } }; this.addInteractable(it.x, it.z, it.r, it.label, it.fn);
  }
  /* Fade + navigate to another page (portal). */
  go(url, label = 'Teleporting…') {
    try { sessionStorage.setItem('wvm_from', this.opts.page); } catch (e) { }
    this.fade.classList.add('on'); this.fade.textContent = label;
    setTimeout(() => { location.href = url; }, 550);
  }
  photoBooth(caption = 'Making history at the World\'s 1st Global VR Mall 🌍', sub = 'worldvrmall.com') {
    try {
      this.renderer.render(this.scene, this.camera); const src = this.renderer.domElement;
      const c = document.createElement('canvas'); const W = 1080, H = Math.round(1080 * src.height / src.width); c.width = W; c.height = H; const g = c.getContext('2d');
      g.drawImage(src, 0, 0, W, H);
      const band = Math.round(H * 0.16); g.fillStyle = 'rgba(5,11,28,0.82)'; g.fillRect(0, H - band, W, band);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(band * 0.28)}px Poppins, Segoe UI, Arial`; g.fillText(caption, 36, H - band * 0.62, W - 300);
      g.fillStyle = '#38f0ff'; g.font = `bold ${Math.round(band * 0.2)}px Poppins, Segoe UI, Arial`; g.fillText(sub, 36, H - band * 0.25);
      const face = localStorage.getItem('wvm_face');
      const finish = () => { const url = c.toDataURL('image/jpeg', 0.9); this.popup('Your photo 📸', `<img src="${url}" style="width:100%;border-radius:12px"><p class="muted">Long-press or tap Save to keep it. Post it. Tag the mall.</p>`, [{ label: '⬇️ Save photo', fn: () => { const a = document.createElement('a'); a.href = url; a.download = 'world-vr-mall-photo.jpg'; document.body.appendChild(a); a.click(); a.remove(); }, keep: true }]); };
      if (face) { const im = new Image(); im.onload = () => { const fw = Math.round(band * 1.1), fh = Math.round(fw * 4 / 3); g.drawImage(im, W - fw - 30, H - fh - 20, fw, fh); finish(); }; im.onerror = finish; im.src = face; } else finish();
    } catch (e) { this.toast('Photo booth needs a moment; try again.'); }
  }
  toast(msg, ms = 2600) {
    const el = this.toastEl; el.textContent = msg; el.classList.add('on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.classList.remove('on'), ms);
  }
  popup(title, html, actions = []) {
    this.pop.querySelector('h3').textContent = title;
    this.pop.querySelector('.wvm-pop-body').innerHTML = html;
    const ab = this.pop.querySelector('.wvm-pop-actions'); ab.innerHTML = '';
    for (const a of actions) { const b = document.createElement('button'); b.className = 'wvm-btn' + (a.primary ? ' primary' : ''); b.textContent = a.label; b.onclick = () => { if (a.href) { if (a.newTab) window.open(a.href, '_blank', 'noopener'); else this.go(a.href, a.label); } else if (a.fn) a.fn(); if (!a.keep) this.closePopup(); }; ab.appendChild(b); }
    const close = document.createElement('button'); close.className = 'wvm-btn ghost'; close.textContent = 'Close'; close.onclick = () => this.closePopup(); ab.appendChild(close);
    this.pop.classList.add('on'); this.paused = true;
  }
  closePopup() { this.pop.classList.remove('on'); this.paused = false; }
  /* Shopping list */
  addToList(item) {
    if (this.list.find(i => i.url === item.url)) { this.toast('Already on your list 👍'); return; }
    this.list.push(item); this._save('wvm_list', this.list); this._renderList();
    this.toast(`Added “${item.title}” to your list 🛍️`);
    this.listBtn.classList.add('bump'); setTimeout(() => this.listBtn.classList.remove('bump'), 500);
  }
  removeFromList(url) { this.list = this.list.filter(i => i.url !== url); this._save('wvm_list', this.list); this._renderList(); }
  _renderList() {
    const body = this.listPanel.querySelector('.wvm-list-body'); body.innerHTML = '';
    this.listBtn.querySelector('span').textContent = this.list.length;
    if (!this.list.length) { body.innerHTML = '<p class="muted">Your list is empty. Walk into any store and tap <b>Add to list</b> on a product. It saves on this device and follows you through the whole mall.</p>'; return; }
    for (const i of this.list) {
      const row = document.createElement('div'); row.className = 'wvm-list-row';
      row.innerHTML = `<div><b>${esc(i.title)}</b><small>${esc(i.store || '')}${i.price ? ' · ' + esc(i.price) : ''}</small></div>`;
      const buy = document.createElement('a'); buy.href = i.url; buy.target = '_blank'; buy.rel = 'noopener'; buy.className = 'wvm-btn small primary'; buy.textContent = 'Buy';
      const rm = document.createElement('button'); rm.className = 'wvm-btn small ghost'; rm.textContent = '✕'; rm.onclick = () => this.removeFromList(i.url);
      row.append(buy, rm); body.appendChild(row);
    }
    const foot = document.createElement('div'); foot.className = 'wvm-list-foot';
    const copy = document.createElement('button'); copy.className = 'wvm-btn small'; copy.textContent = 'Copy list';
    copy.onclick = () => { navigator.clipboard?.writeText(this.list.map(i => `${i.title}${i.price ? ' — ' + i.price : ''}\n${i.url}`).join('\n\n')); this.toast('List copied 📋'); };
    const clear = document.createElement('button'); clear.className = 'wvm-btn small ghost'; clear.textContent = 'Clear';
    clear.onclick = () => { this.list = []; this._save('wvm_list', []); this._renderList(); };
    foot.append(copy, clear); body.appendChild(foot);
  }
  _load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  /* ----- loader / teleport bar ----- */
  _progress(p) { this._prog = Math.max(this._prog || 0, p); this.bar.style.width = Math.round(this._prog * 100) + '%'; }
  start(buildFn) {
    // fake-real teleport sequence
    const msgs = ['Locking on to your signature…', 'Beaming you to World VR Mall…', 'Re-assembling you, atom by atom…', 'Materializing shops from 6 continents…', 'Welcome. Have a great day!'];
    let mi = 0; this.loadMsg.textContent = msgs[0];
    const tick = setInterval(() => { mi = Math.min(msgs.length - 1, mi + 1); this.loadMsg.textContent = msgs[mi]; }, 700);
    this._progress(0.08);
    const done = () => {
      clearInterval(tick); this._progress(1);
      setTimeout(() => { this.loader.classList.add('off'); this._maybeSelfie(); }, 450);
    };
    Promise.resolve(buildFn(this)).then(() => {
      this._progress(0.9);
      setTimeout(done, 900);
    }).catch(err => { console.error(err); this.loadMsg.textContent = 'Something hiccuped. Refresh to try again.'; });
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /* ----- frame ----- */
  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (!this.paused) this._movePlayer(dt);
    this._updateCamera(dt);
    this._updateNPCs(dt);
    this._updateZones(); this._updateInteractables(); this._updateBalls(dt);
    if (this.triggers && !this.paused) { const p = this.player.position; for (const tr of this.triggers) { const dx = p.x - tr.x, dz = p.z - tr.z; const inside = dx * dx + dz * dz < tr.r * tr.r; if (inside && !tr.fired) { tr.fired = true; tr.fn(this); } else if (!inside) tr.fired = false; } }
    for (const u of this.updaters) u(dt, this.t);
    this.renderer.render(this.scene, this.camera);
  }

  _movePlayer(dt) {
    const o = this.opts, p = this.player;
    if (this.ride) { p.position.copy(this.ride.pos(this.t)); if (this.ride.yaw !== undefined) this.avatar.rotation.y = this.ride.yaw; animatePerson(this.avatar, this.t, 0); if (this.ride.until !== undefined && this.t > this.ride.until) { const r = this.ride; this.ride = null; if (r.done) r.done(this); } return; }
    if (this.locked) { animatePerson(this.avatar, this.t, this.walkTarget ? 1 : 0); }
    const mv = new THREE.Vector2(0, 0);
    if (this.keys.KeyW || this.keys.ArrowUp) mv.y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) mv.y -= 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mv.x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mv.x += 1;
    if (this.locked) mv.set(0, 0); else { mv.add(this.moveVec); if (this.xrMove) mv.add(this.xrMove); }
    let speed = (this.keys.ShiftLeft || this.keys.ShiftRight || this.running) ? o.runSpeed : o.walkSpeed; if (this.vehicle) speed *= this.vehicle.speed;
    if (mv.lengthSq() > 1) mv.normalize();
    // tap-to-walk
    if (this.walkTarget && mv.lengthSq() < 0.01) {
      const d = new THREE.Vector2(this.walkTarget.x - p.position.x, this.walkTarget.z - p.position.z);
      if (d.length() < 0.6) { this.walkTarget = null; } else {
        // convert world dir to camera-relative move
        const yaw = this.yaw; const dir = d.clone().normalize();
        const fwd = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw)); const right = new THREE.Vector2(-fwd.y, fwd.x);
        mv.set(dir.dot(right), dir.dot(fwd));
      }
    }
    this.moving = mv.lengthSq() > 0.001;
    if (this.moving) {
      const yaw = this.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const step = fwd.multiplyScalar(mv.y).add(right.multiplyScalar(mv.x)).multiplyScalar(speed * dt);
      const nx = p.position.x + step.x, nz = p.position.z + step.z;
      // obstacles (circles + boxes), with sliding
      if (!this._blocked(nx, nz)) { p.position.x = nx; p.position.z = nz; }
      else if (!this._blocked(nx, p.position.z)) { p.position.x = nx; }
      else if (!this._blocked(p.position.x, nz)) { p.position.z = nz; }
      // world bounds
      const B = this.opts.bounds || 600; p.position.x = clamp(p.position.x, -B, B); p.position.z = clamp(p.position.z, -B, B);
      // face avatar toward movement
      const ang = Math.atan2(step.x, step.z); this.avatar.rotation.y = lerpAngle(this.avatar.rotation.y, ang, 0.25);
    }
    p.position.y = o.groundY(p.position.x, p.position.z);
    if (this.vehicle) { const v = this.vehicle.m; v.position.copy(p.position); v.rotation.y = this.avatar.rotation.y; const L = this.avatar.userData.limbs; L.lL.rotation.x = L.lR.rotation.x = 1.3; L.aL.rotation.x = L.aR.rotation.x = -0.9; return; }
    animatePerson(this.avatar, this.t, this.moving ? (speed / o.walkSpeed) : 0);
  }

  _updateCamera(dt) {
    if (this.renderer.xr.isPresenting) { this.rig.position.copy(this.player.position); this.rig.rotation.y = this.yaw; return; }
    this.dist = lerp(this.dist, this.targetDist, 0.15);
    const first = this.dist < 0.6;
    this.avatar.visible = !first;
    const p = this.player.position;
    const eye = new THREE.Vector3(p.x, p.y + 1.65, p.z);
    if (first) {
      this.rig.position.copy(eye); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const off = new THREE.Vector3(Math.sin(this.yaw) * cp * this.dist, -sp * this.dist + 0.6, Math.cos(this.yaw) * cp * this.dist);
      const camPos = eye.clone().add(off);
      const gy = this.opts.groundY(camPos.x, camPos.z) + 0.4; if (camPos.y < gy) camPos.y = gy;
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0);
      this.rig.updateMatrixWorld(); this.camera.lookAt(eye);
    }
  }

  _updateNPCs(dt) {
    for (const n of this.npcs) {
      const p = n.p;
      if (n.wait > 0) { n.wait -= dt; animatePerson(p, this.t, 0); continue; }
      const tgt = n.path[(n.i + 1) % n.path.length];
      const d = new THREE.Vector3().subVectors(tgt, p.position); d.y = 0;
      const L = d.length();
      if (L < 0.3) { n.i = (n.i + 1) % n.path.length; if (!n.loop && n.i === n.path.length - 1) n.i = 0; n.wait = n.pause ? rand(0, n.pause) : 0; continue; }
      d.normalize(); p.position.addScaledVector(d, n.speed * dt);
      p.position.y = this.opts.groundY(p.position.x, p.position.z);
      p.rotation.y = lerpAngle(p.rotation.y, Math.atan2(d.x, d.z), 0.15);
      animatePerson(p, this.t, n.speed / 1.6);
    }
  }

  _updateZones() {
    const p = this.player.position;
    for (const z of this.zones) {
      if (z.built) continue;
      const dx = p.x - z.center.x, dz = p.z - z.center.z;
      if (dx * dx + dz * dz < z.radius * z.radius) { z.built = true; try { z.build(this); } catch (e) { console.error('zone', z.name, e); } }
    }
  }

  /* ----- input ----- */
  _bindInput() {
    const el = this.renderer.domElement;
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; this.keys[e.code] = true; if (e.code === 'KeyV') this.toggleView(); if (e.code === 'Escape') this.closePopup(); if (e.code === 'KeyL') this.toggleList(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    // pointer look
    let dragging = false, lx = 0, ly = 0, moved = 0, downT = 0, pinch0 = 0, fov0 = 70;
    const onDown = (x, y) => { dragging = true; lx = x; ly = y; moved = 0; downT = performance.now(); };
    const onMove = (x, y) => {
      if (!dragging) return; const dx = x - lx, dy = y - ly; lx = x; ly = y; moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.005; this.pitch = clamp(this.pitch - dy * 0.005, -1.45, 1.45);
    };
    const onUp = (x, y) => {
      dragging = false;
      if (moved < 8 && performance.now() - downT < 400) this._tap(x, y);
    };
    el.addEventListener('mousedown', e => { onDown(e.clientX, e.clientY); });
    addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    addEventListener('mouseup', e => { if (dragging) onUp(e.clientX, e.clientY); });
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) { dragging = false; pinch0 = dist2(e.touches); fov0 = this.camera.fov; }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) { const d = dist2(e.touches); this._zoom(fov0 * (pinch0 / d)); }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', e => { if (e.changedTouches.length && dragging) onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    el.addEventListener('wheel', e => { e.preventDefault(); this.targetDist = clamp(this.targetDist + e.deltaY * 0.01, 0.01, 18); if (this.targetDist < 2.2) this.targetDist = e.deltaY < 0 ? 0.01 : 2.2; if (this.targetDist > 0.6 && this.targetDist < 2.2) this.targetDist = 2.2; }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    this._buildJoystick();
  }
  _zoom(fov) { this.camera.fov = clamp(fov, 30, 100); this.camera.updateProjectionMatrix(); }
  toggleView() { this.targetDist = this.targetDist > 0.6 ? 0.01 : 5; this.toast(this.targetDist > 0.6 ? 'Third person 👀' : 'First person 🎯'); }
  _tap(x, y) {
    if (this.paused) return;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.hotspots, true);
    if (hits.length) { const h = hits[0].object.userData.hotspot; if (h) { this._activate(h, hits[0]); return; } }
    // walk-to: intersect ground plane at y≈player y
    const gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.player.position.y);
    const pt = new THREE.Vector3(); if (ray.ray.intersectPlane(gp, pt)) { this.walkTarget = pt; this._marker(pt); }
  }
  _activate(h, hit) {
    if (h.fn) { h.fn(this, hit); return; }
    if (h.go) { this.go(h.go, h.label || 'Entering…'); return; }
    if (h.title) this.popup(h.title, h.html || '', h.actions || []);
  }
  _marker(pt) {
    if (!this.markerMesh) { this.markerMesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.9, depthWrite: false })); this.markerMesh.rotation.x = -Math.PI / 2; this.scene.add(this.markerMesh); }
    this.markerMesh.position.set(pt.x, pt.y + 0.05, pt.z); this.markerMesh.visible = true; this.markerMesh.scale.setScalar(1.6);
    const start = this.t; this.onUpdate((dt) => { const k = this.t - start; if (k < 0.6) this.markerMesh.scale.setScalar(1.6 - k); else this.markerMesh.visible = false; });
  }

  /* joystick / dpad — draggable to anywhere, toggle between styles */
  _buildJoystick() {
    const pad = this.padEl = document.createElement('div'); pad.id = 'wvm-pad';
    pad.innerHTML = `<div class="wvm-pad-grip" title="Drag me anywhere">⋮⋮</div>
      <div class="wvm-stick"><div class="wvm-knob"></div></div>
      <div class="wvm-dpad"><button data-d="u">▲</button><button data-d="l">◀</button><button data-d="r">▶</button><button data-d="d">▼</button></div>
      <button class="wvm-pad-mode" title="Switch joystick / D-pad">⟲</button>`;
    this.stage.appendChild(pad);
    const mode = this._load('wvm_padmode', 'stick'); pad.dataset.mode = mode;
    pad.querySelector('.wvm-pad-mode').onclick = () => { pad.dataset.mode = pad.dataset.mode === 'stick' ? 'dpad' : 'stick'; this._save('wvm_padmode', pad.dataset.mode); this.moveVec.set(0, 0); };
    const pos = this._load('wvm_padpos', null); if (pos) { pad.style.left = pos.x + 'px'; pad.style.top = pos.y + 'px'; pad.style.right = 'auto'; pad.style.bottom = 'auto'; }
    // drag grip
    const grip = pad.querySelector('.wvm-pad-grip'); let gd = false, gx = 0, gy = 0;
    const gs = (x, y) => { gd = true; const r = pad.getBoundingClientRect(); gx = x - r.left; gy = y - r.top; };
    const gm = (x, y) => { if (!gd) return; const nx = clamp(x - gx, 0, innerWidth - pad.offsetWidth), ny = clamp(y - gy, 0, innerHeight - pad.offsetHeight); pad.style.left = nx + 'px'; pad.style.top = ny + 'px'; pad.style.right = 'auto'; pad.style.bottom = 'auto'; };
    const ge = () => { if (gd) { gd = false; const r = pad.getBoundingClientRect(); this._save('wvm_padpos', { x: r.left, y: r.top }); } };
    grip.addEventListener('mousedown', e => { gs(e.clientX, e.clientY); e.preventDefault(); }); addEventListener('mousemove', e => gm(e.clientX, e.clientY)); addEventListener('mouseup', ge);
    grip.addEventListener('touchstart', e => { gs(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    grip.addEventListener('touchmove', e => { gm(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false }); grip.addEventListener('touchend', ge);
    // stick
    const stick = pad.querySelector('.wvm-stick'), knob = pad.querySelector('.wvm-knob'); let sid = null;
    const sset = (x, y) => { const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (x - cx) / (r.width / 2), dy = (y - cy) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; this.moveVec.set(dx, -dy); this.running = L > 0.92; this.walkTarget = null; };
    const sclr = () => { knob.style.transform = ''; this.moveVec.set(0, 0); this.running = false; sid = null; };
    stick.addEventListener('touchstart', e => { sid = e.changedTouches[0].identifier; sset(e.changedTouches[0].clientX, e.changedTouches[0].clientY); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === sid) sset(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === sid) sclr(); });
    stick.addEventListener('mousedown', e => { sid = 'm'; sset(e.clientX, e.clientY); e.preventDefault(); }); addEventListener('mousemove', e => { if (sid === 'm') sset(e.clientX, e.clientY); }); addEventListener('mouseup', () => { if (sid === 'm') sclr(); });
    // dpad
    for (const b of pad.querySelectorAll('.wvm-dpad button')) {
      const d = b.dataset.d; const on = () => { this.walkTarget = null; if (d === 'u') this.moveVec.y = 1; if (d === 'd') this.moveVec.y = -1; if (d === 'l') this.moveVec.x = -1; if (d === 'r') this.moveVec.x = 1; }; const off = () => { if (d === 'u' || d === 'd') this.moveVec.y = 0; else this.moveVec.x = 0; };
      b.addEventListener('touchstart', e => { on(); e.preventDefault(); }, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    }
  }

  /* ----- WebXR ----- */
  _xrStart() {
    this.hud.classList.add('xr'); this.padEl.style.display = 'none'; this.avatar.visible = false;
    this.rig.position.copy(this.player.position); this.camera.position.set(0, 0, 0); this.camera.rotation.set(0, 0, 0);
    this.xrMove = new THREE.Vector2();
    this._xrPoll = () => {
      const s = this.renderer.xr.getSession(); if (!s) return; this.xrMove.set(0, 0);
      for (const src of s.inputSources) { const gp = src.gamepad; if (!gp) continue; const ax = gp.axes; const x = ax[2] ?? ax[0] ?? 0, y = ax[3] ?? ax[1] ?? 0; if (src.handedness === 'right') { if (Math.abs(x) > 0.6) { this.yaw -= x * 0.03; } } else { if (Math.abs(x) > 0.15) this.xrMove.x += x; if (Math.abs(y) > 0.15) this.xrMove.y -= y; } if (gp.buttons[0]?.pressed && src.handedness === 'right') { const xrCam = this.renderer.xr.getCamera(); const dir = new THREE.Vector3(); xrCam.getWorldDirection(dir); dir.y = 0; dir.normalize(); this.player.position.addScaledVector(dir, 0.15); } }
    };
    this.updaters.push(this._xrPoll);
  }
  _xrEnd() { this.hud.classList.remove('xr'); this.padEl.style.display = ''; this.xrMove = null; this.updaters = this.updaters.filter(u => u !== this._xrPoll); }

  /* ----- HUD / CSS ----- */
  _buildHUD() {
    const stage = this.stage = document.getElementById('wvm-stage') || (() => { const d = document.createElement('div'); d.id = 'wvm-stage'; document.body.prepend(d); return d; })();
    const hud = this.hud = document.createElement('div'); hud.id = 'wvm-hud';
    hud.innerHTML = `
      <div class="wvm-top">
        <a class="wvm-brand" href="/" title="World VR Mall home"><img src="/images/world-vr-mall-logo.png" alt="World VR Mall"></a>
        <div class="wvm-where">${esc(this.opts.worldName)}</div>
        <div class="wvm-tools">
          <button class="wvm-ico" id="wvm-view" title="First / third person (V)">👀</button>
          <button class="wvm-ico" id="wvm-me" title="Your character & selfie">🧑</button>
          <button class="wvm-ico" id="wvm-list" title="My shopping list (L)">🛍️<span>0</span></button>
          <button class="wvm-ico" id="wvm-help" title="Controls">❔</button>
        </div>
      </div>
      <div id="wvm-toast"></div>
      <button id="wvm-act"></button>
      <div id="wvm-listpanel" class="wvm-panel"><div class="wvm-panel-head"><b>🛍️ My Shopping List</b><button class="wvm-x">✕</button></div><div class="wvm-list-body"></div></div>
      <div id="wvm-pop" class="wvm-modal"><div class="wvm-card"><h3></h3><div class="wvm-pop-body"></div><div class="wvm-pop-actions"></div></div></div>
      <div id="wvm-selfie" class="wvm-modal"><div class="wvm-card">
        <h3>Make it you 🤳</h3>
        <p>Pick a look, then snap a selfie and your real face and shoulders go on your character.</p><p style="font-size:13px;background:rgba(124,248,255,.1);border:1px solid rgba(124,248,255,.35);border-radius:10px;padding:8px 10px">🔒 <b>Your photo stays on this device.</b> Nothing is uploaded or sent anywhere; it's saved only in this browser and you can clear it any time. Kids: ask a parent to tap the camera button.</p>
        <div class="wvm-looks"></div>
        <div class="wvm-cam"><video autoplay playsinline muted></video><canvas width="240" height="320"></canvas></div>
        <div class="wvm-pop-actions">
          <button class="wvm-btn" id="wvm-cam-on">📷 Turn on camera</button>
          <button class="wvm-btn primary" id="wvm-cam-snap" disabled>Snap selfie</button>
          <button class="wvm-btn ghost" id="wvm-cam-clear">Use cartoon face</button>
          <button class="wvm-btn" id="wvm-selfie-done">Let's go!</button>
        </div>
      </div></div>
      <div id="wvm-fade"></div>
      <div id="wvm-loader"><div class="wvm-tele"><img src="/images/world-vr-mall-logo.png" alt="World VR Mall"><div class="wvm-beam"><div class="wvm-beamcol"></div><svg class="wvm-silh" viewBox="0 0 100 160" aria-hidden="true"><circle cx="50" cy="26" r="18"/><path d="M22 160V88c0-22 12-40 28-40s28 18 28 40v72z"/></svg><div class="wvm-pad"></div></div><div class="wvm-loadmsg">Scanning…</div><div class="wvm-barwrap"><div class="wvm-bar"></div></div><small>Teleport station · worldvrmall.com</small></div></div>`;
    stage.appendChild(hud);
    this.toastEl = hud.querySelector('#wvm-toast'); this.actBtn = hud.querySelector('#wvm-act'); this.actBtn.onclick = () => { if (this._act) this._act.fn(this); }; this.listPanel = hud.querySelector('#wvm-listpanel'); this.listBtn = hud.querySelector('#wvm-list');
    this.pop = hud.querySelector('#wvm-pop'); this.fade = hud.querySelector('#wvm-fade'); this.loader = hud.querySelector('#wvm-loader');
    this.bar = hud.querySelector('.wvm-bar'); this.loadMsg = hud.querySelector('.wvm-loadmsg'); this.selfieEl = hud.querySelector('#wvm-selfie');
    hud.querySelector('#wvm-view').onclick = () => this.toggleView();
    hud.querySelector('#wvm-list').onclick = () => this.toggleList();
    this.listPanel.querySelector('.wvm-x').onclick = () => this.toggleList(false);
    hud.querySelector('#wvm-me').onclick = () => this.openSelfie();
    hud.querySelector('#wvm-help').onclick = () => this.popup('How to move around', `
      <ul class="wvm-help">
        <li><b>Phone:</b> drag to look (full 360°, up and down too), pinch to zoom, use the joystick or D-pad, or just tap where you want to walk.</li>
        <li><b>Laptop:</b> W A S D or arrow keys to walk, hold Shift to run, drag the mouse to look, scroll to zoom between first and third person.</li>
        <li><b>VR headset:</b> tap <b>Enter VR</b>. Left stick walks, right stick turns, trigger dashes forward.</li>
        <li><b>Tap</b> signs, doors, and people. Green rings are things you can do. Store doors take you inside.</li>
        <li>The joystick can be dragged anywhere on the screen (grab the ⋮⋮ handle) and switched to a D-pad with ⟲.</li>
      </ul>`);
    this.pop.addEventListener('click', e => { if (e.target === this.pop) this.closePopup(); });
    this._buildSelfie();
  }
  toggleList(force) { const on = force ?? !this.listPanel.classList.contains('on'); this.listPanel.classList.toggle('on', on); }

  /* ----- selfie / character ----- */
  _buildSelfie() {
    const el = this.selfieEl, looks = el.querySelector('.wvm-looks');
    const opts = [
      { n: 'Sky', shirt: 0x38f0ff, pants: 0x1e2a4a }, { n: 'Coral', shirt: 0xff4f79, pants: 0x2b2b2b }, { n: 'Sun', shirt: 0xffd23f, pants: 0x3a6ea5 },
      { n: 'Mint', shirt: 0x7cff6b, pants: 0x1e2a4a }, { n: 'Violet', shirt: 0xb08cff, pants: 0x2b2b2b }, { n: 'Pro', shirt: 0xffffff, pants: 0x111111 },
    ];
    const saved = this._load('wvm_avatar', {});
    for (const o of opts) {
      const b = document.createElement('button'); b.className = 'wvm-look' + (saved.shirt === o.shirt ? ' on' : ''); b.style.background = '#' + o.shirt.toString(16).padStart(6, '0'); b.title = o.n;
      b.onclick = () => { looks.querySelectorAll('.wvm-look').forEach(x => x.classList.remove('on')); b.classList.add('on'); this._save('wvm_avatar', { shirt: o.shirt, pants: o.pants, hat: this._load('wvm_avatar', {}).hat || false }); this._buildAvatar(); };
      looks.appendChild(b);
    }
    // hair color / style / skin
    const row = (label, key, entries) => { const wrap = document.createElement('div'); wrap.className = 'wvm-looks'; wrap.style.marginTop = '2px'; const lb = document.createElement('span'); lb.textContent = label; lb.style.cssText = 'font-size:12px;color:#9fd3ff;width:100%'; wrap.appendChild(lb); for (const [name, val, css] of entries) { const b = document.createElement('button'); b.className = 'wvm-look' + (saved[key] === val ? ' on' : ''); b.title = name; if (css) b.style.background = css; else b.textContent = name; b.onclick = () => { wrap.querySelectorAll('.wvm-look').forEach(x => x.classList.remove('on')); b.classList.add('on'); const a = this._load('wvm_avatar', {}); a[key] = val; this._save('wvm_avatar', a); this._buildAvatar(); }; wrap.appendChild(b); } looks.parentNode.insertBefore(wrap, looks.nextSibling); };
    row('Skin', 'skin', [['light', 0xffdbac, '#ffdbac'], ['fair', 0xf1c9a5, '#f1c9a5'], ['tan', 0xe0ac7e, '#e0ac7e'], ['olive', 0xc68642, '#c68642'], ['brown', 0x8d5524, '#8d5524'], ['deep', 0x5c3a1e, '#5c3a1e']]);
    row('Hair color', 'hair', [['blonde', 0xd9b36c, '#d9b36c'], ['brown', 0x4a2e15, '#4a2e15'], ['black', 0x1a1a1a, '#1a1a1a'], ['red', 0xb5432b, '#b5432b'], ['grey', 0x9a9a9a, '#9a9a9a']]);
    row('Hair style', 'hairStyle', [['short', 'short'], ['long', 'long'], ['ponytail', 'ponytail'], ['curly', 'curly'], ['bun', 'bun'], ['bald', 'bald']]);
    const hat = document.createElement('button'); hat.className = 'wvm-look hat' + (saved.hat ? ' on' : ''); hat.textContent = '🧢'; hat.title = 'Hat';
    hat.onclick = () => { const a = this._load('wvm_avatar', {}); a.hat = !a.hat; this._save('wvm_avatar', a); hat.classList.toggle('on', a.hat); this._buildAvatar(); };
    looks.appendChild(hat);
    const video = el.querySelector('video'), cv = el.querySelector('canvas');
    let stream = null;
    el.querySelector('#wvm-cam-on').onclick = async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } }); video.srcObject = stream; el.querySelector('#wvm-cam-snap').disabled = false; el.classList.add('cam'); }
      catch (e) { this.toast('Camera not available — cartoon face it is 😄'); }
    };
    el.querySelector('#wvm-cam-snap').onclick = () => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, 240, 320);
      const vw = video.videoWidth || 480, vh = video.videoHeight || 640; const ar = 240 / 320; let sw = vw, sh = vw / ar; if (sh > vh) { sh = vh; sw = vh * ar; }
      g.save(); g.beginPath(); g.ellipse(120, 160, 118, 158, 0, 0, Math.PI * 2); g.clip();
      g.translate(240, 0); g.scale(-1, 1); // mirror
      g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 240, 320); g.restore();
      g.lineWidth = 6; g.strokeStyle = '#38f0ff'; g.beginPath(); g.ellipse(120, 160, 116, 156, 0, 0, Math.PI * 2); g.stroke();
      try { localStorage.setItem('wvm_face', cv.toDataURL('image/png')); } catch (e) { }
      this._buildAvatar(); this.toast('Looking good! That\'s you now ✨');
    };
    el.querySelector('#wvm-cam-clear').onclick = () => { localStorage.removeItem('wvm_face'); this._buildAvatar(); this.toast('Cartoon face restored'); };
    el.querySelector('#wvm-selfie-done').onclick = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; el.classList.remove('cam'); } el.classList.remove('on'); this.paused = false; localStorage.setItem('wvm_seen', '1'); };
  }
  openSelfie() { this.selfieEl.classList.add('on'); this.paused = true; }
  _maybeSelfie() { if (this.opts.showSelfieOnFirstVisit && !localStorage.getItem('wvm_seen')) this.openSelfie(); }

  _injectCSS() {
    if (document.getElementById('wvm-css')) return;
    const s = document.createElement('style'); s.id = 'wvm-css';
    s.textContent = `
      body.wvm{margin:0;background:#050b1c;font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#eaf4ff}
      #wvm-stage{position:relative;width:100%;height:100vh;height:100dvh;overflow:hidden;touch-action:none}
      #wvm-canvas{display:block;width:100%;height:100%}
      #wvm-hud{position:absolute;inset:0;pointer-events:none}
      #wvm-hud > *{pointer-events:auto}
      .wvm-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:8px 10px;background:linear-gradient(180deg,rgba(4,10,30,.75),rgba(4,10,30,0));}
      .wvm-brand img{height:34px;display:block;background:#fff;padding:3px 8px;border-radius:9px;box-shadow:0 2px 8px rgba(0,0,0,.5)}
      .wvm-where{font-weight:700;font-size:13px;letter-spacing:.5px;text-shadow:0 1px 4px #000;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wvm-tools{display:flex;gap:6px}
      .wvm-ico{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid rgba(124,248,255,.35);background:rgba(8,20,50,.7);color:#fff;font-size:18px;cursor:pointer;backdrop-filter:blur(6px)}
      .wvm-ico span{position:absolute;top:-6px;right:-6px;background:#ff4f79;color:#fff;font-size:11px;font-weight:800;border-radius:10px;padding:1px 6px;min-width:12px}
      .wvm-ico.bump{transform:scale(1.2)}
      #wvm-vr{position:absolute!important;left:50%!important;transform:translateX(-50%);bottom:18px!important;background:#38f0ff!important;color:#04122a!important;border:0!important;border-radius:999px!important;font-weight:800!important;padding:10px 22px!important;font-family:inherit!important;opacity:1!important;width:auto!important;font-size:14px!important}
      #wvm-toast{position:absolute;top:64px;left:50%;transform:translateX(-50%) translateY(-10px);background:rgba(8,20,50,.92);border:1px solid #38f0ff;border-radius:999px;padding:8px 16px;font-weight:700;font-size:14px;opacity:0;transition:.25s;max-width:88vw;text-align:center}
      #wvm-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
      .wvm-panel{position:absolute;top:58px;right:10px;width:min(360px,92vw);max-height:70vh;overflow:auto;background:rgba(8,20,50,.95);border:1px solid rgba(124,248,255,.4);border-radius:16px;display:none;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .wvm-panel.on{display:block}
      .wvm-panel-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1)}
      .wvm-x{background:none;border:0;color:#fff;font-size:16px;cursor:pointer}
      .wvm-list-body{padding:10px 14px}
      .wvm-list-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .wvm-list-row > div{flex:1;min-width:0} .wvm-list-row b{display:block;font-size:13px} .wvm-list-row small{color:#9fd3ff}
      .wvm-list-foot{display:flex;gap:8px;padding-top:10px} .muted{color:#9fb3d9;font-size:13px}
      .wvm-btn{background:rgba(124,248,255,.15);border:1px solid #38f0ff;color:#fff;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;text-decoration:none;display:inline-block}
      .wvm-btn.primary{background:#38f0ff;color:#04122a} .wvm-btn.ghost{background:transparent;border-color:rgba(255,255,255,.3)} .wvm-btn.small{padding:6px 12px;font-size:12px}
      .wvm-modal{position:absolute;inset:0;background:rgba(2,6,20,.6);display:none;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(3px)}
      .wvm-modal.on{display:flex}
      .wvm-card{background:linear-gradient(160deg,#0d1f4d,#071233);border:1px solid rgba(124,248,255,.45);border-radius:20px;padding:20px 22px;width:min(560px,96vw);max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)}
      .wvm-card h3{margin:0 0 8px;font-size:22px;color:#7cf8ff} .wvm-card p,.wvm-card li{font-size:15px;line-height:1.5}
      .wvm-pop-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .wvm-help{padding-left:18px} .wvm-help li{margin:6px 0}
      .wvm-looks{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
      .wvm-look{min-width:40px;height:40px;border-radius:20px;border:3px solid transparent;cursor:pointer;font-size:14px;font-weight:700;background:#0b1a3a;color:#fff;padding:0 8px;font-family:inherit} .wvm-look.on{border-color:#fff;box-shadow:0 0 0 2px #38f0ff} .wvm-look.hat{background:#0b1a3a}
      .wvm-cam{display:flex;gap:12px;align-items:center;margin:8px 0} .wvm-cam video{width:0;height:0;border-radius:50%;object-fit:cover;transform:scaleX(-1)} #wvm-selfie.cam video{width:160px;height:160px} .wvm-cam canvas{width:90px;height:120px;border-radius:50%;background:#0b1a3a}
      #wvm-fade{position:absolute;inset:0;background:#38f0ff;color:#04122a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;opacity:0;pointer-events:none;transition:.5s}
      #wvm-fade.on{opacity:1;pointer-events:auto}
      #wvm-loader{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#0d2a6b,#040a1e 70%);display:flex;align-items:center;justify-content:center;transition:opacity .6s;z-index:5}
      #wvm-loader.off{opacity:0;pointer-events:none}
      .wvm-tele{text-align:center;width:min(440px,90vw)} .wvm-tele img{height:84px;margin-bottom:10px;background:#fff;padding:10px 22px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
      .wvm-beam{position:relative;width:160px;height:200px;margin:0 auto 12px}
      .wvm-beamcol{position:absolute;left:35px;right:35px;top:0;bottom:16px;background:linear-gradient(180deg,rgba(56,240,255,0),rgba(56,240,255,.35) 40%,rgba(56,240,255,.55));border-radius:40px 40px 6px 6px;animation:wvmbeam 1.6s ease-in-out infinite;filter:blur(1px)}
      .wvm-silh{position:absolute;left:30px;top:20px;width:100px;height:160px;fill:#7cf8ff;filter:drop-shadow(0 0 14px #38f0ff);animation:wvmmat 2.4s ease-in-out infinite}
      .wvm-pad{position:absolute;left:10px;right:10px;bottom:0;height:16px;border-radius:50%;background:radial-gradient(ellipse,#38f0ff,rgba(56,240,255,0) 70%);animation:wvmpulse 1.2s ease-in-out infinite}
      @keyframes wvmbeam{0%,100%{opacity:.5}50%{opacity:1}} @keyframes wvmmat{0%{clip-path:inset(0 0 100% 0);opacity:.2}60%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 0);opacity:1}} @keyframes wvmpulse{0%,100%{transform:scaleX(.8);opacity:.6}50%{transform:scaleX(1.1);opacity:1}}
      @media (prefers-reduced-motion: reduce){.wvm-beamcol,.wvm-silh,.wvm-pad{animation:none}}
      .wvm-loadmsg{font-weight:700;margin-bottom:12px;min-height:22px} .wvm-barwrap{height:12px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;border:1px solid rgba(124,248,255,.3)}
      .wvm-bar{height:100%;width:0;background:linear-gradient(90deg,#38f0ff,#ff4f79,#ffd23f);transition:width .4s;box-shadow:0 0 16px #38f0ff}
      .wvm-tele small{display:block;margin-top:10px;color:#9fd3ff}
      #wvm-pad{position:absolute;left:18px;bottom:22px;width:150px;height:150px;user-select:none;-webkit-user-select:none}
      .wvm-pad-grip{position:absolute;top:-6px;left:50%;transform:translateX(-50%);background:rgba(8,20,50,.8);border:1px solid rgba(124,248,255,.4);border-radius:8px;padding:1px 10px;font-size:12px;cursor:grab;letter-spacing:-2px;color:#7cf8ff;z-index:2}
      .wvm-pad-mode{position:absolute;right:-8px;top:-8px;width:30px;height:30px;border-radius:50%;border:1px solid rgba(124,248,255,.4);background:rgba(8,20,50,.8);color:#7cf8ff;cursor:pointer;z-index:2}
      .wvm-stick{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(56,240,255,.18),rgba(8,20,50,.65) 70%);border:2px solid rgba(124,248,255,.4);touch-action:none}
      .wvm-knob{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#8ff7ff,#1aa8c9);box-shadow:0 6px 16px rgba(0,0,0,.5)}
      .wvm-dpad{position:absolute;inset:0;display:none;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr}
      .wvm-dpad button{background:rgba(8,20,50,.8);border:1px solid rgba(124,248,255,.4);color:#7cf8ff;font-size:18px;border-radius:10px;touch-action:none}
      .wvm-dpad button[data-d=u]{grid-column:2;grid-row:1} .wvm-dpad button[data-d=l]{grid-column:1;grid-row:2} .wvm-dpad button[data-d=r]{grid-column:3;grid-row:2} .wvm-dpad button[data-d=d]{grid-column:2;grid-row:3}
      #wvm-pad[data-mode=dpad] .wvm-stick{display:none} #wvm-pad[data-mode=dpad] .wvm-dpad{display:grid}
      @media (hover:hover) and (pointer:fine){ #wvm-pad{opacity:.55} #wvm-pad:hover{opacity:1} }
      #wvm-hud.xr > *{display:none} #wvm-hud.xr #wvm-vr{display:block}
.wvm-vrbadge{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(8,20,50,.7);border:1px solid rgba(124,248,255,.35);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;color:#9fd3ff;pointer-events:none}
      #wvm-act{position:absolute;bottom:78px;left:50%;transform:translateX(-50%);background:#7cff6b;color:#04122a;border:0;border-radius:999px;padding:14px 26px;font-weight:900;font-size:17px;display:none;box-shadow:0 8px 30px rgba(124,255,107,.45);font-family:inherit;cursor:pointer;animation:wvmpop .4s}
      #wvm-act.on{display:block} @keyframes wvmpop{from{transform:translateX(-50%) scale(.7)}to{transform:translateX(-50%) scale(1)}}
      @media (prefers-reduced-motion: reduce){#wvm-act{animation:none} .wvm-ring{animation:none}}
      .wvm-scrollhint{position:absolute;bottom:14px;right:14px;background:rgba(8,20,50,.75);border:1px solid rgba(124,248,255,.4);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700}
    `;
    document.head.appendChild(s);
  }
}

/* utilities */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dist2(t) { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.hypot(dx, dy); }
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
export { esc, lerpAngle };
