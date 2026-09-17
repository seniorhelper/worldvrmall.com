/* ============================================================
   World VR Mall — shared engine  (worldvrmall.com)
   One engine, every page: outside world, mall, park, stores.
   Three.js r160 (ES modules via import map in each page).
   Runs on phone, laptop, and WebXR headsets from one URL.
   ============================================================ */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

export { THREE };

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
const skinTones = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
export function makePerson(opts = {}) {
  const {
    shirt = pick([0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff, 0xff8a3d, 0xffffff, 0x2f6bff]),
    pants = pick([0x1e2a4a, 0x2b2b2b, 0x4a3b8c, 0x3a6ea5, 0x6b4f2a]),
    skin = pick(skinTones), hair = pick([0x1a1a1a, 0x4a2e15, 0xd9b36c, 0xb5432b, 0x777777, 0xffffff]),
    faceTex = null, bag = Math.random() < 0.5, hat = false, scale = 1,
  } = opts;
  const g = new THREE.Group();
  const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
  // legs
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.55, 4, 8);
  const lL = new THREE.Mesh(legGeo, M(pants)); lL.position.set(-0.14, 0.45, 0);
  const lR = lL.clone(); lR.position.x = 0.14;
  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), M(shirt)); body.position.y = 1.12;
  // arms
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
  const aL = new THREE.Mesh(armGeo, M(skin)); aL.position.set(-0.38, 1.12, 0);
  const aR = aL.clone(); aR.position.x = 0.38;
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), M(skin)); head.position.y = 1.72;
  if (faceTex) {
    // face decal on front of head
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true }));
    face.position.set(0, 1.72, 0.2); g.add(face); g.userData.face = face;
  } else {
    // simple friendly face
    const eyeM = M(0x111111);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeM); e.position.set(sx * 0.08, 1.76, 0.21); g.add(e); }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), eyeM);
    smile.position.set(0, 1.66, 0.21); smile.rotation.z = Math.PI; g.add(smile);
  }
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M(hair)); hairM.position.y = 1.74;
  g.add(lL, lR, body, aL, aR, head, hairM);
  if (hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 12), M(0xff4f79)); h.position.y = 1.98; g.add(h); }
  if (bag) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), M(pick([0xff4f79, 0x38f0ff, 0xffd23f, 0xffffff])));
    b.position.set(0.5, 0.75, 0); g.add(b);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), M(0x222222)); hd.position.set(0.5, 0.92, 0); g.add(hd);
  }
  g.scale.setScalar(scale);
  g.userData.limbs = { lL, lR, aL, aR };
  g.userData.phase = Math.random() * 10;
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
  p.position.y += 0; // ground handled by mover
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
        const btn = VRButton.createButton(renderer);
        btn.id = 'wvm-vr'; this.hud.appendChild(btn);
        navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (!ok) btn.remove(); }).catch(() => btn.remove());
        renderer.xr.addEventListener('sessionstart', () => this._xrStart());
        renderer.xr.addEventListener('sessionend', () => this._xrEnd());
      }
    } catch (e) { /* no XR */ }

    // shopping list + face from storage
    this.list = this._load('wvm_list', []);
    this._renderList();
  }

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
    this.avatar = makePerson(Object.assign({ bag: false, faceTex }, saved || {}));
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
  addNPC(person, path, opts = {}) {
    const n = { p: person, path, i: 0, speed: opts.speed || rand(1.2, 2.2), wait: 0, loop: opts.loop !== false, pause: opts.pause || 0 };
    person.position.copy(path[0]); this.scene.add(person); this.npcs.push(n); return n;
  }
  /* Fade + navigate to another page (portal). */
  go(url, label = 'Teleporting…') {
    this.fade.classList.add('on'); this.fade.textContent = label;
    setTimeout(() => { location.href = url; }, 550);
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
    const msgs = ['Scanning your signature…', 'Uploading you to World VR Mall…', 'Materializing shops from 6 continents…', 'Polishing the floors…', 'Welcome. Have a great day!'];
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
    this._updateZones();
    if (this.triggers && !this.paused) { const p = this.player.position; for (const tr of this.triggers) { const dx = p.x - tr.x, dz = p.z - tr.z; const inside = dx * dx + dz * dz < tr.r * tr.r; if (inside && !tr.fired) { tr.fired = true; tr.fn(this); } else if (!inside) tr.fired = false; } }
    for (const u of this.updaters) u(dt, this.t);
    this.renderer.render(this.scene, this.camera);
  }

  _movePlayer(dt) {
    const o = this.opts, p = this.player;
    const mv = new THREE.Vector2(0, 0);
    if (this.keys.KeyW || this.keys.ArrowUp) mv.y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) mv.y -= 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mv.x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mv.x += 1;
    mv.add(this.moveVec);
    if (this.xrMove) mv.add(this.xrMove);
    let speed = (this.keys.ShiftLeft || this.keys.ShiftRight || this.running) ? o.runSpeed : o.walkSpeed;
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
    el.addEventListener('wheel', e => { e.preventDefault(); this.targetDist = clamp(this.targetDist + e.deltaY * 0.01, 0.01, 18); if (this.targetDist < 0.6) this.targetDist = 0.01; }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    this._buildJoystick();
  }
  _zoom(fov) { this.camera.fov = clamp(fov, 30, 100); this.camera.updateProjectionMatrix(); }
  toggleView() { this.targetDist = this.targetDist > 0.6 ? 0.01 : 6; this.toast(this.targetDist > 0.6 ? 'Third person 👀' : 'First person 🎯'); }
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
      <div id="wvm-listpanel" class="wvm-panel"><div class="wvm-panel-head"><b>🛍️ My Shopping List</b><button class="wvm-x">✕</button></div><div class="wvm-list-body"></div></div>
      <div id="wvm-pop" class="wvm-modal"><div class="wvm-card"><h3></h3><div class="wvm-pop-body"></div><div class="wvm-pop-actions"></div></div></div>
      <div id="wvm-selfie" class="wvm-modal"><div class="wvm-card">
        <h3>Make it you 🤳</h3>
        <p>Pick a look, then snap a selfie to put your real face on your character. Your photo never leaves this device — it's stored only in your browser.</p>
        <div class="wvm-looks"></div>
        <div class="wvm-cam"><video autoplay playsinline muted></video><canvas width="160" height="160"></canvas></div>
        <div class="wvm-pop-actions">
          <button class="wvm-btn" id="wvm-cam-on">📷 Turn on camera</button>
          <button class="wvm-btn primary" id="wvm-cam-snap" disabled>Snap selfie</button>
          <button class="wvm-btn ghost" id="wvm-cam-clear">Use cartoon face</button>
          <button class="wvm-btn" id="wvm-selfie-done">Let's go!</button>
        </div>
      </div></div>
      <div id="wvm-fade"></div>
      <div id="wvm-loader"><div class="wvm-tele"><img src="/images/world-vr-mall-logo.png" alt="World VR Mall"><div class="wvm-ring"></div><div class="wvm-loadmsg">Scanning…</div><div class="wvm-barwrap"><div class="wvm-bar"></div></div><small>Teleport station · worldvrmall.com</small></div></div>`;
    stage.appendChild(hud);
    this.toastEl = hud.querySelector('#wvm-toast'); this.listPanel = hud.querySelector('#wvm-listpanel'); this.listBtn = hud.querySelector('#wvm-list');
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
      const g = cv.getContext('2d'); const s = Math.min(video.videoWidth, video.videoHeight) || 160;
      g.save(); g.beginPath(); g.arc(80, 80, 80, 0, Math.PI * 2); g.clip();
      g.translate(160, 0); g.scale(-1, 1); // mirror
      g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 160, 160); g.restore();
      try { localStorage.setItem('wvm_face', cv.toDataURL('image/jpeg', 0.8)); } catch (e) { }
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
      .wvm-brand img{height:34px;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
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
      .wvm-look{width:40px;height:40px;border-radius:50%;border:3px solid transparent;cursor:pointer;font-size:20px} .wvm-look.on{border-color:#fff;box-shadow:0 0 0 2px #38f0ff} .wvm-look.hat{background:#0b1a3a}
      .wvm-cam{display:flex;gap:12px;align-items:center;margin:8px 0} .wvm-cam video{width:0;height:0;border-radius:50%;object-fit:cover;transform:scaleX(-1)} #wvm-selfie.cam video{width:160px;height:160px} .wvm-cam canvas{width:96px;height:96px;border-radius:50%;background:#0b1a3a;border:2px solid #38f0ff}
      #wvm-fade{position:absolute;inset:0;background:#38f0ff;color:#04122a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;opacity:0;pointer-events:none;transition:.5s}
      #wvm-fade.on{opacity:1;pointer-events:auto}
      #wvm-loader{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#0d2a6b,#040a1e 70%);display:flex;align-items:center;justify-content:center;transition:opacity .6s;z-index:5}
      #wvm-loader.off{opacity:0;pointer-events:none}
      .wvm-tele{text-align:center;width:min(420px,88vw)} .wvm-tele img{height:56px;margin-bottom:14px}
      .wvm-ring{width:120px;height:120px;margin:0 auto 16px;border-radius:50%;border:3px solid rgba(124,248,255,.3);border-top-color:#38f0ff;animation:wvmspin 1.1s linear infinite;box-shadow:0 0 40px rgba(56,240,255,.35) inset}
      @keyframes wvmspin{to{transform:rotate(360deg)}}
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
