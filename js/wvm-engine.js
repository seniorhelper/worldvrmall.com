/* ============================================================
   World VR Mall — shared engine  (worldvrmall.com)   v7 (smooth pass)
   One engine, every page: outside world, mall, park, stores.
   Three.js r160 (ES modules via import map in each page).
   Runs on phone, laptop, and WebXR headsets from one URL.

   v5 (Sept 2026) — graphics + character upgrade
   · Real lighting: soft shadows, environment reflections from the sky
     panorama, bloom on neon (desktop; phones get a lighter pass)
   · Sky: day / night panoramas (night 6 pm – 6 am local), AVIF with
     JPG fallback, one panorama in memory at a time
   · Selfie face: face-only oval with a natural chin, wrapped onto a
     real 3D head (no more flat slice, no more shoulders)
   · Characters: Classic (the originals), Hero (rigged GLB from
     /models/), Kid, Alien, Robot, Drone, Bobbleheads (cat / unicorn /
     bear / lion). Wild hair colors, sunglasses, headphones, hats.
   · Cart: real seated pose, head never clips the roof, TURBO button
     with flames
   · Signs read correctly from both sides
   · Portals (fast travel), first-steps hook, radio (YouTube), view
     modes, joystick hides while a dialog is open
   ============================================================ */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const WVM_VERSION = '7';
export const LANG = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').slice(0, 2).toLowerCase();
/* Pick a language variant: value may be a string/array or an object keyed by language code. */
export function L(v) { if (v && typeof v === 'object' && !Array.isArray(v)) return v[LANG] || v.en || Object.values(v)[0]; return v; }

/* ------------------------------------------------------------
   Small helpers
------------------------------------------------------------ */
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
/* pick(): for lists of sayings it is a shuffle-bag, not a dice roll: nothing repeats until every line in that list has been used, and the bag is remembered between visits, so the next thing you hear is always new */
const _bags = new Map(); let _bagStore = null;
const _bagLoad = () => { if (_bagStore) return _bagStore; try { _bagStore = JSON.parse(localStorage.getItem('wvm_bags') || '{}') || {}; } catch (e) { _bagStore = {}; } return _bagStore; };
const _bagSave = () => { try { const st = _bagLoad(); const keys = Object.keys(st); if (keys.length > 160) for (const k of keys.slice(0, 40)) delete st[k]; localStorage.setItem('wvm_bags', JSON.stringify(st)); } catch (e) { } };
export const pick = (arr) => {
  if (!arr || arr.length < 3 || typeof arr[0] !== 'string' || arr[0].length < 14) return arr[Math.floor(Math.random() * arr.length)];
  let h = 5381; const sig = arr.length + '|' + arr[0] + '|' + arr[arr.length - 1]; for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0; const key = 'b' + (h >>> 0).toString(36);
  let bag = _bags.get(key); if (!bag) { const st = _bagLoad()[key]; bag = Array.isArray(st) ? st.filter(i => i < arr.length) : []; _bags.set(key, bag); }
  if (!bag.length) { for (let i = 0; i < arr.length; i++) bag.push(i); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } if (bag[bag.length - 1] === _bags.get(key + ':last') && bag.length > 1) bag.unshift(bag.pop()); }
  const idx = bag.pop(); _bags.set(key + ':last', idx); _bagLoad()[key] = bag.slice(); clearTimeout(pick._t); pick._t = setTimeout(_bagSave, 1500); return arr[idx];
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
/* Phones and small tablets get the lighter render path. */
export const isMobile = () => isTouch() && Math.min(innerWidth, innerHeight) < 900;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* Phones get half-size generated textures (a quarter of the GPU memory). iPhones are the strictest: Safari kills a tab that uses too much. */
export const TEX_SCALE = isMobile() ? 0.5 : 1;
export function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (isMobile()) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } return t; }

/* ---- Sky presets (files live in /images/) ---- */
export const SKIES = {
  day: '/images/lake-mountain-landscape-360-main',
  night: '/images/realistic-night-sky-moon-stars-360',
  meadow: '/images/daisy-meadow-360-panorama',
  beach: '/images/tropical-beach-360-panorama',
  mallInterior: '/images/futuristic-global-mall-360-4096x2048',
  showroom: '/images/high-end-retail-store-360-4096x2048',
};
/* Night is 6 pm to 6 am, local time on the visitor's device. */
export const isNightNow = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };

/* A canvas-text texture for signs, banners, price tags, labels. */
const _ttCache = new Map();
export function makeTextTexture(lines, opts = {}) {
  let _ck = null; try { _ck = JSON.stringify([lines, opts]); } catch (err) { } if (_ck && _ck.length < 600 && _ttCache.has(_ck)) return _ttCache.get(_ck);
  const _tex = _makeTextTexture(lines, opts); if (_ck && _ck.length < 600) _ttCache.set(_ck, _tex); return _tex;
}
function _makeTextTexture(lines, opts = {}) {
  const {
    w = 1024, h = 512, bg = '#0b1a3a', fg = '#ffffff', accent = '#38f0ff',
    font = 'bold 72px Poppins, Segoe UI, Arial, sans-serif', pad = 40, radius = 40,
    align = 'center', glow = true, border = accent, lineGap = 1.15, small = null,
  } = opts;
  const c = document.createElement('canvas'); c.width = Math.round(w * TEX_SCALE); c.height = Math.round(h * TEX_SCALE);
  const g = c.getContext('2d'); g.scale(TEX_SCALE, TEX_SCALE);
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
  const t = canvasTex(c); t.anisotropy = isMobile() ? 1 : 4; t.userData.isText = true;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* A flat sign with text, optional posts. Two front-facing planes back to back, so the
   text reads correctly from BOTH sides (a single double-sided plane mirrors the back). */
export function makeSign(lines, opts = {}) {
  const { width = 6, height = 3, posts = true, postHeight = 2.5, double = true, neon = false } = opts;
  const tex = makeTextTexture(lines, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, transparent: true });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  const g = new THREE.Group();
  plane.position.y = postHeight + height / 2;
  g.add(plane);
  if (double) { const back = new THREE.Mesh(plane.geometry, mat); back.position.y = plane.position.y; back.position.z = -0.01; back.rotation.y = Math.PI; g.add(back); g.userData.back = back; }
  if (neon) { const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, height + 0.25, 0.08), new THREE.MeshStandardMaterial({ color: opts.accent || '#38f0ff', emissive: opts.accent || '#38f0ff', emissiveIntensity: 1.6 })); frame.position.y = plane.position.y; frame.position.z = -0.05; g.add(frame); g.userData.neon = frame; }
  if (posts) {
    const pm = new THREE.MeshStandardMaterial({ color: 0x9aa7c7, metalness: 0.7, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, postHeight + height, 8), pm);
      p.position.set(sx * (width / 2 - 0.3), (postHeight + height) / 2, -0.06);
      p.castShadow = true; g.add(p);
    }
  }
  g.userData.plane = plane;
  return g;
}

/* Floating text sprite (labels, affirmations, fun facts). Sprites always face the camera, so they never mirror. */
export const SPRITES = [];
export function makeSprite(text, opts = {}) {
  const { scale = 4, bg = 'rgba(8,20,50,0.85)', fg = '#fff', accent = '#7cf8ff', font = 'bold 56px Poppins, Segoe UI, Arial' } = opts;
  const tex = makeTextTexture(text, { w: 1024, h: 256, bg, fg, accent, font, radius: 120, border: accent, glow: true });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale / 4, 1); s.userData.far = opts.far; SPRITES.push(s);
  return s;
}

/* ------------------------------------------------------------
   Characters
------------------------------------------------------------ */
const skinTones = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac, 0xd8a27a, 0x7a4a2a];
const hairColors = { blonde: 0xd9b36c, brown: 0x4a2e15, black: 0x1a1a1a, red: 0xb5432b, grey: 0x9a9a9a, white: 0xf0f0f0, auburn: 0x7a3b1e };
/* Wild colors are for the picker; the NPC crowd keeps natural hair so the wild ones read as "yours". */
export const HAIR_COLORS = [['blonde', 0xd9b36c], ['brown', 0x4a2e15], ['black', 0x1a1a1a], ['red', 0xb5432b], ['grey', 0x9a9a9a], ['white', 0xf0f0f0], ['pink', 0xff4fd8], ['hot pink', 0xff1493], ['blue', 0x2f8cff], ['electric blue', 0x00e5ff], ['purple', 0x9b4dff], ['green', 0x3ddc84], ['orange', 0xff8a3d], ['rainbow', 'rainbow']];
const shirtColors = [0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff, 0xff8a3d, 0xffffff, 0x2f6bff, 0x1e2a4a, 0x9ad0ff, 0xf2b5d4, 0x2b8a3e];

/* The character menu. `kind` is what makePerson / buildCharacter switch on. */
export const CHARACTERS = [
  { id: 'classic', name: 'Classic', icon: '🙂', desc: 'The original mall shopper', kind: 'classic', face: true },
  { id: 'hero', name: 'Shopper', icon: '🧍', desc: 'Realistic, walks & waves', kind: 'glb', face: true, model: '/models/char-casual.glb' },
  { id: 'hero-punk', name: 'Punk', icon: '🎸', desc: 'Rigged, with attitude', kind: 'glb', face: true, model: '/models/char-punk.glb' },
  { id: 'hero-suit', name: 'Suit', icon: '👔', desc: 'Business casual', kind: 'glb', face: true, model: '/models/char-suit.glb' },
  { id: 'hero-adventurer', name: 'Adventurer', icon: '🧭', desc: 'Rigged explorer, ready for the Wilds', kind: 'glb', face: true, model: '/models/char-adventurer.glb' },
  { id: 'hero-scifi', name: 'Sci-Fi', icon: '🧑‍🚀', desc: 'Rigged, suited for the Orbit Deck', kind: 'glb', face: true, model: '/models/char-scifi.glb' },
  { id: 'hero-worker', name: 'Builder', icon: '👷', desc: 'Rigged, hi-vis and hard hat', kind: 'glb', face: true, model: '/models/char-worker.glb' },
  { id: 'kid', name: 'Kid', icon: '🧒', desc: 'Small, bouncy walk', kind: 'classic', age: 'kid', face: true },
  { id: 'alien', name: 'Alien', icon: '👽', desc: 'Friendly visitor', kind: 'alien', face: true },
  { id: 'robot', name: 'Robot', icon: '🤖', desc: 'Beep boop', kind: 'robot', face: true },
  { id: 'drone', name: 'Drone', icon: '🛸', desc: 'Hovers. No legs required', kind: 'drone', face: false },
  { id: 'cart', name: 'Shopping Cart', icon: '🛒', desc: 'Eyebrows, spiky hair, rolling wheels', kind: 'cart', face: true },
  { id: 'cat', name: 'Cat Head', icon: '🐱', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'cat', face: true },
  { id: 'unicorn', name: 'Unicorn', icon: '🦄', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'unicorn', face: true },
  { id: 'bear', name: 'Bear', icon: '🐻', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'bear', face: true },
  { id: 'lion', name: 'Lion', icon: '🦁', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'lion', face: true },
];

const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
function shadowed(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); return obj; }
/* Rainbow hair: a small vertical gradient texture. */
let rainbowTex = null;
function rainbowMaterial() {
  if (!rainbowTex) { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); ['#ff4f79', '#ff8a3d', '#ffd23f', '#7cff6b', '#38f0ff', '#b08cff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col)); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); rainbowTex = new THREE.CanvasTexture(c); rainbowTex.colorSpace = THREE.SRGBColorSpace; }
  return new THREE.MeshStandardMaterial({ map: rainbowTex, roughness: 0.8 });
}
function hairMat(hair) { return hair === 'rainbow' ? rainbowMaterial() : M(hair); }

/* Face-only head: a skin sphere with the selfie oval wrapped onto a shallow front cap.
   The oval texture is transparent outside the face, so hair and skin show around it and it
   reads as a real head from the side. Returns { head, cap }. */
export function makeFaceHead(faceTex, skin, radius = 0.24) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), M(skin)); head.castShadow = true; g.add(head);
  if (faceTex) {
    // the selfie oval as a gently curved plate on the front of the head: always visible, no z-fighting, no hiding inside hair
    // the photo is the front of the head itself: a slightly larger front shell so nothing shows around the oval but skin
    const geo = new THREE.SphereGeometry(radius * 1.08, 24, 18, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.12, Math.PI * 0.72);
    const cap = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.25, side: THREE.FrontSide }));
    cap.position.set(0, -radius * 0.02, radius * 0.02); cap.scale.set(1, 1.04, 1); g.add(cap); g.userData.cap = cap;
  }
  g.userData.head = head;
  return g;
}

/* the selfie as a curved plate for heads that are not the Classic one (alien, bobbleheads) */
export function makeFaceCap(faceTex, radius) { const geo = new THREE.SphereGeometry(radius, 24, 18, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.12, Math.PI * 0.72); return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.25, side: THREE.FrontSide })); }
/* Accessories that fit any head at ~radius 0.24. */
function addSunglasses(face, y = 0.04, z = 0.215) { const m = M(0x111111, { roughness: 0.2, metalness: 0.5 }); for (const sx of [-1, 1]) { const lens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.02), m); lens.position.set(sx * 0.085, y, z + 0.02); face.add(lens); } const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), m); bridge.position.set(0, y + 0.01, z + 0.02); face.add(bridge); for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.24), m); arm.position.set(sx * 0.15, y + 0.01, z - 0.1); face.add(arm); } }
function addHeadphones(g, y = 1.74) { const m = M(0x222222, { roughness: 0.3, metalness: 0.4 }); const band = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.02, 8, 20, Math.PI), m); band.position.y = y; band.rotation.z = 0; g.add(band); for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), M(pick([0xff4f79, 0x38f0ff, 0x222222]))); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.26, y - 0.02, 0); g.add(cup); } }
function addHat(g, color, y = 1.98) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 12), M(color)); h.position.y = y; h.castShadow = true; g.add(h); const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), h.material); brim.position.set(0, y - 0.06, 0.3); g.add(brim); }

/* A varied low-poly person (NPC + the Classic avatar). Every option is random unless given:
   age: 'kid' | 'adult' | 'senior'; hairStyle: 'short' | 'long' | 'ponytail' | 'bald' | 'bun' | 'curly' | 'mohawk' | 'spiky';
   dress: true for a dress instead of pants; faceTex: selfie texture (face only); sunglasses / headphones / hat: booleans. */
export function makePerson(opts = {}) {
  const age = opts.age || pick(['adult', 'adult', 'adult', 'adult', 'kid', 'senior']);
  const o = Object.assign({
    shirt: pick(shirtColors), pants: pick([0x1e2a4a, 0x2b2b2b, 0x4a3b8c, 0x3a6ea5, 0x6b4f2a, 0x8a1c3a, 0x556b2f]),
    skin: pick(skinTones), hair: age === 'senior' ? pick([hairColors.grey, hairColors.white]) : pick(Object.values(hairColors).slice(0, 4).concat([hairColors.auburn])),
    hairStyle: pick(['short', 'short', 'long', 'ponytail', 'curly', 'bun', age === 'senior' ? 'bald' : 'short']), dress: Math.random() < 0.3,
    faceTex: null, bag: Math.random() < 0.5, hat: Math.random() < 0.12, glasses: age === 'senior' ? Math.random() < 0.6 : Math.random() < 0.15, beard: Math.random() < 0.12,
    sunglasses: false, headphones: false,
    scale: age === 'kid' ? rand(0.55, 0.72) : age === 'senior' ? rand(0.9, 1.0) : rand(0.92, 1.1),
  }, opts);
  const g = new THREE.Group();
  const skinM = M(o.skin), hairM = hairMat(o.hair), shirtM = M(o.shirt), pantsM = M(o.pants);
  // legs / dress
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.55, 4, 8);
  const lL = new THREE.Mesh(legGeo, o.dress ? skinM : pantsM); lL.position.set(-0.14, 0.45, 0);
  const lR = lL.clone(); lR.position.x = 0.14;
  if (o.dress) { const dr = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 12, 1, true), M(o.pants, { side: THREE.DoubleSide })); dr.position.y = 0.72; dr.castShadow = true; g.add(dr); }
  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), shirtM); body.position.y = 1.12;
  // arms (sleeves + hands)
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
  const aL = new THREE.Mesh(armGeo, shirtM); aL.position.set(-0.38, 1.12, 0);
  const aR = aL.clone(); aR.position.x = 0.38;
  for (const a of [aL, aR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skinM); hand.position.y = -0.34; a.add(hand); }
  // head + face
  const face = new THREE.Group(); face.position.set(0, 1.72, 0); g.add(face);
  const headGroup = makeFaceHead(o.faceTex, o.skin, 0.24); headGroup.position.y = 1.72; g.add(headGroup);
  if (o.faceTex) { g.userData.face = headGroup.userData.cap; }
  else {
    const eyeM = M(0xffffff, { roughness: 0.3 }), pupM = M(0x111111);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeM); e.position.set(sx * 0.085, 0.04, 0.215); face.add(e); const pu = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pupM); pu.position.set(sx * 0.085, 0.04, 0.252); face.add(pu); const br = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), hairM); br.position.set(sx * 0.085, 0.1, 0.225); br.rotation.z = sx * -0.15; face.add(br); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), skinM); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, 0.255); face.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI), M(0xb03a4a)); smile.position.set(0, -0.07, 0.22); smile.rotation.z = Math.PI; face.add(smile);
    if (o.glasses && !o.sunglasses) { for (const sx of [-1, 1]) { const gl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16), M(0x222222, { metalness: 0.6 })); gl.position.set(sx * 0.085, 0.04, 0.24); face.add(gl); } }
    if (o.beard && age !== 'kid') { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), hairM); bd.position.set(0, -0.04, 0.09); bd.scale.set(1, 0.9, 1); face.add(bd); }
  }
  if (o.sunglasses) addSunglasses(face, 0.04, 0.215);
  // hair
  if (o.hairStyle !== 'bald') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, o.faceTex ? Math.PI * 0.42 : Math.PI * 0.55), hairM); cap.position.y = 1.74; cap.castShadow = true; g.add(cap);
    if (o.hairStyle === 'long') { const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), hairM); back.position.set(0, 1.45, -0.12); back.scale.set(1, 1, 0.55); g.add(back); }
    if (o.hairStyle === 'ponytail') { const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.35, 4, 8), hairM); pt.position.set(0, 1.5, -0.26); pt.rotation.x = 0.35; g.add(pt); g.userData.ponytail = pt; }
    if (o.hairStyle === 'bun') { const bn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hairM); bn.position.set(0, 1.9, -0.18); g.add(bn); }
    if (o.hairStyle === 'curly') { for (let i = 0; i < 6; i++) { const cu = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hairM); const a = i / 6 * Math.PI * 2; cu.position.set(Math.cos(a) * 0.2, 1.9 + Math.sin(i) * 0.03, Math.sin(a) * 0.2 - 0.03); g.add(cu); } }
    if (o.hairStyle === 'mohawk') { for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 - i * 0.02, 6), hairM); sp.position.set(0, 2.0 - i * 0.02, 0.12 - i * 0.08); sp.rotation.x = -0.4 + i * 0.2; g.add(sp); } }
    if (o.hairStyle === 'spiky') { for (let i = 0; i < 9; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), hairM); const a = i / 9 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.16, 1.98, Math.sin(a) * 0.16); sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(sp); } }
  } else if (!o.faceTex) { const fringe = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16, Math.PI), hairM); fringe.position.set(0, 1.7, -0.02); fringe.rotation.x = Math.PI / 2; fringe.rotation.z = Math.PI; g.add(fringe); }
  for (const m of [lL, lR, body, aL, aR]) m.castShadow = true;
  g.add(lL, lR, body, aL, aR);
  if (o.headphones) addHeadphones(g, 1.74);
  if (o.hat) addHat(g, pick([0xff4f79, 0x38f0ff, 0x1e2a4a, 0xffffff]), 1.98);
  if (o.bag) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), M(pick([0xff4f79, 0x38f0ff, 0xffd23f, 0xffffff, 0x7cff6b])));
    b.position.set(0.5, 0.75, 0); g.add(b);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), M(0x222222)); hd.position.set(0.5, 0.92, 0); g.add(hd);
  }
  if (age === 'senior') { g.rotation.x = 0.06; }
  g.scale.setScalar(o.scale);
  g.userData.limbs = { lL, lR, aL, aR };
  g.userData.phase = Math.random() * 10; g.userData.age = age; g.userData.kind = 'classic';
  g.userData.headY = 1.98 * o.scale;
  return g;
}

/* ---- Alien: green, big eyes, antennae, three fingers. Same limb names so animatePerson works. ---- */
export function makeAlien(opts = {}) {
  const o = Object.assign({ skin: 0x7cff6b, suit: 0xb08cff, scale: 1, sunglasses: false }, opts);
  const g = new THREE.Group(); const skinM = M(o.skin, { roughness: 0.5 }), suitM = M(o.suit, { metalness: 0.3, roughness: 0.4 });
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.5, 4, 8);
  const lL = new THREE.Mesh(legGeo, suitM); lL.position.set(-0.13, 0.42, 0); const lR = lL.clone(); lR.position.x = 0.13;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 12), suitM); body.position.y = 1.02;
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.55, 4, 8);
  const aL = new THREE.Mesh(armGeo, skinM); aL.position.set(-0.32, 1.05, 0); const aR = aL.clone(); aR.position.x = 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), skinM); head.position.y = 1.72; head.scale.set(1, 1.25, 0.95);
  const face = new THREE.Group(); face.position.y = 1.72; g.add(face);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M(0x0a0a1a, { roughness: 0.15, metalness: 0.3 })); e.position.set(sx * 0.13, 0.06, 0.24); e.scale.set(1, 1.5, 0.6); e.rotation.z = sx * 0.4; face.add(e); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M(0xffffff)); gl.position.set(sx * 0.11, 0.1, 0.3); face.add(gl); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI), M(0x2a5a1a)); mouth.position.set(0, -0.14, 0.26); mouth.rotation.z = Math.PI; face.add(mouth);
  for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), skinM); st.position.set(sx * 0.12, 2.18, 0); st.rotation.z = sx * -0.3; g.add(st); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0x38f0ff, emissive: 0x38f0ff, emissiveIntensity: 1.5 })); ball.position.set(sx * 0.16, 2.33, 0); g.add(ball); }
  if (o.faceTex) { face.visible = false; const cap = makeFaceCap(o.faceTex, 0.318); cap.position.set(0, 1.71, 0.012); cap.scale.set(1, 1.25, 0.95); g.add(cap); }
  if (o.sunglasses) addSunglasses(face, 0.06, 0.26);
  for (const m of [lL, lR, body, aL, aR, head]) m.castShadow = true;
  g.add(lL, lR, body, aL, aR, head);
  g.scale.setScalar(o.scale); g.userData.limbs = { lL, lR, aL, aR }; g.userData.phase = Math.random() * 10; g.userData.kind = 'alien'; g.userData.headY = 2.36 * o.scale;
  return g;
}

/* ---- Robot: boxy, glowing visor, antenna, treads-free legs. ---- */
export function makeRobot(opts = {}) {
  const o = Object.assign({ color: 0xbfc9d9, accent: 0x38f0ff, scale: 1 }, opts);
  const g = new THREE.Group(); const m = M(o.color, { metalness: 0.75, roughness: 0.35 }), dark = M(0x2a2f3a, { metalness: 0.6, roughness: 0.4 }); const glow = new THREE.MeshStandardMaterial({ color: o.accent, emissive: o.accent, emissiveIntensity: 1.8 });
  const lL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), dark); lL.position.set(-0.15, 0.4, 0); const lR = lL.clone(); lR.position.x = 0.15;
  for (const l of [lL, lR]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.32), m); foot.position.set(0, -0.35, 0.05); l.add(foot); }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.4), m); body.position.y = 1.08;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.02), glow); chest.position.set(0, 1.15, 0.21); g.add(chest);
  const aL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), dark); aL.position.set(-0.42, 1.08, 0); const aR = aL.clone(); aR.position.x = 0.42;
  for (const a of [aL, aR]) { const claw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), m); claw.position.y = -0.36; a.add(claw); }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.42), m); head.position.y = 1.72;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.03), glow); visor.position.set(0, 1.75, 0.22); g.add(visor);
  if (o.faceTex) { visor.visible = false; const scr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.02), M(0x0a1020, { roughness: 0.2, metalness: 0.6 })); scr.position.set(0, 1.72, 0.212); g.add(scr); const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.4), new THREE.MeshBasicMaterial({ map: o.faceTex, transparent: true, alphaTest: 0.25 })); fp.position.set(0, 1.72, 0.226); g.add(fp); }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), dark); ant.position.set(0.12, 2.03, 0); g.add(ant); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff4f79, emissive: 0xff4f79, emissiveIntensity: 2 })); tip.position.set(0.12, 2.15, 0); g.add(tip);
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), dark); ear.rotation.z = Math.PI / 2; ear.position.set(sx * 0.26, 1.72, 0); g.add(ear); }
  for (const x of [lL, lR, body, aL, aR, head]) x.castShadow = true;
  g.add(lL, lR, body, aL, aR, head);
  g.scale.setScalar(o.scale); g.userData.limbs = { lL, lR, aL, aR }; g.userData.phase = Math.random() * 10; g.userData.kind = 'robot'; g.userData.headY = 2.2 * o.scale; g.userData.stiff = true;
  return g;
}

/* ---- Drone: hovers, spinning rotors, a little camera eye. No limbs — bobs instead. ---- */
export function makeDrone(opts = {}) {
  const o = Object.assign({ color: 0x1e2a4a, accent: 0x38f0ff, scale: 1 }, opts);
  const g = new THREE.Group(); const m = M(o.color, { metalness: 0.6, roughness: 0.35 }); const glow = new THREE.MeshStandardMaterial({ color: o.accent, emissive: o.accent, emissiveIntensity: 1.6 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), m); hull.scale.set(1.3, 0.55, 1.3); hull.position.y = 1.4; hull.castShadow = true; g.add(hull);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 30), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 1.4; g.add(ring);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), M(0x0a0a1a, { roughness: 0.1, metalness: 0.4 })); eye.position.set(0, 1.42, 0.34); g.add(eye); const iris = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow); iris.position.set(0, 1.42, 0.42); g.add(iris);
  const rotors = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), m); arm.position.set(Math.cos(a) * 0.35, 1.45, Math.sin(a) * 0.35); arm.rotation.y = -a; g.add(arm); const rot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.05), M(0xdddddd, { transparent: true, opacity: 0.7 })); rot.position.set(Math.cos(a) * 0.6, 1.5, Math.sin(a) * 0.6); g.add(rot); rotors.push(rot); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), m); hub.position.copy(rot.position); hub.position.y -= 0.03; g.add(hub); }
  g.scale.setScalar(o.scale); g.userData.rotors = rotors; g.userData.phase = Math.random() * 10; g.userData.kind = 'drone'; g.userData.headY = 1.7 * o.scale; g.userData.hover = true;
  return g;
}

/* ---- The Shopping Cart: a living cart with eyes, eyebrows, spiky hair and wheels that actually roll. ---- */
export function makeCartChar(opts = {}) {
  const o = Object.assign({ color: 0xbfc9d9, hair: 0xff4fd8, faceTex: null, scale: 1 }, opts);
  const g = new THREE.Group(); const metal = M(o.color, { metalness: 0.85, roughness: 0.25 }); const dark = M(0x1e2a4a, { metalness: 0.6 });
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.2), metal); basket.position.set(0, 0.95, 0); basket.castShadow = true; g.add(basket);
  for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.03), dark); bar.position.set(0, 0.62 + i * 0.16, 0.61); g.add(bar); const bar2 = bar.clone(); bar2.position.z = -0.61; g.add(bar2); }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), M(0xff4f79)); handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.45, -0.72); g.add(handle);
  for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), dark); post.position.set(sx * 0.42, 1.2, -0.7); post.rotation.x = 0.25; g.add(post); }
  const wheels = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), M(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.42, 0.16, sz * 0.5); g.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), M(0xdddddd, { metalness: 0.9 })); hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); g.add(hub); wheels.push(w, hub); }
  // the face lives on the front of the basket
  const face = new THREE.Group(); face.position.set(0, 1.05, 0.62); g.add(face);
  if (o.faceTex) { const fh = makeFaceHead(o.faceTex, 0xe0ac7e, 0.22); fh.userData.head.visible = false; fh.position.z = -0.08; face.add(fh); g.userData.face = fh.userData.cap; }
  else { for (const sx of [-1, 1]) { const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M(0xffffff, { roughness: 0.2 })); e2.position.set(sx * 0.2, 0.05, 0.02); face.add(e2); const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(0x111111)); p.position.set(sx * 0.2, 0.05, 0.11); face.add(p); } const smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14, Math.PI), M(0xb03a4a)); smile.position.set(0, -0.14, 0.03); smile.rotation.z = Math.PI; face.add(smile); }
  for (const sx of [-1, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04), M(0x1a1a1a)); br.position.set(sx * 0.2, 0.24, 0.03); br.rotation.z = sx * -0.35; face.add(br); g.userData['brow' + (sx > 0 ? 'R' : 'L')] = br; }
  const hairM2 = hairMat(o.hair); for (let i = 0; i < 9; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), hairM2); const x = -0.36 + i * 0.09; sp.position.set(x, 1.4, 0.2 - Math.abs(x) * 0.6); sp.rotation.z = -x * 0.9; sp.rotation.x = -0.25; g.add(sp); }
  for (let i = 0; i < 4; i++) { const item = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), M(pick([0xff4f79, 0xffd23f, 0x7cff6b, 0x38f0ff]))); item.position.set(-0.25 + i * 0.17, 1.35, -0.25 + (i % 2) * 0.3); item.rotation.y = i; g.add(item); }
  g.scale.setScalar(o.scale); g.userData.wheels = wheels; g.userData.kind = 'cart'; g.userData.phase = Math.random() * 10; g.userData.headY = 1.75 * o.scale; g.userData.rolls = true;
  return g;
}

/* ---- Bobbleheads: a Classic body with a giant animal head that wobbles. ---- */
export function makeBobble(kind = 'cat', opts = {}) {
  const base = makePerson(Object.assign({ hairStyle: 'bald', faceTex: null, bag: false, hat: false, beard: false, glasses: false }, opts));
  // hide the small head parts
  base.traverse(o => { if (o.isMesh && o.position.y > 1.6 && o.parent === base) o.visible = false; });
  base.children.forEach(c => { if (c.isGroup && c.position.y > 1.6) c.visible = false; });
  const head = new THREE.Group(); head.position.y = 1.62; base.add(head); base.userData.bobble = head;
  const col = { cat: 0xffa64d, unicorn: 0xffffff, bear: 0x8a5a2b, lion: 0xe0a34d }[kind] || 0xffa64d;
  const fur = M(col, { roughness: 0.9 }); const R = 0.55;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 22, 16), fur); skull.position.y = R * 0.85; skull.castShadow = true; head.add(skull);
  const eyeW = M(0xffffff, { roughness: 0.3 }), pup = M(0x111111);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), eyeW); e.position.set(sx * 0.2, R * 0.95, R * 0.86); head.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pup); p.position.set(sx * 0.2, R * 0.95, R * 0.95); head.add(p); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M(kind === 'unicorn' ? 0xf2b5d4 : 0x2a1a10)); nose.position.set(0, R * 0.72, R * 0.98); head.add(nose);
  if (kind === 'cat' || kind === 'lion') { for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), fur); ear.position.set(sx * 0.32, R * 1.65, 0); ear.rotation.z = sx * -0.3; head.add(ear); } for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), M(0xffffff)); w.rotation.z = Math.PI / 2; w.rotation.y = sx * (0.2 + i * 0.25); w.position.set(sx * 0.3, R * 0.72 + (i - 1) * 0.05, R * 0.9); head.add(w); } }
  if (kind === 'lion') { const mane = new THREE.Mesh(new THREE.TorusGeometry(R * 1.05, 0.22, 10, 24), M(0x8a4a1a, { roughness: 1 })); mane.position.y = R * 0.85; head.add(mane); }
  if (kind === 'bear') { for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur); ear.position.set(sx * 0.38, R * 1.55, -0.05); head.add(ear); } const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M(0xd9a877)); muzzle.position.set(0, R * 0.7, R * 0.85); muzzle.scale.set(1, 0.75, 0.8); head.add(muzzle); }
  if (kind === 'unicorn') { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.6, metalness: 0.5 })); horn.position.set(0, R * 1.85, 0.1); horn.rotation.x = -0.25; head.add(horn); for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 4), fur); ear.position.set(sx * 0.3, R * 1.6, -0.1); head.add(ear); } const mane = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 10), rainbowMaterial()); mane.position.set(0, R * 1.05, -R * 0.75); mane.rotation.x = 0.4; head.add(mane); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 14, Math.PI), M(0x2a1a10)); smile.position.set(0, R * 0.58, R * 0.9); smile.rotation.z = Math.PI; head.add(smile);
  if (opts.faceTex) { head.children.forEach(c => { if (c !== skull && c.position.z > R * 0.8) c.visible = false; }); const cap = makeFaceCap(opts.faceTex, R * 1.05); cap.position.set(0, R * 0.83, 0.01); head.add(cap); }
  base.userData.kind = 'bobble'; base.userData.headY = 2.9 * (opts.scale || 1);
  return base;
}

/* Build any character from a CHARACTERS entry + saved avatar options. Returns a Promise for GLB kinds. */
function addExtras(g, av) {
  const y = (g.userData.headY || 2) - 0.25;
  if (av.cape) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3, 4, 6), M(av.capeColor || 0xb51a1a, { side: THREE.DoubleSide })); c.position.set(0, 1.35, -0.32); c.rotation.x = 0.18; g.add(c); g.userData.cape = c; }
  if (av.wings) { for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: pick([0xb08cff, 0x38f0ff, 0xff4fd8]), transparent: true, opacity: 0.8, side: THREE.DoubleSide, emissive: 0x333333 })); w.position.set(sx * 0.5, 1.3, -0.3); w.rotation.y = sx * 0.6; g.add(w); g.userData['wing' + (sx > 0 ? 'R' : 'L')] = w; } }
  if (av.crown) { const cr = new THREE.Group(); cr.position.y = y + 0.22; const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide })); cr.add(band); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), band.material); pt.position.set(Math.cos(a) * 0.24, 0.12, Math.sin(a) * 0.24); cr.add(pt); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M(pick([0xff4f79, 0x38f0ff, 0x7cff6b]), { emissive: 0x222222 })); gem.position.set(Math.cos(a) * 0.25, 0.02, Math.sin(a) * 0.25); cr.add(gem); } g.add(cr); }
  if (av.backpack) { const bp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.22), M(av.shirt ? 0x1e2a4a : 0x2b8a3e)); bp.position.set(0, 1.2, -0.36); g.add(bp); for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.04), M(0x111111)); st.position.set(sx * 0.14, 1.3, -0.24); g.add(st); } }
  if (av.skateboard) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.9), M(0xff4f79)); b.position.set(0.05, 0.03, 0); g.add(b); for (const sz of [-0.3, 0.3]) for (const sx of [-0.1, 0.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), M(0xffffff)); w.rotation.z = Math.PI / 2; w.position.set(0.05 + sx, 0.04, sz); g.add(w); } g.userData.skate = true; }
  return g;
}
export function makePet(kind) {
  const g = new THREE.Group(); const col = { dog: 0xc8934a, cat: 0x8a8a8a, dragon: 0x3ddc84, duck: 0xffd23f, robopup: 0xbfc9d9, unicorn: 0xffffff }[kind] || 0xc8934a; const m = M(col, { roughness: 0.8, metalness: kind === 'robopup' ? 0.7 : 0 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 4, 8), m); body.rotation.z = Math.PI / 2; body.position.y = 0.32; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), m); head.position.set(0, 0.42, 0.3); g.add(head);
  for (const sx of [-1, 1]) { const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0x111111)); e2.position.set(sx * 0.06, 0.47, 0.44); g.add(e2); }
  const legs = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), m); l.position.set(sx * 0.1, 0.12, sz * 0.14); g.add(l); legs.push(l); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 6), m); tail.position.set(0, 0.42, -0.32); tail.rotation.x = 0.9; g.add(tail);
  if (kind === 'dog') { for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.04), M(0x8a5a2b)); ear.position.set(sx * 0.14, 0.44, 0.28); g.add(ear); } }
  if (kind === 'cat') { for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), m); ear.position.set(sx * 0.1, 0.56, 0.28); g.add(ear); } }
  if (kind === 'dragon') { for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), M(0x1a8a4a, { side: THREE.DoubleSide })); w.position.set(sx * 0.28, 0.45, 0); w.rotation.y = sx * 0.5; g.add(w); g.userData['wing' + (sx > 0 ? 'R' : 'L')] = w; } for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), M(0xffd23f)); sp.position.set(0, 0.5, 0.15 - i * 0.12); g.add(sp); } }
  if (kind === 'duck') { const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), M(0xff8a3d)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.4, 0.48); g.add(beak); }
  if (kind === 'robopup') { const ant = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff4f79, emissive: 0xff4f79, emissiveIntensity: 2 })); ant.position.set(0, 0.62, 0.3); g.add(ant); }
  if (kind === 'unicorn') { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.6 })); horn.position.set(0, 0.62, 0.33); horn.rotation.x = -0.3; g.add(horn); const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), rainbowMaterial()); mane.position.set(0, 0.5, 0.05); g.add(mane); }
  g.userData.legs = legs; g.userData.tail = tail; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}
export function animatePet(p, t, speed) { const u = p.userData; const s = Math.sin(t * 10) * 0.5 * speed; u.legs.forEach((l, i) => { l.rotation.x = s * (i % 2 ? 1 : -1); }); u.tail.rotation.z = Math.sin(t * 6) * 0.5; if (u.wingL) { u.wingL.rotation.z = Math.sin(t * 8) * 0.5; u.wingR.rotation.z = -Math.sin(t * 8) * 0.5; } }

export function buildCharacter(ch, av = {}, faceTex = null) {
  const common = { shirt: av.shirt, pants: av.pants, skin: av.skin, hair: av.hair, hairStyle: av.hairStyle, hat: !!av.hat, sunglasses: !!av.sunglasses, headphones: !!av.headphones, bag: false, glasses: false, beard: false, dress: !!av.dress, scale: 1 };
  Object.keys(common).forEach(k => common[k] === undefined && delete common[k]);
  if (ch.kind === 'classic') return Promise.resolve(makePerson(Object.assign({ age: ch.age || 'adult', faceTex: ch.face ? faceTex : null, hairStyle: 'short', hair: 0x4a2e15, skin: 0xe0ac7e, shirt: 0x38f0ff, pants: 0x1e2a4a }, common, ch.age === 'kid' ? { scale: 0.68 } : {})));
  if (ch.kind === 'alien') return Promise.resolve(makeAlien({ suit: av.shirt || 0xb08cff, sunglasses: !!av.sunglasses, faceTex: ch.face ? faceTex : null }));
  if (ch.kind === 'robot') return Promise.resolve(makeRobot({ accent: av.shirt || 0x38f0ff, faceTex: ch.face ? faceTex : null }));
  if (ch.kind === 'drone') return Promise.resolve(makeDrone({ accent: av.shirt || 0x38f0ff }));
  if (ch.kind === 'bobble') return Promise.resolve(makeBobble(ch.bobble, Object.assign({ faceTex: ch.face ? faceTex : null }, common)));
  if (ch.kind === 'cart') return Promise.resolve(makeCartChar({ color: av.shirt || 0xbfc9d9, hair: av.hair || 0xff4fd8, faceTex: ch.face ? faceTex : null }));
  if (ch.kind === 'glb') return loadRiggedPerson(ch.model, Object.assign({ faceTex: ch.face ? faceTex : null }, common)).catch(err => { console.error('rigged character failed, using Classic', err); if (window.WVM_APP) WVM_APP.toast('⚠️ 3D character could not load (' + (err && err.message ? err.message : err) + '). Using Classic.', 6000); return makePerson(Object.assign({ age: 'adult', faceTex: faceTex, hairStyle: 'short' }, common)); });
  return Promise.resolve(makePerson(common));
}

/* Rigged GLB character (Quaternius-style: materials named Skin / Hair_*; clips Idle, Walk, Run, Wave...).
   Normalized to 1.8 units tall, feet on the ground, facing +Z like the Classic. */
const gltfLoader = new GLTFLoader();
const glbCache = new Map();
export function loadRiggedPerson(url, opts = {}) {
  const p = glbCache.get(url) || new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
  glbCache.set(url, p);
  return p.then(gltf => {
    const src = gltf.scene; const model = cloneSkinned(src);
    const g = new THREE.Group(); g.add(model);
    // normalize height + ground
    const box = new THREE.Box3().setFromObject(model); const h = box.max.y - box.min.y || 1.8; const s = (opts.height || 1.8) / h; model.scale.setScalar(s);
    model.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
    model.rotation.y = opts.yaw || 0;
    // materials: recolor hair / skin, drop weapons if any
    const hair = opts.hair; const skin = opts.skin;
    model.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
      const name = (o.name || '').toLowerCase(); if (/gun|sword|rifle|pistol|weapon|knife|axe/.test(name)) { o.visible = false; return; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map(mt => { const m = mt.clone(); const n = (m.name || '').toLowerCase(); if (hair !== undefined && n.includes('hair')) { if (hair === 'rainbow') return rainbowMaterial(); m.color.set(hair); } if (skin !== undefined && n === 'skin') m.color.set(skin); if (opts.shirt !== undefined && /white|pink|orange|grey|gray|shirt|top|jacket/.test(n) && !n.includes('hair')) m.color.set(opts.shirt); return m; });
      if (Array.isArray(o.material) && o.material.length === 1) o.material = o.material[0];
    });
    // animation
    const mixer = new THREE.AnimationMixer(model); const clips = {}; for (const c of gltf.animations) clips[c.name] = c;
    const find = (names) => { for (const n of names) if (clips[n]) return clips[n]; return null; };
    const idleC = find(['Idle_Neutral', 'Idle', 'idle']), walkC = find(['Walk', 'walk', 'Walking']), runC = find(['Run', 'run', 'Running']), waveC = find(['Wave', 'wave']), sitC = find(['Sit', 'sit']);
    const act = (c) => { if (!c) return null; const a = mixer.clipAction(c); a.enabled = true; a.setEffectiveWeight(0); a.play(); return a; };
    g.userData.actions = { idle: act(idleC), walk: act(walkC), run: act(runC), wave: act(waveC), sit: act(sitC) };
    if (g.userData.actions.idle) g.userData.actions.idle.setEffectiveWeight(1);
    g.userData.mixer = mixer; g.userData.model = model; g.userData.kind = 'glb'; g.userData.headY = (opts.height || 1.8) + 0.1; g.userData.phase = Math.random() * 10;
    g.userData.limbs = null; g.userData.lastT = 0;
    // selfie face on the rigged head: a small floating face plate parented to the head bone
    if (opts.faceTex) {
      let headBone = null; model.traverse(o => { if (!headBone && o.isBone && /head/i.test(o.name)) headBone = o; });
      let headMesh = null; model.traverse(o => { if (!headMesh && o.isMesh && /head/i.test(o.name)) headMesh = o; });
      {
        model.updateMatrixWorld(true); const box = new THREE.Box3(); if (headMesh) { headMesh.geometry.computeBoundingBox(); box.copy(headMesh.geometry.boundingBox).applyMatrix4(headMesh.matrixWorld); } else { box.setFromCenterAndSize(new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0.3, 0.3, 0.3)); }
        const size = new THREE.Vector3(); box.getSize(size); const center = new THREE.Vector3(); box.getCenter(center); const r = Math.max(0.09, Math.min(size.x, size.y) * 0.5 * 0.98);
        const hr = 0.125 * ((opts.height || 1.8) / 1.8);
        const plate = makeFaceHead(opts.faceTex, skin || 0xe0ac7e, hr);
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat(hair === undefined ? 0x4a2e15 : hair)); hairCap.position.y = hr * 0.1; plate.add(hairCap);
        if (headMesh) headMesh.visible = false;
        g.add(plate); g.userData.faceHead = plate; g.userData.headBone = headBone; g.userData.headOffset = new THREE.Vector3(0, hr * 0.55, 0.02); if (!headBone) plate.position.set(0, (opts.height || 1.8) - hr * 0.55, 0.02);
        g.userData.face = plate.userData.cap;
      }
    }
    if (opts.sunglasses) { let hb = null; model.traverse(o => { if (!hb && o.isBone && /head/i.test(o.name)) hb = o; }); if (hb) { const f = new THREE.Group(); addSunglasses(f, 0.06 / s, 0.08 / s); f.scale.setScalar(1 / s); hb.add(f); } }
    return g;
  });
}
/* SkeletonUtils.clone without importing the addon (keeps the import map small). */
function cloneSkinned(source) {
  const sourceLookup = new Map(); const cloneLookup = new Map();
  const clone = source.clone();
  parallelTraverse(source, clone, (a, b) => { sourceLookup.set(b, a); cloneLookup.set(a, b); });
  clone.traverse(node => {
    if (!node.isSkinnedMesh) return; const sourceMesh = sourceLookup.get(node); const sourceBones = sourceMesh.skeleton.bones;
    node.skeleton = sourceMesh.skeleton.clone(); node.bindMatrix.copy(sourceMesh.bindMatrix);
    node.skeleton.bones = sourceBones.map(b => cloneLookup.get(b)); node.bind(node.skeleton, node.bindMatrix);
  });
  return clone;
}
function parallelTraverse(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i], cb); }

/* Two-mesh rider for coaster cars (cheap). */
/* ------------------------------------------------------------
   Planet Earth (v7): one shared, code-drawn equirectangular map with real continent outlines,
   biomes (forest, desert, tundra, ice), mountain ranges, shallow seas and a separate cloud layer.
   makeEarth(radius) → a globe Group.  earthDiscTexture() → the planet seen from orbit (for the view below the island).
------------------------------------------------------------ */
const EARTH_LAND = [
  [[-168,66],[-156,71],[-140,70],[-125,70],[-110,68],[-95,72],[-82,73],[-78,68],[-65,60],[-56,52],[-66,45],[-70,42],[-75,37],[-81,31],[-80,25],[-84,30],[-90,29],[-97,26],[-97,20],[-91,18],[-87,21],[-88,16],[-83,10],[-78,8],[-80,8],[-85,11],[-92,15],[-97,16],[-105,20],[-110,24],[-113,30],[-117,33],[-122,37],[-124,43],[-124,48],[-130,54],[-140,59],[-150,60],[-158,57],[-165,55],[-162,60],[-166,63]],
  [[-52,60],[-44,60],[-38,65],[-22,70],[-20,76],[-30,82],[-55,82],[-68,78],[-60,72],[-54,66]],
  [[-78,8],[-72,12],[-62,10],[-52,5],[-50,0],[-38,-4],[-35,-8],[-39,-15],[-41,-22],[-48,-26],[-53,-33],[-58,-38],[-65,-42],[-67,-50],[-69,-54],[-74,-52],[-75,-45],[-72,-35],[-71,-25],[-70,-18],[-76,-13],[-81,-5],[-80,0]],
  [[-17,15],[-16,21],[-10,29],[-6,35],[3,37],[10,37],[11,33],[20,32],[25,31],[32,31],[35,28],[37,21],[43,12],[51,12],[48,5],[42,-2],[40,-10],[40,-16],[35,-22],[32,-28],[27,-34],[20,-35],[17,-30],[14,-22],[12,-15],[13,-8],[9,-1],[9,4],[5,5],[-4,5],[-8,4],[-13,8],[-17,12]],
  [[-9,37],[-9,43],[-1,44],[-4,48],[2,51],[8,54],[14,54],[21,55],[22,58],[28,60],[30,66],[44,68],[60,69],[68,72],[80,73],[100,77],[113,74],[130,71],[150,70],[170,69],[180,68],[178,64],[172,61],[163,58],[156,51],[160,60],[155,59],[143,59],[135,55],[141,52],[140,46],[133,43],[128,40],[127,35],[125,38],[122,40],[118,38],[121,35],[122,30],[118,24],[110,21],[108,17],[109,12],[105,9],[100,13],[99,8],[103,2],[101,3],[98,8],[98,16],[94,17],[91,22],[86,20],[80,15],[80,10],[77,8],[73,16],[72,21],[67,24],[61,25],[57,26],[56,24],[59,22],[55,17],[45,13],[43,15],[39,21],[35,28],[34,31],[36,36],[30,36],[27,37],[26,40],[29,41],[40,41],[41,43],[37,45],[33,45],[30,46],[28,42],[24,40],[23,37],[20,40],[19,42],[14,45],[12,44],[18,40],[16,38],[15,40],[12,42],[9,44],[3,43],[0,39],[-2,37],[-5,36]],
  [[5,58],[8,58],[12,56],[14,56],[17,59],[18,63],[22,66],[25,66],[24,64],[21,61],[23,60],[29,60],[30,66],[41,67],[40,64],[33,65],[32,70],[25,71],[15,69],[10,64],[5,62]],
  [[-5,50],[1,51],[1,53],[-2,56],[-2,58],[-5,58],[-6,56],[-3,54],[-5,52]], [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]], [[-24,65],[-22,66],[-15,66],[-14,65],[-18,63],[-22,64]],
  [[130,31],[132,34],[136,34],[140,35],[142,39],[141,41],[145,44],[142,45],[140,42],[139,38],[136,36],[132,35],[130,33]],
  [[114,-22],[114,-34],[118,-35],[124,-33],[131,-31],[135,-35],[139,-36],[144,-38],[150,-37],[153,-28],[149,-21],[146,-19],[145,-15],[142,-11],[141,-17],[136,-12],[131,-12],[129,-15],[125,-14],[122,-18]],
  [[173,-35],[178,-38],[175,-41],[172,-43],[171,-46],[167,-46],[170,-42],[173,-40]],
  [[95,5],[98,4],[104,-2],[106,-6],[102,-4],[98,1]], [[109,1],[113,4],[117,7],[119,5],[117,1],[116,-4],[111,-3]], [[106,-6],[110,-7],[114,-8],[110,-8]], [[131,-1],[135,-3],[141,-3],[147,-6],[150,-10],[144,-8],[138,-8],[133,-4]], [[120,18],[122,18],[124,13],[126,8],[124,6],[122,10],[120,14]], [[119,1],[125,1],[122,-1],[123,-5],[120,-5]],
  [[44,-16],[49,-12],[50,-16],[47,-25],[44,-24],[43,-20]], [[-85,22],[-80,23],[-75,20],[-78,20],[-84,21]], [[-74,19],[-69,19],[-68,18],[-72,18]], [[80,9],[82,7],[81,6],[80,7]], [[120,25],[122,25],[121,22]],
];
const EARTH_DESERT = [[10, 23, 27, 8, '#d9b77a'], [48, 23, 9, 8, '#d6b275'], [85, 41, 26, 6, '#c9ad7a'], [133, -25, 11, 6, '#c98f5a'], [-110, 31, 8, 7, '#cfae78'], [20, -23, 6, 5, '#caa66c'], [-69, -23, 2.5, 8, '#c9a874'], [62, 31, 7, 5, '#cdb07c'], [-68, -44, 3, 7, '#b9a874']];
const EARTH_RANGES = [[[-72,8],[-77,-5],[-70,-18],[-70,-33],[-72,-48]], [[-150,62],[-130,56],[-122,48],[-112,42],[-106,36],[-104,26]], [[70,36],[78,33],[86,28],[96,28],[102,30]], [[6,45],[10,47],[15,47]], [[40,42],[47,41]], [[-5,32],[5,35]], [[36,8],[38,0],[34,-8]], [[58,65],[60,55]], [[146,-20],[150,-32]], [[88,48],[98,50]]];
let _earthCv = null, _earthTex = null, _cloudTex = null;
export function earthCanvas() {
  if (_earthCv) return _earthCv;
  const W = isMobile() ? 1024 : 2048, H = W / 2; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  let seed = 20260921; const rn = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  // ocean: deep blue, lighter toward the tropics
  const og = g.createLinearGradient(0, 0, 0, H); og.addColorStop(0, '#0a2a55'); og.addColorStop(0.3, '#0b3f7d'); og.addColorStop(0.5, '#0e5697'); og.addColorStop(0.7, '#0b3f7d'); og.addColorStop(1, '#0a2a55'); g.fillStyle = og; g.fillRect(0, 0, W, H);
  const trace = (poly) => { g.beginPath(); const n = poly.length; const mx = (i) => [(X(poly[i % n][0]) + X(poly[(i + 1) % n][0])) / 2, (Y(poly[i % n][1]) + Y(poly[(i + 1) % n][1])) / 2]; const m0 = mx(0); g.moveTo(m0[0], m0[1]); for (let i = 1; i <= n; i++) { const p = poly[i % n], m = mx(i); g.quadraticCurveTo(X(p[0]), Y(p[1]), m[0], m[1]); } g.closePath(); };
  // shallow seas: a soft turquoise halo around every coast
  g.save(); g.shadowColor = 'rgba(64,190,215,0.85)'; g.shadowBlur = W / 90; g.fillStyle = 'rgba(64,190,215,0.55)'; for (const p of EARTH_LAND) { trace(p); g.fill(); } g.restore();
  // land, clipped: latitude biomes, deserts, forests, mountains, grain
  g.save(); g.beginPath(); for (const poly of EARTH_LAND) { const n = poly.length; const mx = (i) => [(X(poly[i % n][0]) + X(poly[(i + 1) % n][0])) / 2, (Y(poly[i % n][1]) + Y(poly[(i + 1) % n][1])) / 2]; const m0 = mx(0); g.moveTo(m0[0], m0[1]); for (let i = 1; i <= n; i++) { const p = poly[i % n], m = mx(i); g.quadraticCurveTo(X(p[0]), Y(p[1]), m[0], m[1]); } g.closePath(); } g.clip();
  const lg = g.createLinearGradient(0, 0, 0, H); const stops = [[0, '#f4f7fb'], [0.1, '#e6ebee'], [0.17, '#8d9a7c'], [0.24, '#4f7a48'], [0.33, '#5f8a48'], [0.4, '#86934f'], [0.47, '#3f7d3a'], [0.53, '#2f7436'], [0.62, '#7d8f4a'], [0.72, '#5d8446'], [0.8, '#8a957a'], [0.86, '#eef2f6'], [1, '#ffffff']]; for (const [k, col] of stops) lg.addColorStop(k, col); g.fillStyle = lg; g.fillRect(0, 0, W, H);
  for (const [lon, lat, rx, ry, col] of EARTH_DESERT) { const gx = X(lon), gy = Y(lat), R = rx / 360 * W; g.save(); g.translate(gx, gy); g.scale(1, (ry / 180 * H) / R); const rg = g.createRadialGradient(0, 0, R * 0.25, 0, 0, R); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(210,180,120,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R, 0, 6.2832); g.fill(); g.restore(); }
  // rainforests: Amazon, Congo, SE Asia
  for (const [lon, lat, rx, ry] of [[-62, -4, 13, 9], [21, 0, 9, 6], [103, 3, 12, 8], [-88, 15, 5, 4], [142, -5, 6, 3]]) { const gx = X(lon), gy = Y(lat), R = rx / 360 * W; g.save(); g.translate(gx, gy); g.scale(1, (ry / 180 * H) / R); const rg = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R); rg.addColorStop(0, 'rgba(24,92,40,0.95)'); rg.addColorStop(1, 'rgba(24,92,40,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R, 0, 6.2832); g.fill(); g.restore(); }
  // grain: thousands of tiny patches so the land never looks flat
  for (let i = 0; i < (W > 1024 ? 9000 : 3500); i++) { const x = rn() * W, y = rn() * H; const s = 1 + rn() * (W / 400); g.fillStyle = rn() < 0.5 ? 'rgba(20,50,20,0.10)' : 'rgba(235,225,180,0.09)'; g.fillRect(x, y, s * 2, s); }
  // mountain ranges: a dark ridge with a snow line
  g.lineCap = 'round'; g.lineJoin = 'round'; for (const r of EARTH_RANGES) { g.shadowColor = 'rgba(80,62,40,0.5)'; g.shadowBlur = W / 160; for (const [lw, col] of [[W / 120, 'rgba(118,98,72,0.38)'], [W / 260, 'rgba(96,78,56,0.45)'], [W / 700, 'rgba(244,247,250,0.55)']]) { g.beginPath(); r.forEach((p, i) => { const x = X(p[0]) + (i ? (rn() - 0.5) * 3 : 0), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); } } g.shadowBlur = 0;
  // Greenland ice sheet
  g.fillStyle = 'rgba(248,251,255,0.92)'; g.beginPath(); g.ellipse(X(-41), Y(73), W * 0.028, H * 0.055, 0, 0, 6.2832); g.fill();
  g.restore();
  // Antarctica + Arctic sea ice, ragged edges
  g.fillStyle = '#f6f9fd'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 96) g.lineTo(x, Y(-70 - Math.sin(x / W * 25) * 3 - rn() * 3)); g.lineTo(W, H); g.closePath(); g.fill();
  g.fillStyle = 'rgba(240,246,252,0.9)'; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= W; x += W / 96) g.lineTo(x, Y(83 + Math.sin(x / W * 19) * 3 + rn() * 2)); g.lineTo(W, 0); g.closePath(); g.fill();
  _earthCv = c; return c;
}
export function earthTexture() { if (_earthTex) return _earthTex; const t = new THREE.CanvasTexture(earthCanvas()); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; _earthTex = t; return t; }
export function cloudTexture() {
  if (_cloudTex) return _cloudTex; const W = isMobile() ? 512 : 1024, H = W / 2; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let seed = 99173; const rn = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const puff = (x, y, r, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  for (let k = 0; k < 46; k++) { const band = [0.2, 0.34, 0.5, 0.66, 0.8][k % 5]; let x = rn() * W, y = (band + (rn() - 0.5) * 0.14) * H; const n = 8 + rn() * 18, dir = (rn() - 0.5) * 0.5; for (let i = 0; i < n; i++) { const r = W * (0.008 + rn() * 0.02); puff(x, y, r, 0.35 + rn() * 0.4); if (x < r) puff(x + W, y, r, 0.4); if (x > W - r) puff(x - W, y, r, 0.4); x = (x + W * 0.012 + W) % W; y += dir * W * 0.006 + (rn() - 0.5) * W * 0.006; } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; _cloudTex = t; return t;
}
/* A globe: surface + drifting clouds + a thin blue atmosphere. It lights itself a little, so it never reads as a dark ball from below.
   userData.spin(dt) turns it; clouds drift a touch faster than the ground. */
export function makeEarth(radius = 5, o = {}) {
  const seg = o.segments || (isMobile() ? 32 : 48); const g = new THREE.Group(); const tex = earthTexture();
  const surf = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.66)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow ?? 0.42, fog: o.fog ?? true })); surf.userData.noShadow = true; g.add(surf);
  let clouds = null; if (o.clouds !== false) { clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, seg, Math.round(seg * 0.66)), new THREE.MeshStandardMaterial({ map: cloudTexture(), transparent: true, opacity: 0.9, depthWrite: false, roughness: 1, emissive: 0xffffff, emissiveMap: cloudTexture(), emissiveIntensity: 0.25, fog: o.fog ?? true })); clouds.userData.noShadow = true; clouds.userData.noOcclude = true; clouds.renderOrder = -3; g.add(clouds); }
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, seg, Math.round(seg * 0.66)), new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false, fog: o.fog ?? true })); atmo.userData.noShadow = true; atmo.userData.noOcclude = true; atmo.renderOrder = -4; atmo.material.opacity = 0.1; g.add(atmo);
  g.rotation.z = o.tilt ?? 0.41; g.userData.surface = surf; g.userData.spin = (dt, k = 1) => { surf.rotation.y += dt * 0.06 * k; if (clouds) clouds.rotation.y += dt * 0.085 * k; };
  return g;
}
/* The planet seen from orbit, projected onto a flat disc texture (for the Earth far below the floating island). */
export function earthDiscTexture(size = isMobile() ? 512 : 768, lat0 = 24, lon0 = -48) {
  const src = earthCanvas(); const sw = src.width, sh = src.height; const sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const cl = cloudTexture().image; const cw = cl.width, chh = cl.height; const cd = cl.getContext('2d').getImageData(0, 0, cw, chh).data;
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const img = g.createImageData(size, size), D = img.data;
  const la = lat0 * Math.PI / 180, lo = lon0 * Math.PI / 180, sl = Math.sin(la), clat = Math.cos(la); const sky = [191, 220, 242];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = (px + 0.5) / size * 2 - 1, v = 1 - (py + 0.5) / size * 2; const r2 = u * u + v * v; const i = (py * size + px) * 4;
    if (r2 >= 1) { D[i] = sky[0]; D[i + 1] = sky[1]; D[i + 2] = sky[2]; D[i + 3] = 255; continue; }
    const z = Math.sqrt(1 - r2); const y2 = v * clat + z * sl, z2 = -v * sl + z * clat; const lat = Math.asin(clamp(y2, -1, 1)), lon = lo + Math.atan2(u, z2);
    let sx = Math.floor(((lon / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * sw), sy = Math.min(sh - 1, Math.floor((0.5 - lat / Math.PI) * sh)); const si = (sy * sw + sx) * 4;
    const cx = Math.floor(sx / sw * cw), cy = Math.min(chh - 1, Math.floor(sy / sh * chh)); const ca = cd[(cy * cw + cx) * 4 + 3] / 255 * 0.5;
    const limb = Math.pow(1 - z, 2.2); // haze toward the rim
    for (let k = 0; k < 3; k++) { let val = sd[si + k] * (0.78 + 0.3 * z); val = val * (1 - ca) + 255 * ca; D[i + k] = val * (1 - limb) + sky[k] * limb; } D[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function makeRider(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 6), new THREE.MeshStandardMaterial({ color: color || pick([0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff]) })); b.position.y = 0.35; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: pick(skinTones) })); h.position.y = 0.78; g.add(h);
  return g;
}
/* Animate any character. speed 0 = idle, ~1 = walk, >1.4 = run. Works for Classic limbs, rigged mixers, drones and bobbleheads. */
export function animatePerson(p, t, speed = 1) {
  const u = p.userData;
  if (u.mixer) {
    const dt = clamp(t - (u.lastT || t), 0, 0.05); u.lastT = t; u.mixer.update(dt);
    if (u.faceHead && u.headBone) { p.updateMatrixWorld(true); const v = new THREE.Vector3(); u.headBone.getWorldPosition(v); p.worldToLocal(v); u.faceHead.position.copy(v).add(u.headOffset); }
    const A = u.actions; const want = u.pose === 'sit' && A.sit ? 'sit' : u.pose === 'wave' && A.wave ? 'wave' : speed > 1.4 && A.run ? 'run' : speed > 0.05 && A.walk ? 'walk' : 'idle';
    for (const k of Object.keys(A)) { const a = A[k]; if (!a) continue; const target = k === want ? 1 : 0; a.setEffectiveWeight(lerp(a.getEffectiveWeight(), target, 0.12)); if (k === 'walk' || k === 'run') a.setEffectiveTimeScale(clamp(speed, 0.6, 1.8)); }
    return;
  }
  if (u.cape) u.cape.rotation.x = 0.18 + Math.min(1, speed) * 0.5 + Math.sin(t * 6) * 0.05 * Math.min(1, speed); if (u.wingL) { u.wingL.rotation.y = 0.6 + Math.sin(t * 9) * 0.4; u.wingR.rotation.y = -0.6 - Math.sin(t * 9) * 0.4; }
  if (u.rolls) { for (const w of u.wheels) w.rotation.x += speed * 0.25; const wob = Math.sin((t + u.phase) * 12) * 0.03 * Math.min(1, speed); p.rotation.z = wob; if (u.browL) { u.browL.rotation.z = -0.35 + Math.sin(t * 1.5) * 0.25; u.browR.rotation.z = 0.35 - Math.sin(t * 1.5) * 0.25; } return; }
  if (u.hover) { p.position.y += 0; const bob = Math.sin((t + u.phase) * 2.2) * 0.06; if (u.model) u.model.position.y = bob; else p.children.forEach(c => { c.position.y = (c.userData.baseY ?? (c.userData.baseY = c.position.y)) + bob; }); for (const r of (u.rotors || [])) r.rotation.y += 0.6 + speed * 0.3; return; }
  const Lm = u.limbs; if (!Lm) return;
  if (u.pose === 'sit') { if (u.bobble) u.bobble.rotation.z = Math.sin((t + u.phase) * 3.5) * 0.08; return; }
  const s = Math.sin((t + u.phase) * 8 * speed) * (u.stiff ? 0.35 : 0.55) * Math.min(1, speed);
  Lm.lL.rotation.x = s; Lm.lR.rotation.x = -s; Lm.aL.rotation.x = -s * 0.8; Lm.aR.rotation.x = s * 0.8;
  if (u.ponytail) u.ponytail.rotation.x = 0.35 + s * 0.3;
  if (u.bobble) { u.bobble.rotation.z = Math.sin((t + u.phase) * 3.5) * 0.12 * (0.3 + Math.min(1, speed)); u.bobble.rotation.x = Math.sin((t + u.phase) * 2.7) * 0.06; }
}
/* Put a character in a seated pose (cart, theater, bench). Returns the eye/head clearance height. */
export function sitPerson(p, on = true) {
  const u = p.userData; u.pose = on ? 'sit' : null;
  if (u.limbs) { const L = u.limbs; if (on) { L.lL.rotation.x = L.lR.rotation.x = 1.35; L.aL.rotation.x = L.aR.rotation.x = -0.9; L.lL.position.y = L.lR.position.y = 0.42; } else { L.lL.rotation.x = L.lR.rotation.x = L.aL.rotation.x = L.aR.rotation.x = 0; L.lL.position.y = L.lR.position.y = 0.45; } }
  if (u.model && !u.actions?.sit) { u.model.rotation.x = on ? 0 : 0; }
  return (u.headY || 2) * (on ? 0.8 : 1);
}

/* ------------------------------------------------------------
   The Engine
------------------------------------------------------------ */
export class WVM {
  constructor(opts = {}) {
    this.opts = Object.assign({
      title: 'World VR Mall', sky: SKIES.day, nightSky: SKIES.night, autoNight: true, fog: 0x9fd3ff, fogNear: 60, fogFar: 420,
      spawn: new THREE.Vector3(0, 0, 20), spawnYaw: Math.PI, thirdPerson: true,
      groundY: () => 0, walkSpeed: 6.5, runSpeed: 11, worldName: 'Outside World', page: 'index',
      showSelfieOnFirstVisit: true, exposure: 1.0, shadows: !isIOS(), bloom: !isMobile(), bloomStrength: 0.45, envFromSky: !isMobile(),
      shadowSize: isMobile() ? 1024 : 2048, shadowRange: isMobile() ? 45 : 70, maxDist: 320,
    }, opts);
    this.t = 0; this.clock = new THREE.Clock();
    this.updaters = []; this.hotspots = []; this.obstacles = []; this.npcs = [];
    this.keys = {}; this.moveVec = new THREE.Vector2(); this.running = false;
    this.yaw = this.opts.spawnYaw; this.pitch = -0.1; this.dist = this.opts.thirdPerson ? 7 : 0.01;
    this.targetDist = this.dist; this.walkTarget = null;
    this.zones = []; this.paused = false; this.ride = null; this.vehicle = null; this.viewMode = 'follow'; this.walked = 0; this._stepHooks = [];
    this.places = []; this.boosts = []; this._boost = 0; this._route = null; this.roll = 0; this.speedMul = 1; this.speedIdx = 1; this.arrival = {};
    try { const q = new URLSearchParams(location.search); this.arrival = { to: q.get('to'), ride: q.get('ride') }; } catch (e) { }
    this._build();
  }

  /* ----- setup ----- */
  _build() {
    const o = this.opts;
    document.body.classList.add('wvm');
    this._injectCSS();
    this._buildHUD();

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: !isMobile() && window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? 1.25 : 1.75));
    const pre = document.getElementById('wvm-preload'); if (pre) pre.remove();
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure;
    if (o.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = isMobile() ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; }
    renderer.xr.enabled = true; renderer.localClippingEnabled = true;
    renderer.domElement.id = 'wvm-canvas';
    this.stage.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(o.fog, o.fogNear, o.fogFar);
    const camera = this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 2400);
    this.rig = new THREE.Group(); this.rig.add(camera); scene.add(this.rig);
    this.baseFov = 70;

    // lights: sky dome light + warm sun that casts soft shadows + cool fill
    const hemi = this.hemi = new THREE.HemisphereLight(0xcfe9ff, 0x4a6b3a, 0.75); scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 1.9); sun.position.set(-120, 140, -160); scene.add(sun); scene.add(sun.target);
    if (o.shadows) { sun.castShadow = true; sun.shadow.mapSize.set(o.shadowSize, o.shadowSize); const r = o.shadowRange; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 500 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4; }
    const fill = this.fill = new THREE.DirectionalLight(0xbfe1ff, 0.3); fill.position.set(80, 40, 120); scene.add(fill);

    // post-processing: bloom makes neon, water and glass glow. Off on phones (and always off inside VR).
    if (o.bloom) {
      try {
        const composer = this.composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), o.bloomStrength, 0.6, 0.85);
        composer.addPass(bloom); composer.addPass(new OutputPass());
      } catch (e) { console.warn('bloom unavailable', e); this.composer = null; }
    }

    // loading manager → teleport bar
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (u, l, t) => this._progress(0.15 + 0.6 * (l / Math.max(1, t)));
    this.texLoader = new THREE.TextureLoader(this.manager);

    // sky (day or night by the clock)
    this.setSky((o.autoNight && isNightNow() && o.nightSky) ? o.nightSky : o.sky);

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
    this.bag = this._load('wvm_bag', []); this._renderBag(); this.coins = this._load('wvm_coins', 0); this.coinBadge.textContent = this.coins;
    const savedPet = (this._load('wvm_avatar', {}) || {}).pet; if (savedPet && savedPet !== 'none') setTimeout(() => this.setPet(savedPet), 500);
    if (!o.shadows) { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'); const gr = q.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, 64, 64); const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; blob.userData.noCull = true; scene.add(blob); this.onUpdate(() => { const p = this.player.position; blob.visible = !this.ride && this.dist > 0.6 && !(this._sw && this._sw.on); blob.position.set(p.x, p.y + 0.05, p.z); const s = this.vehicle ? 2.2 : 1; blob.scale.set(s, s, 1); }); }
    // shadow camera follows the player so shadows stay sharp where you are
    this.onUpdate(() => { if (!this.sun.castShadow) return; const p = this.player.position; const tx = (o.shadowRange * 2) / o.shadowSize * 4; const sx = Math.round(p.x / tx) * tx, sz = Math.round(p.z / tx) * tx; this.sun.position.set(sx - 120, 140 + p.y, sz - 160); this.sun.target.position.set(sx, p.y, sz); this.sun.target.updateMatrixWorld(); });
  }

  _vrBadge() { if (this.hud.querySelector('.wvm-vrbadge')) return; const b = document.createElement('div'); b.className = 'wvm-vrbadge'; b.textContent = '🥽 Works on VR headsets too'; b.title = 'Open this same address in a headset browser and an Enter VR button appears'; this.hud.appendChild(b); }

  /* Load a 360 panorama as the sky. Pass a path WITHOUT extension to try .avif first, then .jpg.
     The previous sky texture is disposed so only one lives in memory. */
  setSky(url, opts = {}) {
    this._skyCache = this._skyCache || new Map(); this.skyUrl = url;
    if (this._skyCache.has(url)) { this._applySky(this._skyCache.get(url), opts, true); return; }
    const hasExt = /\.(avif|jpe?g|png|webp)$/i.test(url);
    const done = (tex) => { if (isMobile() && tex.image && tex.image.width > 2048) { const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; c.getContext('2d').drawImage(tex.image, 0, 0, 2048, 1024); const t2 = new THREE.CanvasTexture(c); tex.dispose(); tex = t2; } this._skyCache.set(url, tex); this._applySky(tex, opts, true); };
    const tryLoad = (u, onFail) => this.texLoader.load(u, done, undefined, onFail);
    if (hasExt) tryLoad(url, () => { this.scene.background = new THREE.Color(0x87c6ff); });
    else tryLoad(url + '.avif', () => tryLoad(url + '.jpg', () => tryLoad('/images/sky.jpg', () => { this.scene.background = new THREE.Color(0x87c6ff); })));
    this.skyUrl = url;
  }
  preloadSky(url) { this._skyCache = this._skyCache || new Map(); if (this._skyCache.has(url)) return; const hasExt = /\.(avif|jpe?g|png|webp)$/i.test(url); const u = hasExt ? url : url + '.avif'; this.texLoader.load(u, (t) => { if (!this._skyCache.has(url)) this._skyCache.set(url, t); }, undefined, () => { if (!hasExt) this.texLoader.load(url + '.jpg', (t) => { if (!this._skyCache.has(url)) this._skyCache.set(url, t); }); }); }
  buzz(ms = 60) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
  _applySky(tex, opts = {}) {
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace; if (isMobile()) { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
    this.scene.background = tex;
    if (this.opts.envFromSky) {
      const envs = this._envCache || (this._envCache = new Map()); let env = envs.get(tex);
      if (!env) { const pm = this._pmrem || (this._pmrem = new THREE.PMREMGenerator(this.renderer)); env = pm.fromEquirectangular(tex).texture; envs.set(tex, env); }
      this.scene.environment = env;
    }
    const night = opts.night ?? /night|stars|moon/i.test(this.skyUrl || '');
    this.sun.intensity = night ? 0.45 : 1.9; this.sun.color.set(night ? 0x9fb8ff : 0xfff1d6); this.hemi.intensity = night ? 0.35 : 0.75; this.fill.intensity = night ? 0.15 : 0.3;
    this.scene.fog.color.set(night ? 0x0d1b3a : this.opts.fog); this.renderer.toneMappingExposure = night ? this.opts.exposure * 0.85 : this.opts.exposure;
    this.isNight = night;
  }

  _buildAvatar() {
    const saved = this._load('wvm_avatar', {}) || {};
    const faceData = localStorage.getItem('wvm_face');
    let faceTex = null;
    if (faceData) { faceTex = new THREE.TextureLoader().load(faceData); faceTex.colorSpace = THREE.SRGBColorSpace; }
    this.faceTex = faceTex;
    const ch = CHARACTERS.find(c => c.id === (saved.character || 'hero')) || CHARACTERS[0];
    // instant placeholder so the world never shows an empty rig while a GLB downloads
    const placeholder = makePerson(Object.assign({ bag: false, faceTex, age: 'adult', scale: 1, glasses: false, beard: false, dress: false, hairStyle: 'short', hair: 0x4a2e15, skin: 0xe0ac7e, shirt: 0x38f0ff, pants: 0x1e2a4a, hat: false }, saved));
    this._setAvatar(placeholder);
    const gen = this._avatarGen = (this._avatarGen || 0) + 1;
    buildCharacter(ch, saved, faceTex).then(av => { if (gen !== this._avatarGen) return; addExtras(av, saved); this._setAvatar(av); });
  }
  _setAvatar(av) {
    if (this.avatar) { this.player.remove(this.avatar); if (this.vehicle) sitPerson(av, true); }
    this.avatar = av; av.visible = this.dist > 0.5 && !this._intro && !this._introPending; this.player.add(av); try { if (localStorage.getItem('wvm_crown')) this._crown(av); } catch (e) { }
    if (this.vehicle) { sitPerson(av, true); av.position.y = this.vehicle.seatY || 0.5; }
    if (this._clip) { this._clip.av = null; if (this.ride) sitPerson(av, true); }
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
  }

  /* ----- public API for pages ----- */
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  addObstacle(x, z, r) { this.obstacles.push({ x, z, r }); }
  /* an obstacle that moves (a train car): update ob.x / ob.z every frame. Path-finding ignores it; walking is blocked. */
  addMovingObstacle(r) { const ob = { x: 1e9, z: 1e9, r, moving: true }; this.obstacles.push(ob); return ob; }
  /* Auto-colliders (v8): anything solid, tall and standing on the ground that the page forgot to fence gets a collision box, so nobody walks through a building.
     Left alone: things that move, anything you are meant to enter or walk under (a doorway test fires rays through it at waist height), anything with a button, portal, trigger, place or NPC route inside it. */
  autoCollide() {
    const list = []; const box = new THREE.Box3(); for (const o of this.scene.children) { const u = o.userData; if (o.isLight || o.isCamera || o.isSprite || o.isPoints || o.isLine || o === this.player || o === this.rig || u.noCollide || u.mapHide || u.noCull || u.collided || o.visible === false) continue; list.push([o, o.position.x, o.position.y, o.position.z, o.rotation.y]); }
    const pts = []; for (const it of (this.interactables || [])) if (it.r < 1e6) pts.push([it.x, it.z]); for (const t of (this.triggers || [])) pts.push([t.x, t.z]); for (const p of this.places) if (p.x !== undefined && !p.url) pts.push([p.x, p.z]); for (const n of this.npcs) { const path = n.path || []; for (let i = 0; i < path.length; i++) { const A = path[i], B = path[(i + 1) % path.length]; const d = Math.hypot(B.x - A.x, B.z - A.z), k = Math.max(1, Math.ceil(d / 2)); for (let j = 0; j <= k; j++) pts.push([A.x + (B.x - A.x) * j / k, A.z + (B.z - A.z) * j / k]); } } pts.push([this.opts.spawn.x, this.opts.spawn.z]);
    const rc = new THREE.Raycaster(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3(); let i = 0, added = 0; const t0 = this.t;
    const step = () => { if (this.t - t0 < 2.5) return; let n = 0; while (i < list.length && n++ < 6) { const [o, px, py, pz, ry] = list[i++]; try {
          if (!o.parent || Math.abs(o.position.x - px) + Math.abs(o.position.y - py) + Math.abs(o.position.z - pz) + Math.abs(o.rotation.y - ry) > 1e-4) continue; // it moves
          let solid = 0, meshes = 0; o.traverse(m => { if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh) return; meshes++; const mt = m.material; if (mt && !Array.isArray(mt) && !(mt.transparent && mt.opacity < 0.5) && mt.visible !== false && !/Plane|Circle|Ring|Shape/.test(m.geometry.type)) solid++; }); if (solid < 1) continue;
          box.setFromObject(o); if (box.isEmpty()) continue; const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y; if (box.min.y > 1.0 || h < 2.4 || w < 1.6 || d < 1.6 || w > 46 || d > 46 || Math.min(w, d) < 0.22 * Math.max(w, d) && Math.max(w, d) > 14) continue;
          const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, hw = w * 0.44, hd = d * 0.44; const P = this.player.position;
          if (Math.abs(P.x - cx) < hw + 1.5 && Math.abs(P.z - cz) < hd + 1.5) continue; if (pts.some(q => Math.abs(q[0] - cx) < hw + 1.2 && Math.abs(q[1] - cz) < hd + 1.2)) continue;
          if (this.obstacles.some(ob => !ob.poly && !ob.moving && (ob.level || 0) === 0 && Math.abs(ob.x - cx) < hw + (ob.r || ob.hw || 0) && Math.abs(ob.z - cz) < hd + (ob.r || ob.hd || 0))) continue; // the page already fenced it
          let hits = 0; const y = Math.max(box.min.y, 0) + 1.1; for (const [ox, oz, dx, dz, far] of [[box.min.x - 1, cz, 1, 0, w + 2], [box.max.x + 1, cz, -1, 0, w + 2], [cx, box.min.z - 1, 0, 1, d + 2], [cx, box.max.z + 1, 0, -1, d + 2]]) { rc.set(o3.set(ox, y, oz), d3.set(dx, 0, dz)); rc.far = far; const hs = rc.intersectObject(o, true); if (hs.some(q => q.object.isMesh && !q.object.isSprite && q.distance < far * 0.62)) hits++; }
          if (hits < 3) continue; // open on at least two sides at waist height: an arch, a gate, a sign on posts, a canopy
          this.obstacles.push({ x: cx, z: cz, hw, hd, auto: true }); o.userData.collided = true; added++; } catch (err) { } }
      if (i >= list.length) { this.updaters = this.updaters.filter(q => q !== step); this._autoCol = added; } };
    this.onUpdate(step);
  }
  /* open water with no shoreline obstacle (the beach surf): { x, z, r, y, except: [[x1, z1, x2, z2], ...] } */
  addWater(w) { (this.waters = this.waters || []).push(w); return w; }
  _waterAt(x, z) { const lv = this.level || 0; for (const w of (this.waters || [])) { if ((w.level || 0) !== lv || !w.poly) continue; if (WVM.inPoly(w.poly, x, z) && !(w.dry || []).some(d => WVM.inPoly(d, x, z))) return w.y; } if (lv) return null; for (const ob of this.obstacles) { if (ob.water === undefined || ob.keepIn || !ob.poly) continue; if (WVM.inPoly(ob.poly, x, z)) return ob.water; } for (const w of (this.waters || [])) { if (w.poly || w.level) continue; const dx = x - w.x, dz = z - w.z; if (dx * dx + dz * dz < w.r * w.r && !(w.except || []).some(b => x > b[0] && x < b[2] && z > b[1] && z < b[3])) return w.y; } return null; }
  _swim(dt) {
    const av = this.avatar, p = this.player.position; const wy = (this.ride || this.vehicle || this._clip) ? null : this._waterAt(p.x, p.z); const S = this._sw || (this._sw = { on: false, k: 0 });
    if (wy === null) { if (S.on) { S.on = false; this._clipMats(av, null); av.position.y = 0; av.rotation.x = 0; if (S.ring) S.ring.visible = false; } return; }
    const odd = av.userData.hover; if (!S.on || S.av !== av) { S.on = true; S.av = av; S.plane = S.plane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); av.rotation.order = 'YXZ'; if (!odd) this._clipMats(av, S.plane); if (!S.ring) { S.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); S.ring.rotation.x = -Math.PI / 2; S.ring.userData.noShadow = true; S.ring.userData.noCull = true; this.scene.add(S.ring); } if (!S.told) { S.told = true; this.toast('🏊 You are swimming! Water slows you down a little. Swim anywhere you like.', 3800); } }
    S.plane.constant = -(wy + 0.02); const H = av.userData.headY || 2; const tilt = this.moving ? 0.95 : 0.2; S.k += (tilt - S.k) * Math.min(1, dt * 4); if (odd) { av.position.y = wy + 0.4; return; }
    av.rotation.x = S.k; av.position.y = wy + 0.34 - H * Math.cos(S.k) + Math.sin(this.t * 2.2) * 0.05 - p.y;
    const r = S.ring; r.visible = this.dist > 0.6; r.position.set(p.x, wy + 0.04, p.z); const q = (this.t * (this.moving ? 1.6 : 0.8)) % 1; r.scale.setScalar(0.8 + q * 1.6); r.material.opacity = 0.55 * (1 - q);
  }
  addBox(x, z, hw, hd) { this.obstacles.push({ x, z, hw, hd }); }
  /* polygon obstacle: pts = [[x,z],...]; blocks INSIDE the polygon (a lake), or outside it when opts.keepIn (a boat) */
  addPoly(pts, opts = {}) { const ob = { poly: pts, keepIn: !!opts.keepIn, level: opts.level }; this.obstacles.push(ob); return ob; }
  static inPoly(pts, x, z) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; } return inside; }
  /* the world is round; opts.beyond lists the few places you may step past the rim: circles {x,z,r} or corridors {ax,az,bx,bz,w} */
  _inWorld(x, z) { const BR = this.opts.boundR; if (!BR || x * x + z * z <= BR * BR) return true; for (const b of (this.opts.beyond || [])) { if (b.r !== undefined) { if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true; } else { const dx = b.bx - b.ax, dz = b.bz - b.az; const k = clamp(((x - b.ax) * dx + (z - b.az) * dz) / (dx * dx + dz * dz), 0, 1); if ((x - b.ax - dx * k) ** 2 + (z - b.az - dz * k) ** 2 < b.w * b.w) return true; } } return false; }
  _blocked(nx, nz) { const lv = this.level || 0; if (!lv && !this._inWorld(nx, nz)) { const P = this.player.position; if (this._inWorld(P.x, P.z) || nx * nx + nz * nz > P.x * P.x + P.z * P.z) return true; } for (const ob of this.obstacles) { if ((ob.level === undefined ? 0 : ob.level) !== lv) continue; if (ob.moving) { if (ob.off || this._ignoreMoving) continue; const dx = nx - ob.x, dz = nz - ob.z, d2 = dx * dx + dz * dz; if (d2 < ob.r * ob.r) { const P = this.player.position, ex = P.x - ob.x, ez = P.z - ob.z; if (d2 <= ex * ex + ez * ez) return true; } continue; } if (ob.poly) { if (ob.off) continue; if (ob.water !== undefined && !ob.keepIn && !this._ignoreMoving && !this.vehicle) continue; const inn = WVM.inPoly(ob.poly, nx, nz); if (ob.keepIn ? !inn : inn) return true; continue; } if (ob.hw !== undefined) { if (Math.abs(nx - ob.x) < ob.hw && Math.abs(nz - ob.z) < ob.hd) return true; } else { const dx = nx - ob.x, dz = nz - ob.z; if (dx * dx + dz * dz < ob.r * ob.r) return true; } } return false; }
  addHotspot(obj, data) { obj.traverse(c => { c.userData.hotspot = data; }); this.hotspots.push(obj); return obj; }
  addZone(name, center, radius, build) { this.zones.push({ name, center, radius, build, built: false }); }
  addTrigger(x, z, r, fn) { (this.triggers = this.triggers || []).push({ x, z, r, fn, fired: false }); }
  /* Runs fn once after the visitor has walked `meters` on their own (for a delayed welcome popup). */
  onFirstSteps(meters, fn) { this._stepHooks.push({ meters, fn, done: false }); }
  /* Something you can DO when standing near it: shows a big green button with the label. */
  addInteractable(x, z, r, label, fn) { (this.interactables = this.interactables || []).push({ x, z, r, label, fn }); }
  _updateInteractables() {
    if (!this.interactables) return; const p = this.player.position; let best = null, bd = 1e9;
    for (const it of this.interactables) { if (it.level !== undefined ? it.level !== (this.level || 0) : ((this.level || 0) >= 3 && it.r < 1e6)) continue; const dx = p.x - it.x, dz = p.z - it.z, d = dx * dx + dz * dz; if (d < it.r * it.r && d < bd) { bd = d; best = it; } }
    if (this.paused) best = null; else if (this.ride) best = this.interactables.find(i => i.r >= 1e8) || null; // during a ride only the ride's own stop button shows
    if (best !== this._act) { this._act = best; this.actBtn.textContent = best ? best.label : ''; this.actBtn.classList.toggle('on', !!best); }
  }
  addNPC(person, path, opts = {}) {
    const n = { p: person, path, i: 0, speed: opts.speed || rand(1.2, 2.2), wait: 0, loop: opts.loop !== false, pause: opts.pause || 0, y: opts.y };
    person.position.copy(path[0]); this.scene.add(person); this.npcs.push(n); return n;
  }
  /* A glowing portal ring. Walk in → fade → appear at `to` (a Vector3) facing `yaw`, or jump to another page if `to` is a URL. */
  addPortal(x, z, to, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); const col = opts.color || 0x38f0ff;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 12, 40), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8, metalness: 0.4 })); ring.position.y = 1.9; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); disc.position.y = 1.9; g.add(disc);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x1e2a4a, metalness: 0.6, roughness: 0.3 })); base.position.y = 0.06; g.add(base);
    if (opts.label) { const s = makeSprite(opts.label, { scale: 5, accent: '#' + col.toString(16).padStart(6, '0') }); s.position.y = 4.2; g.add(s); }
    g.rotation.y = opts.rot || 0; this.scene.add(g);
    this.onUpdate((dt, t) => { ring.rotation.y += dt * 0.8; disc.material.opacity = 0.25 + Math.sin(t * 3) * 0.12; disc.rotation.z += dt; });
    const go = (a) => { if (typeof to === 'string') { a.go(to, opts.label ? 'Off to ' + opts.label + '…' : 'Teleporting…'); return; } a.fade.classList.add('on'); a.fade.textContent = opts.label ? '✨ ' + opts.label : '✨'; setTimeout(() => { a.player.position.copy(to); if (opts.yaw !== undefined) a.yaw = opts.yaw; a.walkTarget = null; setTimeout(() => a.fade.classList.remove('on'), 250); }, 380); };
    this.addTrigger(x, z, 1.5, go); this.addHotspot(g, { fn: (a) => a.walkTo(x, z) });
    return g;
  }
  walkTo(x, z) { const p = this.player.position; this._marker(new THREE.Vector3(x, this.opts.groundY(x, z), z)); if (this.ride || this.vehicle) return; const d = Math.hypot(x - p.x, z - p.z);
    if (d >= 420) { this.travel({ id: '_far', name: 'that spot', icon: '📍', x, z, keys: '', say: 'Here we are. 📍' }); return; }
    if (!this._sight(p.x, p.z, x, z)) { const path = this.findPath(p.x, p.z, x, z, 12000); if (path) { this._route = { pl: { x, z, name: 'there', silent: true }, path, i: 0, chk: this.t, cx: p.x, cz: p.z, tries: 0 }; this.walkTarget = null; return; } if (d > 25) { this.travel({ id: '_far', name: 'that spot', icon: '📍', x, z, keys: '', say: 'Here we are. 📍' }); return; } }
    this._route = null; this.walkTarget = new THREE.Vector3(x, this.opts.groundY(x, z), z); this._wchk = { t: this.t, x: p.x, z: p.z }; }
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
  /* Drive a cart: the avatar sits in it, moves 2.6x faster, and a TURBO button shoots flames.
     opts.seatY = seat height, opts.roofY = canopy height (the sit pose scales so the head clears it). */
  driveCart(cart, opts = {}) {
    if (this.vehicle) return;
    const seatY = opts.seatY ?? 0.5, roofY = opts.roofY ?? 2.1;
    const v = this.vehicle = { m: cart, speed: opts.speed || 2.6, seatY, roofY, park: opts.park, turbo: 0 };
    const av = this.avatar; sitPerson(av, true); av.position.y = seatY;
    this.seatClip(cart, opts.clipY ?? (seatY + 0.3), { roofY });
    this.toast(opts.label || '🚗 Vroom. Hit TURBO for flames. Tap the button to hop out.', 3200);
    const it = { x: 0, z: 0, r: 1e9, label: '🚪 Hop out of the cart', fn: (a) => { const v = a.vehicle; a.vehicle = null; sitPerson(a.avatar, false); a.seatClear(); a.interactables = a.interactables.filter(i => i !== it); v.m.position.copy(a.player.position); v.m.position.x += 2; v.m.rotation.y = a.avatar.rotation.y; if (v.flames) { v.m.remove(v.flames); } a.turboBtn.classList.remove('on'); if (v.park) v.park(v); } }; (this.interactables = this.interactables || []).push(it);
    // flames: a cone of sprites out the back, shown while turbo is held
    const flames = v.flames = new THREE.Group(); flames.visible = false; flames.position.set(0, 0.45, -1.3); cart.add(flames);
    const fm = (c) => new THREE.SpriteMaterial({ map: this._flameTex(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(fm(i % 3 === 0 ? 0xffd23f : i % 3 === 1 ? 0xff8a3d : 0xff4f2b)); s.userData.i = i; flames.add(s); }
    this.onUpdate((dt, t) => { if (!this.vehicle || this.vehicle !== v) return; const on = v.turbo > 0; flames.visible = on; if (on) { for (const s of flames.children) { const k = (t * 6 + s.userData.i * 0.37) % 1; s.position.set(Math.sin(s.userData.i * 2.1 + t * 9) * 0.25 * k, k * 0.3, -k * 2.4); const sc = 0.5 + k * 1.2; s.scale.set(sc, sc, 1); s.material.opacity = 1 - k; } } });
    this.turboBtn.classList.add('on');
  }
  /* Seated riders (v7): everything below the seat line of a vehicle is clipped away and the hips are dropped onto the seat,
     so a tall character sits IN the cart / coaster car / basket / cabin instead of standing through it. Heads always clear the roof.
     obj = the vehicle, y = seat line in the vehicle's own space. o.roofY (vehicle space), o.tilt (lean and roll with the vehicle). */
  seatClip(obj, y = 0.6, o = {}) { this._clip = { obj, y, roofY: o.roofY, tilt: !!o.tilt, stand: !!o.stand, level: !!o.level, z: o.z || 0, x: o.x || 0, av: null, plane: this._clipPlane || (this._clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)), pt: new THREE.Vector3(), n: new THREE.Vector3() }; this.renderer.localClippingEnabled = true; this._seatUpdate(); }
  seatClear() { const c = this._clip; this._clip = null; if (!c) return; const av = this.avatar; this._clipMats(av, null); av.position.set(0, 0, 0); if (c.tilt) av.rotation.set(0, av.rotation.y || 0, 0); }
  _clipMats(av, plane) { av.traverse(o => { const m = o.material; if (!m) return; if (!o.userData._cm) { o.material = Array.isArray(m) ? m.map(q => q.clone()) : m.clone(); o.userData._cm = true; } for (const q of [].concat(o.material)) { q.clippingPlanes = plane ? [plane] : null; q.needsUpdate = true; } }); }
  _seatUpdate() {
    const c = this._clip; if (!c) return; const av = this.avatar, u = av.userData; if (!c.obj.parent && c.obj !== this.scene) { this.seatClear(); return; }
    const odd = u.hover || u.rolls; // drones and the shopping-cart character ride as they are
    if (c.av !== av) { c.av = av; this._clipMats(av, odd ? null : c.plane); }
    c.obj.updateWorldMatrix(true, false); c.pt.set(c.x, c.y, c.z).applyMatrix4(c.obj.matrixWorld); c.n.set(0, 1, 0); if (!c.level) c.n.transformDirection(c.obj.matrixWorld); c.plane.setFromNormalAndCoplanarPoint(c.n, c.pt);
    const H = u.headY || 2; let drop = c.stand ? 0.12 : H * 0.5; if (c.roofY !== undefined) drop = Math.max(drop, H - (c.roofY - c.y) * (c.obj.scale.y || 1) + 0.12); if (odd) drop = 0;
    const P = this.player.position; if (c.tilt) { av.position.set(c.pt.x - c.n.x * drop - P.x, c.pt.y - c.n.y * drop - P.y, c.pt.z - c.n.z * drop - P.z); av.quaternion.copy(c.obj.quaternion); } else av.position.set(0, c.pt.y - drop - P.y, 0);
  }
  /* A pet that belongs to the visitor: hatched once (outside, from the egg), named by them, remembered in this browser, and it follows them everywhere, mall included. */
  petState() { return this._load('wvm_pet', null); }
  spawnPet() {
    if (this._pet) return this._pet; const st = this.petState() || {}; const g = new THREE.Group(); g.userData.noCull = true; g.userData.noCollide = true; const hue = st.hue ?? 0.47; const col = new THREE.Color().setHSL(hue, 0.7, 0.55), col2 = new THREE.Color().setHSL((hue + 0.08) % 1, 0.75, 0.75);
    const M1 = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, emissive: col, emissiveIntensity: 0.18 }), M2 = new THREE.MeshStandardMaterial({ color: col2, roughness: 0.6 }), M3 = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4, metalness: 0.4 });
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, p = g) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.scale.set(sx, sy, sz); q.userData.noOcclude = true; q.castShadow = true; p.add(q); return q; };
    const S8 = new THREE.SphereGeometry(1, 16, 12); add(S8, M1, 0, 0, 0, 0.34, 0.3, 0.42); add(S8, M2, 0, -0.08, 0.06, 0.26, 0.22, 0.32);
    const head = new THREE.Group(); head.position.set(0, 0.26, 0.36); g.add(head); add(S8, M1, 0, 0, 0, 0.27, 0.25, 0.27, head); add(S8, M1, 0, -0.07, 0.22, 0.16, 0.12, 0.17, head); for (const sx of [-1, 1]) { add(S8, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), sx * 0.13, 0.07, 0.19, 0.1, 0.11, 0.07, head); add(S8, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }), sx * 0.13, 0.07, 0.25, 0.05, 0.06, 0.03, head); add(S8, new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * 0.15, 0.1, 0.275, 0.018, 0.018, 0.01, head); const horn = add(new THREE.ConeGeometry(0.05, 0.2, 8), M3, sx * 0.12, 0.27, -0.04, 1, 1, 1, head); horn.rotation.z = -sx * 0.35; add(S8, new THREE.MeshStandardMaterial({ color: 0x111111 }), sx * 0.05, -0.06, 0.385, 0.013, 0.013, 0.01, head); add(S8, new THREE.MeshStandardMaterial({ color: 0xff8fb0, roughness: 0.8, transparent: true, opacity: 0.7 }), sx * 0.2, -0.04, 0.16, 0.05, 0.035, 0.02, head); }
    const wings = []; for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.22, 0.2, -0.05); g.add(w); const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.62, 0.3); sh.quadraticCurveTo(0.5, 0.05, 0.56, -0.08); sh.quadraticCurveTo(0.4, -0.02, 0.34, -0.2); sh.quadraticCurveTo(0.2, -0.06, 0.1, -0.22); sh.closePath(); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: col2, side: THREE.DoubleSide, roughness: 0.6, emissive: col2, emissiveIntensity: 0.2, transparent: true, opacity: 0.92 })); m.scale.x = sx; m.rotation.x = -0.5; m.userData.noOcclude = true; w.add(m); wings.push([w, sx]); }
    const tail = []; let par = g; for (let i = 0; i < 6; i++) { const seg = new THREE.Group(); seg.position.set(0, i ? 0 : -0.02, i ? -0.14 : -0.36); par.add(seg); add(S8, M1, 0, 0, 0, 0.12 - i * 0.015, 0.11 - i * 0.014, 0.12, seg); par = seg; tail.push(seg); } const spade = add(new THREE.ConeGeometry(0.09, 0.2, 4), M3, 0, 0, -0.16, 1, 1, 0.4, par); spade.rotation.x = -Math.PI / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(S8, M1, sx * 0.17, -0.27, sz * 0.18, 0.07, 0.09, 0.09); for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.04, 0.1, 4), M3, 0, 0.3 - i * 0.02, 0.1 - i * 0.14);
    g.scale.setScalar(1.25); this.scene.add(g); const hearts = []; for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeTextTexture('💖', { w: 128, h: 128, bg: 'rgba(0,0,0,0)', border: null, glow: false, font: '96px serif' }), transparent: true, depthWrite: false })); sp.scale.set(0.4, 0.4, 1); sp.visible = false; sp.userData.far = 1e9; this.scene.add(sp); hearts.push(sp); }
    const P = this.player.position; g.position.set(P.x + 1.4, P.y + 1.6, P.z - 1.2); const pet = this._pet = { g, trick: 0, vy: 0, t: 0 }; const name = () => (this.petState() || {}).name || 'your dragon';
    const LINES = ['does a happy loop. Show-off.', 'sneezes a tiny cloud of sparkles. Bless you.', 'nuzzles your shoulder. You have been chosen.', 'tries to roar. It comes out as a squeak. Do NOT laugh.', 'found a coin behind your ear. Keeps it.', 'is pretending not to be tired. Tiny yawn.', 'wants to ride the coaster. Again.', 'chased its own tail for a full minute. Won.', 'looked at the Earth over the mall for a long time. Deep thoughts. Probably snacks.', 'blew a smoke ring shaped like a peace sign. Accident? We will never know.'];
    const pat = (ap) => { pet.trick = 1.4; ap.buzz(25); hearts.forEach((h, i) => { h.visible = true; h.userData.t = -i * 0.12; }); ap.toast('🐉 ' + name() + ' ' + pick(LINES), 3600); };
    this.addHotspot(g, { fn: (ap) => ap.popup('🐉 ' + name(), '<p>Your dragon. Hatched here, follows you everywhere, never needs walking.</p>', [{ label: '💖 Pet ' + name(), primary: true, fn: () => pat(ap) }, { label: '✏️ Rename', fn: () => setTimeout(() => ap.namePet(), 120) }, { label: '🎨 New color', fn: () => { const s2 = ap.petState() || {}; s2.hue = ((s2.hue ?? 0.47) + 0.17) % 1; ap._save('wvm_pet', s2); ap.scene.remove(g); hearts.forEach(h => ap.scene.remove(h)); ap.updaters = ap.updaters.filter(u => u !== upd); ap.hotspots = ap.hotspots.filter(h => { let o = h, inside = false; while (o) { if (o === g) inside = true; o = o.parent; } return !inside; }); ap._pet = null; ap.spawnPet(); } }]) });
    const tgt = new THREE.Vector3(); const upd = (dt, t) => { const hide = !!this.ride || !!this._intro || !!this._introPending; g.visible = !hide; if (hide) return; const Pp = this.player.position; const yaw = this.avatar.rotation.y; tgt.set(Pp.x - Math.sin(yaw) * 1.3 + Math.cos(yaw) * 1.25, Pp.y + 1.75 + Math.sin(t * 2.1) * 0.12 + (this._sw && this._sw.on ? 0.4 : 0), Pp.z - Math.cos(yaw) * 1.3 - Math.sin(yaw) * 1.25); const d = g.position.distanceTo(tgt); if (d > 40) g.position.copy(tgt); else g.position.lerp(tgt, Math.min(1, dt * (1.6 + d * 0.5)));
      const dx = tgt.x - g.position.x, dz = tgt.z - g.position.z; const face = d > 0.5 ? Math.atan2(dx, dz) : yaw; g.rotation.y = lerpAngle(g.rotation.y, face, Math.min(1, dt * 5)); if (pet.trick > 0) { pet.trick -= dt; g.rotation.y += dt * 14; g.position.y += Math.sin(pet.trick * 4.5) * dt * 2; }
      const flap = Math.sin(t * (d > 1 ? 16 : 9)) * 0.7; for (const [w, sx] of wings) w.rotation.z = sx * (0.35 + flap); tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 2.4 - i * 0.6) * 0.22; s.rotation.x = Math.sin(t * 1.7 - i * 0.5) * 0.1; }); head.rotation.z = Math.sin(t * 0.9) * 0.12; head.rotation.x = Math.sin(t * 1.3) * 0.08;
      for (const h of hearts) { if (!h.visible) continue; h.userData.t += dt; const k = h.userData.t; if (k < 0) { h.material.opacity = 0; continue; } if (k > 1.5) { h.visible = false; continue; } h.material.opacity = 1 - k / 1.5; h.position.set(g.position.x + Math.sin(k * 5 + h.id) * 0.4, g.position.y + 0.5 + k * 1.2, g.position.z + Math.cos(k * 4 + h.id) * 0.4); } };
    this.onUpdate(upd); return pet;
  }
  namePet(first) { const id = 'pn' + Math.floor(Math.random() * 1e6); this.popup(first ? '🐣 It hatched! Name your dragon' : '✏️ Rename your dragon', '<p>' + (first ? 'A baby dragon. It looked at you first, so that is that: it is yours. It will follow you everywhere, even into the mall.' : 'A new name. It will pretend it always had it.') + '</p><input id="' + id + '" maxlength="16" placeholder="Sparkle, Tesla, Waffles…" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(124,248,255,.5);background:#050b1c;color:#fff;font-size:18px;box-sizing:border-box">', [{ label: '💖 That is the one', primary: true, fn: () => { const v = (document.getElementById(id) || {}).value || ''; const nm = v.replace(/[<>&"']/g, '').trim().slice(0, 16) || 'Sparkle'; const st = this.petState() || {}; st.name = nm; st.hatched = true; this._save('wvm_pet', st); this.closePopup(); this.celebrate('🐉'); this.toast('🐉 ' + nm + ' does a loop. ' + nm + ' approves of ' + nm + '.', 4200); }, keep: true }]); }
  /* ----- the Secret Hunt (v7): fourteen hidden things across the whole world. Found ones are kept in this browser. ----- */
  static get SECRETS() { return [
    ['duck', '🦆', 'The Golden Duck', 'Not every duck on the ponds is a duck-colored duck.'], ['cord', '🚂', 'The Whistle Cord', 'Something dangles at the train platform. Cords are for pulling.'], ['bottle', '🍾', 'Message in a Bottle', 'Walk the beach pier all the way to the very end.'], ['balloon', '🎈', 'The Lonely Red Balloon', 'It got away from the park and drifted up to where people watch the stars.'], ['modes', '🎢', 'Triple Chiller', 'Ride The Chiller three different ways.'],
    ['tile', '🎵', 'The Musical Tile', 'One tile in the Atrium is not like the others. Step on it.'], ['button', '🔴', 'The Big Red Button', 'Chinatown. It says do not press. You know what to do.'], ['lever', '🌈', 'The Lever by the Falls', 'In the waterfall lounge, something mossy wants pulling.'], ['simon', '🕹️', 'The Unmarked Cabinet', 'Upstairs, in the Game Room, one machine has no sign. Beat level 3.'], ['door', '🐭', 'The Tiny Door', 'Upstairs, down low, near the games. Knock.'],
    ['wink', '👁️', 'The Watchtower', 'Out on the skyline, one tower is looking right at you. Tap it.'], ['scholar', '🏙️', 'Skyline Scholar', 'Some towers on the horizon are copies of famous real ones. Tap five of them.'], ['loft', '🚪', 'The Sky Loft', 'The city wall around the island is not all wall. Somewhere out east, past the park, one tower has a front door. Find the design board inside and furnish a room.'], ['orbit', '🚀', 'The Orbit Deck', 'The penthouse has two elevators. One of them does not stop at the roof.'], ['toad', '🐸', 'Toad of Legend', 'Somewhere upstairs a one-eyed toad needs to cross ten very bad roads. Get him all the way to the mall.'], ['pigeon', '🕊️', 'The White Pigeon', 'In the room of the man who lit the world, someone he loved is still keeping watch. Look up.']]; }
  secretsFound() { return this._load('wvm_secrets', []) || []; }
  secret(id, title, html) {
    const S = WVM.SECRETS, found = this.secretsFound(), meta = S.find(s => s[0] === id) || [id, '🔎', title || id]; const isNew = !found.includes(id); if (isNew) { found.push(id); this._save('wvm_secrets', found); this.coins = (this.coins || 0) + 10; this._save('wvm_coins', this.coins); if (this.coinBadge) this.coinBadge.textContent = this.coins; }
    const n = found.filter(f => S.some(s => s[0] === f)).length; this.celebrate(meta[1]); this.buzz(80);
    const all = n >= S.length; if (all && !localStorage.getItem('wvm_crown')) { try { localStorage.setItem('wvm_crown', '1'); } catch (e) { } this._crown(this.avatar); }
    this.popup(meta[1] + ' Secret found: ' + (title || meta[2]), (html || '') + '<p><b>' + n + ' of ' + S.length + '</b> secrets found' + (isNew ? ' · +10 coins 🪙' : ' (you already had this one)') + '.</p>' + (all ? '<p style="font-size:18px">👑 <b>Every single one.</b> You are a Master Explorer. Your character now wears the gold Explorer\'s Crown everywhere in World VR Mall.</p>' : ''), [{ label: '🔎 Secret Hunt list', fn: () => setTimeout(() => this.showSecrets(), 80) }]);
  }
  showSecrets() { const found = this.secretsFound(); const rows = WVM.SECRETS.map(s => { const ok = found.includes(s[0]); return '<div style="display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.12)"><span style="font-size:24px;filter:' + (ok ? 'none' : 'grayscale(1) opacity(.45)') + '">' + s[1] + '</span><div><b>' + (ok ? esc(s[2]) + ' ✅' : '???') + '</b><br><small class="muted">' + esc(s[3]) + '</small></div></div>'; }).join(''); const n = found.filter(f => WVM.SECRETS.some(s => s[0] === f)).length; this.popup('🔎 The Secret Hunt · ' + n + ' / ' + WVM.SECRETS.length, '<p>' + WVM.SECRETS.length + ' things are hidden around World VR Mall: outside, inside, and out on the skyline. Each is worth 10 coins. Find them all for the 👑 Explorer\'s Crown.</p>' + rows, []); }
  celebrate(emoji = '🎉') { if (!document.getElementById('wvm-cele-css')) { const st = document.createElement('style'); st.id = 'wvm-cele-css'; st.textContent = '@keyframes wvmCele{0%{transform:translate(-50%,-50%) scale(.2) rotate(0);opacity:0}15%{opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1.25) rotate(var(--r));opacity:0}}.wvm-cele{position:fixed;left:50%;top:46%;font-size:34px;pointer-events:none;z-index:99999;animation:wvmCele 1.7s cubic-bezier(.2,.7,.3,1) forwards}@media (prefers-reduced-motion:reduce){.wvm-cele{display:none}}'; document.head.appendChild(st); } const set = [emoji, '✨', '🎉', '⭐', emoji, '🪙']; for (let i = 0; i < 22; i++) { const d = document.createElement('div'); d.className = 'wvm-cele'; d.textContent = set[i % set.length]; const an = i / 22 * Math.PI * 2, r = 120 + Math.random() * 200; d.style.setProperty('--dx', Math.cos(an) * r + 'px'); d.style.setProperty('--dy', Math.sin(an) * r + 'px'); d.style.setProperty('--r', (Math.random() * 540 - 270) + 'deg'); d.style.animationDelay = (Math.random() * 0.15) + 's'; document.body.appendChild(d); setTimeout(() => d.remove(), 2100); } }
  _crown(av) { if (!av || av.userData.crown || av.userData.hover) return; const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 1, roughness: 0.15, emissive: 0x6a4a00, emissiveIntensity: 0.6 }); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.1, 16, 1, true), m); m.side = THREE.DoubleSide; g.add(band); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), m); sp.position.set(Math.cos(a) * 0.19, 0.12, Math.sin(a) * 0.19); g.add(sp); } const s = (av.userData.headY || 2) / 2; g.scale.setScalar(Math.max(0.8, s) / (av.scale.y || 1)); g.position.y = ((av.userData.headY || 2) + 0.02) / (av.scale.y || 1); av.add(g); av.userData.crown = g; }
  _flameTex() { if (this._ft) return this._ft; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,220,120,0.9)'); gr.addColorStop(1, 'rgba(255,80,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this._ft = new THREE.CanvasTexture(c); return this._ft; }
  /* Ride anything. pathFn(t01) → Vector3 for progress 0..1; the avatar (and optional vehicle mesh) follows.
     opts: duration (s), loop, vehicle (mesh that moves too), seat (Vector3 offset inside the vehicle), yaw ('path' faces travel direction),
     lookUp (tilts the camera up a bit — balloons), onEnd. Returns a stop() function. */
  startRide(pathFn, opts = {}) {
    if (this.ride) return () => {};
    const dur = opts.duration || 40, t0 = this.t; const veh = opts.vehicle; const seat = opts.seat || new THREE.Vector3(0, 0, 0);
    const av = this.avatar; if (opts.sit !== false) sitPerson(av, true); if (opts.clip) this.seatClip(opts.clip.obj, opts.clip.y, opts.clip);
    const pitch0 = this.pitch; if (opts.lookUp) this.pitch = -0.6;
    const self = this; let last = pathFn(0);
    this.ride = { pos: (t) => { let k = (t - t0) / dur; if (opts.loop) k %= 1; else k = Math.min(1, k); const p = pathFn(k); if (veh) { veh.position.copy(p); if (opts.yaw === 'path') { veh.rotation.y = Math.atan2(p.x - last.x, p.z - last.z); } } last = p.clone(); const out = p.clone().add(seat); if (veh && opts.yaw === 'path') out.copy(p).add(seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), veh.rotation.y)); return out; }, yaw: undefined, until: opts.loop ? undefined : t0 + dur, done: () => stop(true) };
    const it = { x: 0, z: 0, r: 1e9, label: opts.exitLabel || '🛑 End the ride', fn: () => stop(false) }; (this.interactables = this.interactables || []).push(it);
    let finished = false; function stop(natural) { if (finished) return; finished = true; self.ride = null; self._act = null; sitPerson(self.avatar, false); self.seatClear(); self.pitch = pitch0; self.interactables = self.interactables.filter(i => i !== it); if (opts.exit) self.player.position.copy(opts.exit); if (opts.onEnd) opts.onEnd(natural); self.toast(natural ? (opts.endToast || 'What a ride! 🎉') : 'Hopped off.'); }
    if (opts.toast !== false) this.toast(opts.toast || '🎢 Hang on!', 2500);
    return () => stop(false);
  }
  /* Fade + navigate to another page (portal). */
  go(url, label = 'Teleporting…') {
    try { sessionStorage.setItem('wvm_from', this.opts.page); } catch (e) { }
    this.fade.classList.add('on'); this.fade.textContent = label;
    setTimeout(() => { location.href = url; }, 160);
  }
  /* A wall screen that plays a YouTube video: a glowing frame in 3D plus a Watch button that opens the player. */
  addScreen(x, y, z, rot, videoId, opts = {}) {
    const { w = 8, h = 4.5, title = 'Now playing', autoplay = false } = opts;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), M(0x111827, { metalness: 0.6, roughness: 0.3 })); g.add(frame);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: makeTextTexture([opts.line1 || '▶ ' + title, opts.line2 || 'Walk up & tap to watch'], { w: 1024, h: 576, bg: '#050b1c', fg: '#fff', accent: opts.accent || '#38f0ff', font: 'bold 84px Poppins, Segoe UI, Arial', radius: 10 }) })); scr.position.z = 0.11; g.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, h + 0.6), new THREE.MeshBasicMaterial({ color: opts.accent || 0x38f0ff, transparent: true, opacity: 0.25 })); glow.position.z = -0.12; g.add(glow);
    this.scene.add(g);
    const open = () => this.video(videoId, title, autoplay);
    this.addHotspot(g, { fn: open }); this.addInteractable(x, z, opts.radius || 5, '🎬 Watch: ' + title, open);
    return g;
  }
  channels(title, intro, list) { this.popup(title, '<p>' + intro + '</p>', list.map(([label, id], i) => ({ label, primary: i === 0, fn: () => setTimeout(() => this.video(id, label, true), 120) }))); }
  video(videoId, title = 'Now playing', autoplay = false) {
    this.popup(title, `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}" title="${esc(title)}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p class="muted">Video plays right here. Close to keep exploring.</p>`, []);
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
      if (face) { const im = new Image(); im.onload = () => { const fw = Math.round(band * 1.1), fh = Math.round(fw * 1.25); g.drawImage(im, W - fw - 30, H - fh - 20, fw, fh); finish(); }; im.onerror = finish; im.src = face; } else finish();
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
    for (const a of actions) { const b = document.createElement('button'); b.className = 'wvm-btn' + (a.primary ? ' primary' : ''); b.textContent = a.label; b.onclick = () => { if (!a.keep) this.closePopup(); if (a.href) { if (/^(tel|sms|mailto):/i.test(a.href)) location.href = a.href; else if (a.newTab || /^https?:/i.test(a.href) && !a.href.includes(location.host)) window.open(a.href, '_blank', 'noopener'); else this.go(a.href, a.label); } else if (a.fn) a.fn(); }; ab.appendChild(b); }
    const close = document.createElement('button'); close.className = 'wvm-btn ghost'; close.textContent = 'Close'; close.onclick = () => this.closePopup(); ab.appendChild(close);
    this.pop.classList.add('on'); this.paused = true; document.body.classList.add('wvm-modal-open');
  }
  closePopup() { this.pop.classList.remove('on'); this.pop.querySelector('.wvm-pop-body').innerHTML = ''; this.paused = false; document.body.classList.remove('wvm-modal-open'); }
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
    const msgs = ['Locking on to your signature…', 'Charging the teleport coils…', 'Beaming you to World VR Mall…', 'Re-assembling you, atom by atom…', 'Materializing shops from 6 continents…', 'Welcome. Have a great day!'];
    let mi = 0; this.loadMsg.textContent = msgs[0];
    const tick = setInterval(() => { mi = Math.min(msgs.length - 1, mi + 1); this.loadMsg.textContent = msgs[mi]; }, 700);
    this._progress(0.08);
    const done = () => {
      clearInterval(tick); this._progress(1); this.loader.classList.add('beam');
      setTimeout(() => { this.loader.classList.add('off'); this._maybeSelfie(); }, 380);
    };
    Promise.resolve(buildFn(this)).then(() => {
      this.fixBackwards(); this._deepLink();
      if (this.opts.shadows) this.enableShadows(this.scene);
      this._progress(0.9);
      try { const ps = this.petState(); if (ps && ps.hatched) setTimeout(() => this.spawnPet(), 2500); } catch (err) { }
      return this._warm().then(() => setTimeout(done, 80));
    }).catch(err => { console.error(err); clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Build error: <code style="font-size:12px;color:#c00">' + esc(err && err.message ? err.message : String(err)) + '</code><br><small>' + esc((err && err.stack ? err.stack.split('\n')[1] : '') || '') + '</small><br>Screenshot this and send it to Zach.'; });
    addEventListener('error', (ev) => { if (!this.loader.classList.contains('off')) { clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Script error: <code style="font-size:12px;color:#c00">' + esc(ev.message || '') + '</code><br><small>' + esc((ev.filename || '').split('/').pop() + ':' + ev.lineno) + '</small>'; } });
    addEventListener('unhandledrejection', (ev) => { if (!this.loader.classList.contains('off')) { clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Load error: <code style="font-size:12px;color:#c00">' + esc(ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)) + '</code>'; } });
    this.renderer.setAnimationLoop(() => this._frame());
  }

  async _warm() {
    try { this._cullPrep(); } catch (e) { console.warn(e); }
    if (isMobile() || this.opts.warm === false) return;
    try {
      this.loadMsg.textContent = 'Polishing every window…';
      if (this.renderer.compileAsync) await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise(r => setTimeout(r, 2200))]);
      const seen = new Set(); this.scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'emissiveMap', 'alphaMap']) { const tx = m && m[k]; if (tx && tx.isTexture && !tx.isVideoTexture && tx.image && tx.image.complete !== false && (tx.image.width || 0) > 0) seen.add(tx); } });
      let n = 0; const t0 = performance.now(); for (const tx of seen) { if (n > 160 || performance.now() - t0 > 1200) break; try { this.renderer.initTexture(tx); } catch (e) { } if (++n % 16 === 0) { this._progress(0.9 + 0.09 * n / Math.max(1, seen.size)); await new Promise(r => setTimeout(r, 0)); } }
    } catch (e) { console.warn('warm-up skipped', e); }
  }
  /* Turn on shadows for everything already in the scene (pages built for v4 never set the flags).
     Flat planes receive, solid meshes cast + receive, sprites and see-through things are skipped. */
  enableShadows(root) {
    root.traverse(o => {
      if (!o.isMesh || o.isSprite || o.userData.noShadow) return;
      const geo = o.geometry; const mat = o.material;
      const flat = geo && (geo.type === 'PlaneGeometry' || geo.type === 'CircleGeometry' || geo.type === 'RingGeometry');
      const seeThrough = mat && !Array.isArray(mat) && (mat.transparent && mat.opacity < 0.6);
      if (flat) { o.receiveShadow = true; return; }
      if (seeThrough) return;
      o.castShadow = true; o.receiveShadow = true;
    });
  }

  /* ===== v6 · places, search, travel (walk a real path, or transport), speed, boosts, weather ===== */
  addPlace(p) { p.id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); p.keys = ((p.keys || '') + ' ' + p.name + ' ' + (p.cat || '')).toLowerCase(); const i = this.places.findIndex(q => q.id === p.id); if (i >= 0) this.places[i] = p; else this.places.push(p); return p; }
  findPlaces(q, max = 8) {
    const toks = String(q || '').toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !WVM.STOP.has(w)); if (!toks.length) return [];
    const out = []; for (const p of this.places) { const nm = p.name.toLowerCase(); let s = 0, hit = 0; for (const w of toks) { let k = 0; if (nm.startsWith(w)) k = 6; else if (nm.includes(w)) k = 5; else if (p.keys.includes(w)) k = 2; else if (w.length > 4 && p.keys.includes(w.slice(0, -1))) k = 1; if (k) hit++; s += k; } if (hit && hit >= Math.ceil(toks.length / 2)) out.push([s + hit * 3 + (p.top ? 2.5 : 0) - (p.rank || 0) * 0.01, p]); }
    return out.sort((a, b) => b[0] - a[0]).slice(0, max).map(o => o[1]);
  }
  /* Walk or transport? Walking uses a real path around every wall; if there is no path the visitor is transported, so they always arrive. */
  travel(pl, mode) {
    if (typeof pl === 'string') pl = this.places.find(p => p.id === pl); if (!pl) return;
    const local = !pl.url && !pl.fn && pl.x !== undefined; const pos = this.player.position;
    if (!mode) {
      const d = local ? Math.hypot(pl.x - pos.x, pl.z - pos.z) : 0; const canWalk = local && pl.walk !== false && (pl.level || 0) === (this.level || 0) && !this.ride && !this.vehicle && d > 3 && d < 420;
      const secs = Math.round(d / (this.opts.walkSpeed * this.speedMul * 1.3)); const acts = [];
      if (canWalk) acts.push({ label: '🚶 Walk me there (' + (secs < 90 ? secs + ' sec' : Math.round(secs / 60) + ' min') + ')', fn: () => this.travel(pl, 'walk') });
      acts.push({ label: '⚡ Instant · transport me there now', fn: () => this.travel(pl, 'port'), primary: true });
      this.popup((pl.icon || '📍') + ' ' + pl.name, (pl.desc ? '<p>' + esc(pl.desc) + '</p>' : '') + (canWalk ? '<p class="muted">Walking follows a real route around the walls. You can grab the controls any time to stop.</p>' : ''), acts); return;
    }
    this.closeSearch();
    if (mode === 'walk') { const path = this.findPath(pos.x, pos.z, pl.x, pl.z); if (path) { this._route = { pl, path, i: 0, chk: this.t, cx: pos.x, cz: pos.z, tries: 0 }; this.walkTarget = null; this.toast('🚶 On our way to ' + pl.name + '… tap ⚡ any time to skip the walk.', 3200); this._skipBtn(pl); return; } this.toast('No clear walking route from here, so we are transporting you. ✨', 2600); }
    this._route = null; this.walkTarget = null;
    if (pl.fn) { pl.fn(this); return; }
    if (pl.url) { this.go(pl.url, '✨ ' + pl.name); return; }
    this.fade.classList.add('on'); this.fade.textContent = '✨ ' + pl.name;
    setTimeout(() => { if (this.opts.onTravel) this.opts.onTravel(pl, this); const [tx, tz] = this._snap(pl.x, pl.z); this.player.position.set(tx, this.opts.groundY(tx, tz), tz); this._faceView(pl, tx, tz); setTimeout(() => { this.fade.classList.remove('on'); this._arrived(pl); }, 260); }, 380);
  }
  _skipBtn(pl) { this.interactables = (this.interactables || []).filter(i => !i._skip); const it = { x: 0, z: 0, r: 1e7, _skip: true, label: '⚡ Skip the walk · transport me', fn: (a) => { a.interactables = a.interactables.filter(i => i !== it); a.travel(pl, 'port'); } }; this.interactables.push(it); const un = this.onUpdate(() => { if (this._route && this._route.pl === pl) return; this.interactables = this.interactables.filter(i => i !== it); this.updaters = this.updaters.filter(u => u !== un); }); }
  /* where to look on arrival: the place's own yaw or look-at point, else the nearest thing you can DO, else the heart of the area */
  _faceView(pl, x, z) {
    let yaw = pl.yaw; if (yaw === undefined) { let L = pl.look; if (!L && (Math.abs(pl.x - x) > 2.5 || Math.abs(pl.z - z) > 2.5)) L = [pl.x, pl.z];
      if (!L) { let bd = 40 * 40; for (const it of (this.interactables || [])) { if (it.r > 1e6 || (it.level !== undefined && it.level !== (this.level || 0))) continue; const dx = it.x - x, dz = it.z - z, d = dx * dx + dz * dz; if (d > 9 && d < bd) { bd = d; L = [it.x, it.z]; } } }
      if (!L) { const c = this.opts.viewCenter || [0, 0]; L = [c[0], c[1]]; } yaw = Math.atan2(-(L[0] - x), -(L[1] - z)); }
    this.yaw = yaw; this.pitch = pl.pitch !== undefined ? pl.pitch : -0.06; this.avatar.rotation.y = yaw + Math.PI; if (this.viewMode !== 'follow' && this.viewMode !== undefined) this.viewMode = 'follow'; if (this.targetDist > 0.6 && (this.targetDist < 5 || this.targetDist > 14)) { this.targetDist = 7.5; this.dist = 7.5; }
  }
  _arrived(pl) { this._route = null; this.walkTarget = null; if (pl.silent) return; if (pl.look || pl.yaw !== undefined) { const P = this.player.position; this._faceView(pl, P.x, P.z); } else if (this.pitch < -0.5) this.pitch = -0.08; this.say(pl.say || ('We made it: ' + pl.name + '! ' + (pl.icon || '🎉'))); this.buzz(40); if (pl.onArrive) { try { pl.onArrive(this); } catch (e) { console.error(e); } } }
  /* speech bubble over the visitor's head */
  say(text, secs = 4.5) {
    if (this._bubble) { this.player.remove(this._bubble); this._bubble.material.map.dispose(); this._bubble.material.dispose(); this._bubble = null; }
    const s = makeSprite('💬 ' + text, { scale: 5.2, bg: 'rgba(255,255,255,0.96)', fg: '#0b1a3a', accent: '#38f0ff', far: 1e9 }); s.position.set(0, (this.avatar.userData.headY || 2) + 1.0, 0); s.renderOrder = 20; s.material.depthTest = false; this.player.add(s); this._bubble = s; const t0 = this.t;
    const fn = () => { if (this._bubble !== s) { this.updaters = this.updaters.filter(u => u !== fn); return; } const k = this.t - t0; s.material.opacity = k > secs - 0.6 ? Math.max(0, (secs - k) / 0.6) : 1; if (k > secs) { this.player.remove(s); s.material.map.dispose(); s.material.dispose(); this._bubble = null; this.updaters = this.updaters.filter(u => u !== fn); } }; this.onUpdate(fn); this.toast(text, secs * 1000);
  }
  /* A* over the same collision test the visitor walks against, so a found path is a walkable path. */
  _clear(x, z) { const r = 0.9; this._ignoreMoving = true; const v = !(this._blocked(x, z) || this._blocked(x + r, z) || this._blocked(x - r, z) || this._blocked(x, z + r) || this._blocked(x, z - r)); this._ignoreMoving = false; return v; }
  _sight(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 1.2)); for (let i = 1; i <= n; i++) { const k = i / n; if (!this._clear(ax + (bx - ax) * k, az + (bz - az) * k)) return false; } return true; }
  findPath(sx, sz, gx, gz, cap = isMobile() ? 22000 : 45000) {
    const C = 2.5, OFF = 4096, B = this.opts.bounds || 600; const key = (i, j) => (i + OFF) * 8192 + (j + OFF); const cache = new Map();
    const free = (i, j) => { const k = key(i, j); let v = cache.get(k); if (v === undefined) { const x = i * C, z = j * C; v = Math.abs(x) <= B && Math.abs(z) <= B && this._clear(x, z); cache.set(k, v); } return v; };
    const near = (x, z) => { const i0 = Math.round(x / C), j0 = Math.round(z / C); if (free(i0, j0)) return [i0, j0]; for (let r = 1; r <= 8; r++) { let best = null, bd = 1e9; for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) { if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !free(i, j)) continue; const d = Math.hypot(i * C - x, j * C - z); if (d < bd) { bd = d; best = [i, j]; } } if (best) return best; } return null; };
    const s = near(sx, sz), g = near(gx, gz); if (!s || !g) return null;
    const heap = [], G = new Map(), from = new Map(), closed = new Set(); const h = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const push = (n) => { heap.push(n); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const popMin = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const sk = key(s[0], s[1]), gk = key(g[0], g[1]); G.set(sk, 0); push([h(s[0], s[1]), s[0], s[1]]); let n = 0, found = false;
    while (heap.length && n++ < cap) { const [, i, j] = popMin(); const k = key(i, j); if (closed.has(k)) continue; closed.add(k); if (k === gk) { found = true; break; } const g0 = G.get(k);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue; if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue; const nk = key(ni, nj); if (closed.has(nk)) continue; const ng = g0 + (di && dj ? Math.SQRT2 : 1); if (ng < (G.get(nk) ?? 1e18)) { G.set(nk, ng); from.set(nk, k); push([ng + h(ni, nj) * 1.25, ni, nj]); } } }
    if (!found) return null;
    const cells = []; let k = gk; while (k !== undefined) { cells.push([(Math.floor(k / 8192) - OFF) * C, (k % 8192 - OFF) * C]); k = from.get(k); } cells.reverse();
    if (this._clear(gx, gz) && this._sight(cells[cells.length - 1][0], cells[cells.length - 1][1], gx, gz)) cells.push([gx, gz]);
    const out = [cells[0]]; let a = 0; while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !this._sight(cells[a][0], cells[a][1], cells[b][0], cells[b][1])) b--; out.push(cells[b]); a = b; }
    return out;
  }
  _snap(x, z) { if (this._clear(x, z)) return [x, z]; for (let r = 2; r <= 40; r += 2) for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2, nx = x + Math.cos(an) * r, nz = z + Math.sin(an) * r; if (this._clear(nx, nz)) return [nx, nz]; } return [x, z]; }
  _followRoute() {
    const r = this._route; if (!r) return; const p = this.player.position;
    if (this.ride || this.vehicle) { this._route = null; return; }
    const w = r.path[r.i]; const last = r.i === r.path.length - 1;
    if (Math.hypot(w[0] - p.x, w[1] - p.z) < (last ? 1.4 : 1.8)) { r.i++; if (r.i >= r.path.length) { this._arrived(r.pl); return; } }
    const n = r.path[Math.min(r.i, r.path.length - 1)]; this.walkTarget = new THREE.Vector3(n[0], p.y, n[1]);
    if (this.t - r.chk > 1.1) { const moved = Math.hypot(p.x - r.cx, p.z - r.cz); r.chk = this.t; r.cx = p.x; r.cz = p.z; if (moved < 0.5 && !this.paused) { r.tries++; const np = r.tries < 2 ? this.findPath(p.x, p.z, r.pl.x, r.pl.z) : null; if (np) { r.path = np; r.i = 0; } else if (r.pl.silent) { this._route = null; this.walkTarget = null; } else { this.toast('Shortcut! Transporting you the rest of the way. ✨', 2400); this.travel(r.pl, 'port'); } } }
  }
  setSpeed(i) { const S = WVM.SPEEDS; this.speedIdx = ((i % S.length) + S.length) % S.length; this.speedMul = S[this.speedIdx][1]; this._save('wvm_speed', this.speedIdx); const b = this.hud.querySelector('#wvm-speed'); if (b) { b.textContent = S[this.speedIdx][0]; b.title = 'Speed: ' + S[this.speedIdx][2]; } }
  /* Neon boost strip: step on it and you shoot forward for a couple of seconds. */
  addBoost(x, z, rot = 0, len = 16, wid = 4, y = 0.07) {
    if (!WVM._boostTex) { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#031a3a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#38f0ff'; g.lineWidth = 14; g.lineJoin = 'round'; g.shadowColor = '#7cf8ff'; g.shadowBlur = 14; for (const yy of [40, 104]) { g.beginPath(); g.moveTo(14, yy); g.lineTo(64, yy - 36); g.lineTo(114, yy); g.stroke(); } WVM._boostTex = c; }
    const t = new THREE.CanvasTexture(WVM._boostTex); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, len / 4); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), new THREE.MeshStandardMaterial({ map: t, emissive: 0x38f0ff, emissiveMap: t, emissiveIntensity: 1.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z); m.userData.noShadow = true; this.scene.add(m);
    const b = { x, z, c: Math.cos(rot), s: Math.sin(rot), hl: len / 2, hw: wid / 2, t, on: false }; this.boosts.push(b); return m;
  }
  _updateBoosts(dt) { const p = this.player.position; for (const b of this.boosts) { b.t.offset.y -= dt * 2.2; const dx = p.x - b.x, dz = p.z - b.z; const along = dx * b.s + dz * b.c, across = dx * b.c - dz * b.s; const on = Math.abs(along) < b.hl && Math.abs(across) < b.hw && !this.ride && (this.level || 0) === 0; if (on && !b.on) { this.toast('⚡ BOOST!', 900); this.buzz(30); } b.on = on; if (on) this._boost = 2.2; } if (this._boost > 0) this._boost -= dt; }
  /* A sittable reclaimed-barnwood bench. opts.credit links the maker. */
  addBench(x, z, rot = 0, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, opts.y || 0, z); g.rotation.y = rot; const wood = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }); const tones = [0x6b4423, 0x7a5230, 0x5c3a1e, 0x8a6238];
    for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.09, 0.22), wood(tones[i % 4])); pl.position.set(0, 0.62, -0.36 + i * 0.24); pl.rotation.y = (i % 2 ? 1 : -1) * 0.004; g.add(pl); }
    for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.08), wood(tones[(i + 1) % 4])); pl.position.set(0, 0.9 + i * 0.24, -0.52); pl.rotation.x = -0.12; g.add(pl); }
    for (const sx of [-1.45, 1.45]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), wood(0x4a2e15)); leg.position.set(sx, 0.75, -0.5); g.add(leg); const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), wood(0x4a2e15)); f.position.set(sx, 0.3, 0.36); g.add(f); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 1.0), wood(0x7a5230)); arm.position.set(sx, 0.95, -0.08); g.add(arm); }
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), new THREE.MeshBasicMaterial({ map: makeTextTexture(opts.plaque || 'RAISED IN A BARN · handcrafted in Colorado', { w: 1024, h: 128, bg: '#3a2410', fg: '#f5d9a0', border: null, glow: false, font: 'bold 50px Georgia, serif', radius: 10 }) })); plq.position.set(0, 1.14, -0.47); plq.rotation.x = -0.12; g.add(plq);
    this.scene.add(g); this.addBox(x, z, 0.5, 0.5);
    const seat = new THREE.Vector3(x + Math.sin(rot) * 0.05, (opts.y || 0) + 0.28, z + Math.cos(rot) * 0.05); let sitting = false;
    const motes = []; const stand = (a) => { sitting = false; a.locked = false; a.avatar.position.y = 0; sitPerson(a.avatar, false); a.player.position.set(x + Math.sin(rot) * 1.6, opts.y || 0, z + Math.cos(rot) * 1.6); motes.forEach(m => { g.remove(m); }); motes.length = 0; it.label = '🪑 Sit on the barnwood bench'; a._act = null; };
    const it = { x: x + Math.sin(rot) * 1.4, z: z + Math.cos(rot) * 1.4, r: 3, label: '🪑 Sit on the barnwood bench', level: opts.level, fn: (a) => { if (sitting) { stand(a); return; } sitting = true; a._route = null; a.walkTarget = null; a.locked = true; a.player.position.copy(seat); a.avatar.rotation.y = rot; sitPerson(a.avatar, true); a.avatar.position.y = 0.3; it.label = '🧍 Stand up'; a._act = null;
        for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: [0xffd98a, 0xfff2c9, 0xd9a441][i % 3], transparent: true, opacity: 0.9, depthWrite: false })); s.scale.setScalar(0.07); s.userData = { a: Math.random() * 6.28, r: 0.6 + Math.random() * 1.2, y: Math.random() * 2, v: 0.2 + Math.random() * 0.4 }; g.add(s); motes.push(s); }
        a.say(opts.say || 'Ahh. Real barnwood. Take a breath. ✌️', 4); if (opts.credit) setTimeout(() => { if (sitting) a.toast('This bench: ' + opts.credit, 4200); }, 4600); } };
    (this.interactables = this.interactables || []).push(it);
    this.onUpdate((dt, t) => { if (sitting && this.player.position.distanceTo(seat) > 0.5 && !this.locked) stand(this); for (const m of motes) { const u = m.userData; u.y += u.v * dt; if (u.y > 2.6) u.y = 0.3; m.position.set(Math.cos(u.a + t * 0.5) * u.r, 0.6 + u.y, Math.sin(u.a + t * 0.5) * u.r * 0.6); m.material.opacity = 0.9 * (1 - u.y / 2.6); } });
    if (opts.url) this.addHotspot(plq, { title: 'Raised In a Barn Furniture 🪵', html: '<p>Every bench in this world is modeled on reclaimed Colorado barnwood furniture, handcrafted to last for generations. Beds, tables, dressers, doors, custom sizes.</p>', actions: [{ label: 'See the real furniture', href: opts.url, newTab: true, primary: true }] });
    return g;
  }
  /* A dancing fountain: a tall center jet, a ring of arcing jets whose heights rise and fall in a slow wave, mist, and slow color lights. */
  addFountain(x, y, z, o = {}) {
    const jets = o.jets || 16, ring = o.ring || 12, H = o.height || 20, C = o.center || 36, n = o.count || (isMobile() ? 320 : 600); const g = new THREE.Group(); g.position.set(x, y, z); this.scene.add(g);
    if (o.basin) { const rim = new THREE.Mesh(new THREE.TorusGeometry(o.basin, 0.5, 10, 64), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.3, metalness: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.45; g.add(rim); const pool = new THREE.Mesh(new THREE.CircleGeometry(o.basin, 48), new THREE.MeshStandardMaterial({ color: 0x2f9fe0, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.35; g.add(pool); this.addObstacle(x, z, o.basin + 0.8); }
    const geo = new THREE.BufferGeometry(), a = new Float32Array(n * 3), ph = new Float32Array(n), jx = new Float32Array(n); for (let i = 0; i < n; i++) { ph[i] = Math.random(); jx[i] = (Math.random() - 0.5); } geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdff4ff, size: o.size || Math.max(0.35, C * 0.012), transparent: true, opacity: 0.85, depthWrite: false })); pts.frustumCulled = false; pts.userData.mapHide = true; g.add(pts);
    const lights = []; for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.4, ring * 0.05), 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 })); const an = k / 6 * Math.PI * 2; l.position.set(Math.cos(an) * ring * 0.55, 0.5, Math.sin(an) * ring * 0.55); g.add(l); lights.push(l); }
    this.onUpdate((dt, t) => { const P = this.player.position; const far2 = (P.x - x) ** 2 + (P.z - z) ** 2; pts.visible = far2 < 90000 || this.dist > 30; if (!pts.visible || (this._ff = !this._ff)) return; const cH = C * (0.78 + 0.22 * Math.sin(t * 0.45));
      for (let i = 0; i < n; i++) { const j = i % (jets + 3); const T = (t * 0.55 + ph[i]) % 1; if (j >= jets) { const sp = C * 0.05; a[i * 3] = jx[i] * sp * T * 2; a[i * 3 + 1] = cH * 4 * T * (1 - T) * (0.85 + jx[i] * 0.3); a[i * 3 + 2] = (ph[i] - 0.5) * sp * T * 2; } else { const an = j / jets * Math.PI * 2 + t * 0.05, hj = H * (0.55 + 0.45 * Math.sin(t * 0.7 + j * 0.7)), rr = ring * (1 - 0.82 * T); a[i * 3] = Math.cos(an) * rr + jx[i] * 0.5; a[i * 3 + 1] = hj * 4 * T * (1 - T); a[i * 3 + 2] = Math.sin(an) * rr + jx[i] * 0.5; } }
      geo.attributes.position.needsUpdate = true; lights.forEach((l, k) => { l.material.emissive.setHSL((t * 0.025 + k / 6) % 1, 0.9, 0.55); l.material.color.copy(l.material.emissive); }); });
    return g;
  }
  /* Embedded interactive page (science sims, live maps, music toys) inside a popup, with an open-in-new-tab fallback. */
  embed(title, url, note = '') { this.popup(title, '<div style="position:relative;padding-top:66%;border-radius:12px;overflow:hidden;background:#0b1a3a"><iframe src="' + esc(url) + '" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="fullscreen; autoplay; microphone; midi" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>' + (note ? '<p class="muted">' + esc(note) + '</p>' : ''), [{ label: '↗ Open full size in a new tab', href: url, newTab: true }]); this.pop.querySelector('.wvm-card').classList.add('wvm-card-wide'); }
  /* text planes that are double-sided read backwards from behind: make the front one-sided and give the back a solid panel */
  fixBackwards(root) { const back = WVM._backMat || (WVM._backMat = new THREE.MeshBasicMaterial({ color: 0x0b1a3a })); const todo = []; (root || this.scene).traverse(o => { if (!o.isMesh || o.isSprite || o.userData.bw) return; const m = o.material; if (!m || Array.isArray(m) || m.side !== THREE.DoubleSide || !m.map || !m.map.userData || !m.map.userData.isText) return; if (!o.geometry || o.geometry.type !== 'PlaneGeometry') return; todo.push(o); });
    for (const o of todo) { o.userData.bw = true; o.material.side = THREE.FrontSide; o.material.needsUpdate = true; if (Math.abs(o.rotation.x) > 1.2) continue; const b = new THREE.Mesh(o.geometry, back); b.rotation.y = Math.PI; b.position.z = -0.02; b.userData.bw = true; b.userData.noShadow = true; o.add(b); } return todo.length; }
  /* ----- search panel ----- */
  openSearch(q = '') { const el = this.searchPanel; el.classList.add('on'); const inp = el.querySelector('input'); inp.value = q; this._renderSearch(q); if (!isTouch()) setTimeout(() => inp.focus(), 60); }
  closeSearch() { if (this.searchPanel) { this.searchPanel.classList.remove('on'); const i = this.searchPanel.querySelector('input'); if (i) i.blur(); } }
  _renderSearch(q) {
    const body = this.searchPanel.querySelector('.wvm-search-body'); body.innerHTML = ''; let list = this.findPlaces(q, 14);
    if (!q.trim()) { list = this.places.filter(p => p.top).slice(0, 16); const h = document.createElement('div'); h.className = 'muted'; h.style.margin = '2px 2px 8px'; h.textContent = 'Popular right now'; body.appendChild(h); }
    if (!list.length) { const d = document.createElement('div'); d.className = 'muted'; d.style.padding = '8px'; d.textContent = 'Nothing by that name yet. Try: zoo, beach, food, movies, art, coaster, arcade, or a store name.'; body.appendChild(d); return; }
    for (const p of list) { const b = document.createElement('button'); b.className = 'wvm-place'; b.innerHTML = '<span>' + (p.icon || '📍') + '</span><b>' + esc(p.name) + '</b><small>' + esc(p.cat || '') + (p.url ? ' · other area' : '') + '</small>'; b.onclick = () => this.travel(p); body.appendChild(b); }
  }
  /* ----- weather: a different 7-day forecast every week, mostly sunny ----- */
  static forecast(date = new Date()) {
    const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 6e4) / 864e5), week = Math.floor((day + 3) / 7); let s = (week * 2654435761) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const fun = ['rain', 'snow', 'tornado', 'fog', 'windy', 'rainbow', 'rain', 'meteor']; const lastWeekFirst = fun[(((week - 1) * 2654435761) >>> 0) % fun.length];
    const days = Array(7).fill('sunny'); const n = 2 + (rnd() < 0.4 ? 1 : 0); const pool = fun.filter(f => f !== lastWeekFirst); const used = new Set();
    for (let i = 0; i < n; i++) { let d; do { d = Math.floor(rnd() * 7); } while (used.has(d)); used.add(d); days[d] = pool[(Math.floor(rnd() * pool.length) + i + week) % pool.length]; }
    const idx = (((day + 3) % 7) + 7) % 7; return { today: days[idx], days, idx, week };
  }
  autoWeather() { let w = WVM.forecast().today; try { const q = new URLSearchParams(location.search).get('weather'); if (q) w = q; } catch (e) { } this.setWeather(w); return w; }
  setWeather(kind) {
    const W = this._wx || (this._wx = { objs: [], upd: null }); for (const o of W.objs) { (o.parent || this.scene).remove(o); } W.objs = []; if (W.upd) { this.updaters = this.updaters.filter(u => u !== W.upd); W.upd = null; }
    if (W.fog) { this.opts.fogNear = W.fog[0]; this.opts.fogFar = W.fog[1]; this._farMode = undefined; this.scene.fog.near = W.fog[0]; this.scene.fog.far = W.fog[1]; } W.fog = [this.opts.fogNear, this.opts.fogFar];
    this.weather = kind; const add = (o, parent) => { (parent || this.scene).add(o); W.objs.push(o); return o; }; const mob = isMobile(); const P = this.player.position; const ups = [];
    const dim = (n, f) => { this.opts.fogNear = n; this.opts.fogFar = f; this._farMode = undefined; this.scene.fog.near = n; this.scene.fog.far = f; };
    const fall = (count, col, size, vy, sway, box = 60, op = 0.75) => { const geo = new THREE.BufferGeometry(); const a = new Float32Array(count * 3); for (let i = 0; i < count; i++) { a[i * 3] = (Math.random() - 0.5) * box; a[i * 3 + 1] = Math.random() * 34; a[i * 3 + 2] = (Math.random() - 0.5) * box; } geo.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pts = add(new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size, transparent: true, opacity: op, depthWrite: false, sizeAttenuation: true }))); pts.frustumCulled = false; pts.userData.mapHide = true;
      ups.push((dt, t) => { pts.position.set(P.x, P.y, P.z); for (let i = 0; i < count; i++) { a[i * 3 + 1] -= vy * dt * (0.8 + (i % 5) * 0.1); if (sway) { a[i * 3] += Math.sin(t * 1.3 + i) * sway * dt; a[i * 3 + 2] += Math.cos(t * 1.1 + i * 1.7) * sway * dt; } if (a[i * 3 + 1] < 0) { a[i * 3 + 1] = 30 + Math.random() * 4; a[i * 3] = (Math.random() - 0.5) * box; a[i * 3 + 2] = (Math.random() - 0.5) * box; } } geo.attributes.position.needsUpdate = true; }); return pts; };
    const umbrella = () => { const u = new THREE.Group(); const cols = [0xff4f79, 0xffd23f, 0x38f0ff, 0x7cff6b]; for (let i = 0; i < 8; i++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.5, 3, 1, true, i / 8 * Math.PI * 2, Math.PI / 4), new THREE.MeshStandardMaterial({ color: cols[i % 4], side: THREE.DoubleSide, roughness: 0.6 })); u.add(seg); } const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x333333 })); stick.position.y = -0.75; u.add(stick); u.position.set(0.28, (this.avatar.userData.headY || 2) + 0.75, 0); u.scale.setScalar(0.01); add(u, this.player); ups.push((dt) => { const s = u.scale.x; u.scale.setScalar(Math.min(1, s + dt * 2.5)); u.rotation.y += dt * 0.3; u.visible = !this.ride && this.dist > 0.6; }); };
    const puddles = () => { const mat = new THREE.MeshStandardMaterial({ color: 0x31506e, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -3 }); const list = []; let tries = 0; while (list.length < (mob ? 8 : 16) && tries++ < 200) { const x = this.opts.spawn.x + (Math.random() - 0.5) * 200, z = this.opts.spawn.z + (Math.random() - 0.5) * 200; if (!this._clear(x, z) || this.opts.groundY(x, z) > 0.2) continue; const r = 1.2 + Math.random() * 1.8; const m = add(new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat)); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.6 + Math.random() * 0.5, 1); m.position.set(x, 0.06, z); m.userData.noShadow = true; list.push({ x, z, r, in: false }); } const ring = add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; let rk = 1; ups.push((dt) => { for (const q of list) { const inn = Math.hypot(P.x - q.x, P.z - q.z) < q.r * 0.8; if (inn && !q.in) { this.toast('💦 Splash! Right in the puddle.', 1500); this.buzz(25); rk = 0; ring.position.set(P.x, 0.09, P.z); } q.in = inn; } if (rk < 1) { rk += dt * 1.2; ring.scale.setScalar(1 + rk * 3); ring.material.opacity = 0.8 * (1 - rk); } }); };
    if (kind === 'rain') { fall(mob ? 500 : 1400, 0x9fc4e8, 0.16, 26, 0); umbrella(); puddles(); dim(this.opts.fogNear * 0.6, this.opts.fogFar * 0.7); }
    else if (kind === 'snow') { fall(mob ? 450 : 1200, 0xffffff, 0.24, 3.2, 1.6, 70, 0.9); dim(this.opts.fogNear * 0.7, this.opts.fogFar * 0.75); }
    else if (kind === 'windy') { fall(mob ? 120 : 300, 0xe08a2b, 0.32, 1.6, 9, 80, 0.95); }
    else if (kind === 'fog') { dim(12, 170); }
    else if (kind === 'meteor') { const mk = () => { const m = add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c9 }))); const tail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 26, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.35, depthWrite: false })); tail.position.y = 13; m.add(tail); m.userData.k = 1; m.userData.mapHide = true; return m; }; const ms = [mk(), mk(), mk()]; ups.push((dt) => { ms.forEach((m, i) => { const u = m.userData; u.k += dt * 0.22; if (u.k >= 1) { u.k = -Math.random() * 1.5; u.a = Math.random() * 6.28; u.r = 300 + Math.random() * 250; } m.visible = u.k > 0; const k = Math.max(0, u.k); m.position.set(P.x + Math.cos(u.a) * u.r + k * 260, 420 - k * 330, P.z + Math.sin(u.a) * u.r); m.rotation.z = 0.67; }); }); }
    else if (kind === 'rainbow') { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); ['#ff2d2d', '#ff9a1f', '#ffe14d', '#4cd964', '#38b6ff', '#5856d6', '#b08cff'].forEach((col, i) => gr.addColorStop(i / 6, col)); g.fillStyle = gr; g.fillRect(0, 0, 8, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const bow = add(new THREE.Mesh(new THREE.RingGeometry(330, 380, 64, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }))); const uv = bow.geometry.attributes.uv, pos = bow.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, 0.5, (r - 330) / 50); } bow.position.set(this.opts.spawn.x - 200, -20, this.opts.spawn.z - 900); bow.userData.mapHide = true; fall(mob ? 160 : 400, 0xbfe0ff, 0.12, 20, 0, 60, 0.45); }
    else if (kind === 'tornado') { const tw = add(new THREE.Group()); tw.userData.mapHide = true; const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }); const rings = []; for (let i = 0; i < 16; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3 + i * i * 0.16, 1.6 + i * 0.35, 6, 18), mat); r.rotation.x = Math.PI / 2; r.position.y = 3 + i * 8; tw.add(r); rings.push(r); } const deb = new THREE.BufferGeometry(); const n = 160, a = new Float32Array(n * 3); deb.setAttribute('position', new THREE.BufferAttribute(a, 3)); const dp = new THREE.Points(deb, new THREE.PointsMaterial({ color: 0x5c4a36, size: 1.2 })); dp.frustumCulled = false; tw.add(dp); const R = (this.opts.bounds || 500) * 0.86; dim(this.opts.fogNear * 0.7, this.opts.fogFar * 0.8);
      ups.push((dt, t) => { const an = t * 0.035; tw.position.set(Math.cos(an) * R, 0, Math.sin(an) * R); rings.forEach((r, i) => { r.position.x = Math.sin(t * 1.2 + i * 0.5) * i * 0.7; r.position.z = Math.cos(t * 0.9 + i * 0.4) * i * 0.7; r.rotation.z = t * (3 - i * 0.1); }); for (let i = 0; i < n; i++) { const h = (i / n) * 120, rr = 5 + h * 0.3, aa = t * (4 - h * 0.02) + i; a[i * 3] = Math.cos(aa) * rr; a[i * 3 + 1] = h; a[i * 3 + 2] = Math.sin(aa) * rr; } deb.attributes.position.needsUpdate = true; }); fall(mob ? 100 : 260, 0xb7a58a, 0.3, 2, 12, 80, 0.8); }
    if (ups.length) { W.upd = (dt, t) => { for (const u of ups) u(dt, t); }; this.onUpdate(W.upd); }
    const msg = { rain: '🌧️ Rain today. Your umbrella popped open. Mind the puddles.', snow: '❄️ Snow day on the island!', windy: '🍂 Windy one today. Hold on to your hat.', fog: '🌫️ Foggy morning over the clouds.', meteor: '☄️ Meteor shower overhead. Look up.', rainbow: '🌈 Sun shower. Find the rainbow.', tornado: '🌪️ Tornado watch! It stays out past the edge of the island. Probably.' }[kind]; if (msg) setTimeout(() => this.toast(msg, 5000), 6000);
  }
  /* ?to=<place id> in the address (from search, the map, or the helper bot on another page) */
  _deepLink() { let to = null, ride = null; try { const q = new URLSearchParams(location.search); to = q.get('to'); ride = q.get('ride'); } catch (e) { } this.arrival = { to, ride }; if (!to) return; const pl = this.places.find(p => p.id === to); if (!pl || pl.url) return; if (pl.fn) { setTimeout(() => pl.fn(this), 1400); return; } if (this.opts.onTravel) this.opts.onTravel(pl, this); const [tx, tz] = this._snap(pl.x, pl.z); this.player.position.set(tx, this.opts.groundY(tx, tz), tz); this._faceView(pl, tx, tz); this.arrival.placed = pl; setTimeout(() => this._arrived(pl), 2600); }

  /* ----- v20 speed governor -----
     1) Auto quality: watches real frame time. If the machine is struggling it steps down on its own (glow pass off, then render resolution down in small steps, then shadows refreshed less often) and steps back up when there is headroom. Fast machines never notice it.
     2) Distance culling: whole objects farther away than you can see (past the fog, or in another sealed hall hundreds of meters off) are skipped entirely, checked twice a second.
     3) Shadows are re-drawn every other frame (every 4th at the lowest level) instead of every frame. */
  _perf(dt) {
    const Q = this._q || (this._q = { lvl: 0, acc: 0, n: 0, hold: 0, base: this.renderer.getPixelRatio(), f: 0, cullT: 0, list: null, listT: -99 }); Q.f++;
    if (Q.f === 1 && !isMobile()) { Q.lvl = this.opts.startLvl ?? 1; this._noBloom = true; this._applyQ(Q); }
    if (this.renderer.shadowMap.enabled) { this.renderer.shadowMap.autoUpdate = false; if (!this._intro && Q.f % ((Q.lvl >= 4 ? 4 : Q.lvl >= 2 ? 2 : 1) * (this.opts.shadowEvery || 1)) === 0) this.renderer.shadowMap.needsUpdate = true; }
    const raw = this.clock ? dt : dt; if (!this.paused && document.visibilityState !== 'hidden' && !this.renderer.xr.isPresenting && this.loader.classList.contains('off')) { Q.acc += raw; Q.n++; }
    if (Q.acc >= 1.1 && Q.n >= 6) { const ms = Q.acc / Q.n * 1000; Q.acc = 0; Q.n = 0; if (Q.hold > 0) Q.hold--; else if (ms > 27 && Q.lvl < 5) { (Q.bad = Q.bad || {})[Q.lvl] = this.t; Q.lvl = Math.min(5, Q.lvl + (ms > 42 ? 2 : 1)); Q.hold = 1; this._applyQ(Q); } else if (ms < 17.5 && Q.lvl > 0 && !this._intro && !this._holdQ && this.t - ((Q.bad || {})[Q.lvl - 1] || -999) > 120) { Q.lvl--; Q.hold = 4; this._applyQ(Q); } }
    if (this.t - Q.cullT > (this._intro ? 0.15 : 0.5)) { Q.cullT = this.t; this._cull(Q); }
  }
  _applyQ(Q) { const ratios = [1, 1, 0.85, 0.72, 0.62, 0.55]; this._noBloom = Q.lvl >= 1; const pr = Math.max(0.6, Q.base * ratios[Q.lvl]); if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.01) { this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth, innerHeight); if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(innerWidth, innerHeight); } } }
  _cull(Q) {
    if (this.t - Q.listT > 4) { Q.listT = this.t; Q.budget = 0; const L = []; const box = new THREE.Box3(), sph = new THREE.Sphere(); for (const o of this.scene.children) { if (o.isLight || o.isCamera || o === this.player || o === this.rig || o.userData.noCull || o.isPoints || o.frustumCulled === false) continue; let c = o.userData._cs; if (!c) { if ((Q.budget = (Q.budget || 0) + 1) > 250) continue; try { box.setFromObject(o); if (box.isEmpty()) continue; box.getBoundingSphere(sph); c = o.userData._cs = { r: sph.radius, ox: sph.center.x - o.position.x, oz: sph.center.z - o.position.z }; } catch (e) { continue; } } if (c.r > 260) continue; L.push(o); } Q.list = L; }
    if (!Q.list) return; const P = this.player.position; const wide = this.dist > 30 || !!this._intro || !!this.ride || !!this._air; const lim = this.opts.cullDist || Math.min(this.opts.fogFar * 1.05, 900); const camY = this._air ? this.rig.position.y : this.rig.position.y - P.y; const lod = wide && camY > 50 ? Math.min(40, camY * 0.0125) : 0;
    for (const o of Q.list) { const c = o.userData._cs; const dx = o.position.x + c.ox - P.x, dz = o.position.z + c.oz - P.z; const far = (!wide && Math.sqrt(dx * dx + dz * dz) - c.r > lim) || (lod > 0 && c.r < lod && !o.userData.keepLOD); if (far) { if (o.visible && !o.userData._culled) { o.visible = false; o.userData._culled = true; } } else if (o.userData._culled) { o.visible = true; o.userData._culled = false; } }
  }
  /* measure every top-level object once, up front, so culling and air-LOD work from the very first frame */
  _cullPrep() { const box = new THREE.Box3(), sph = new THREE.Sphere(); for (const o of this.scene.children) { if (o.isLight || o.isCamera || o === this.player || o === this.rig || o.userData.noCull || o.userData._cs) continue; try { box.setFromObject(o); if (box.isEmpty()) continue; box.getBoundingSphere(sph); o.userData._cs = { r: sph.radius, ox: sph.center.x - o.position.x, oz: sph.center.z - o.position.z }; } catch (e) { } } if (this._q) this._q.listT = -99; }
  _uncullAll() { const Q = this._q; if (Q && Q.list) for (const o of Q.list) if (o.userData._culled) { o.visible = true; o.userData._culled = false; } }

  /* ----- frame ----- */
  _frame() {
    const raw = this.clock.getDelta(); const dt = Math.min(0.05, raw); this.t += dt;
    if (!this.paused) { const mdt = Math.min(0.1, raw), n = (this.ride || mdt <= 0.034) ? 1 : Math.ceil(mdt / 0.034); for (let i = 0; i < n; i++) this._movePlayer(this.ride ? dt : mdt / n); }
    if (this._clip) this._seatUpdate();
    if (!this.paused || this._sw) this._swim(dt);
    this._updateCamera(dt);
    this._updateNPCs(dt);
    this._updateZones(); this._updateInteractables(); this._updateBalls(dt); if (this.boosts.length && (this.level || 0) < 3) this._updateBoosts(dt);
    if (this.t - (this._cullT || 0) > 0.3) { this._cullT = this.t; const far = this.opts.spriteFar || 90, P = this.player.position, v = this._cv || (this._cv = new THREE.Vector3()); const wide = this.dist > 30 || !!this._intro || !!this._air; const high = wide && (this._air || this.rig.position.y - P.y > 80); for (const sp of SPRITES) { if (!sp.parent) continue; v.setFromMatrixPosition(sp.matrixWorld); const f = sp.userData.far || far; const dx = v.x - P.x, dz = v.z - P.z; sp.layers.set((high && f < 1e8) || (!wide && dx * dx + dz * dz > f * f) ? 1 : 0); } }
    if (this.triggers && !this.paused && !this.ride && !this._air && (this.level || 0) < 3) { const p = this.player.position; for (const tr of this.triggers) { const dx = p.x - tr.x, dz = p.z - tr.z; const inside = dx * dx + dz * dz < tr.r * tr.r; if (inside && !tr.fired) { tr.fired = true; tr.fn(this); } else if (!inside) tr.fired = false; } }
    for (const u of this.updaters) u(dt, this.t);
    this._perf(dt);
    if (this.composer && !this._noBloom && !this._intro && !this.renderer.xr.isPresenting) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
    let speed = (this.keys.ShiftLeft || this.keys.ShiftRight || this.running) ? o.runSpeed : o.walkSpeed; if (this.vehicle) { speed *= this.vehicle.speed * (this.vehicle.turbo > 0 ? 1.9 : 1); }
    speed *= this.speedMul * (this._boost > 0 ? 2.6 : 1) * (this._route ? 1.3 : 1) * (this._sw && this._sw.on ? 0.6 : 1);
    if (mv.lengthSq() > 1) mv.normalize();
    if (this._route) { if (mv.lengthSq() > 0.04) { this._route = null; this.walkTarget = null; this.toast('Okay, you have the controls. 🎮', 1500); } else if (!this.locked) this._followRoute(); }
    // tap-to-walk (a plain walk target that stops making progress is dropped, so nobody moonwalks into a wall)
    if (this.walkTarget && !this._route) { const w = this._wchk || (this._wchk = { t: this.t, x: p.position.x, z: p.position.z }); if (this.t - w.t > 1.2) { if (Math.hypot(p.position.x - w.x, p.position.z - w.z) < 0.4) { this.walkTarget = null; this._wchk = null; } else { w.t = this.t; w.x = p.position.x; w.z = p.position.z; } } } else if (!this.walkTarget) this._wchk = null;
    if (this.walkTarget && mv.lengthSq() < 0.01) {
      const d = new THREE.Vector2(this.walkTarget.x - p.position.x, this.walkTarget.z - p.position.z);
      if (d.length() < 0.6) { this.walkTarget = null; } else {
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
      const before = p.position.clone();
      if (!this._blocked(nx, nz)) { p.position.x = nx; p.position.z = nz; this._slideT = 0; }
      else { let done = false; const sgn = this._slideS || 1; this._slideT = (this._slideT || 0) + dt;
        for (const ang of [0.4, 0.8, 1.2, 1.5]) { for (const s of [sgn, -sgn]) { const c = Math.cos(ang * s), sn = Math.sin(ang * s), k = Math.max(0.6, Math.cos(ang)); const sx = (step.x * c - step.z * sn) * k, sz = (step.x * sn + step.z * c) * k; if (!this._blocked(p.position.x + sx, p.position.z + sz)) { p.position.x += sx; p.position.z += sz; this._slideS = s; done = true; break; } } if (done) break; }
        if (!done) { if (!this._blocked(nx, p.position.z)) p.position.x = nx; else if (!this._blocked(p.position.x, nz)) p.position.z = nz; } }
      const B = this.opts.bounds || 600; p.position.x = clamp(p.position.x, -B, B); p.position.z = clamp(p.position.z, -B, B); const BR = this.opts.boundR; if (BR && !this.level && !this._inWorld(p.position.x, p.position.z)) { const rr = Math.hypot(p.position.x, p.position.z); if (rr > BR + 30) { p.position.x *= BR / rr; p.position.z *= BR / rr; if (this.t - (this._edgeT || -99) > 30) { this._edgeT = this.t; this.toast('🌤️ The edge of the island. From here it is clouds, skyline, and the Earth far below.', 3600); } } }
      this.walked += before.distanceTo(p.position);
      for (const h of this._stepHooks) { if (!h.done && this.walked >= h.meters) { h.done = true; try { h.fn(this); } catch (e) { console.error(e); } } }
      const ang = Math.atan2(step.x, step.z); this.avatar.rotation.y = lerpAngle(this.avatar.rotation.y, ang, 1 - Math.pow(0.75, dt * 60));
    }
    p.position.y = o.groundY(p.position.x, p.position.z);
    if (this.vehicle) { const v = this.vehicle.m; v.position.copy(p.position); v.rotation.y = this.avatar.rotation.y; if (this.vehicle.turbo > 0) this.vehicle.turbo -= dt; sitPerson(this.avatar, true); animatePerson(this.avatar, this.t, 0); return; }
    animatePerson(this.avatar, this.t, this.moving ? (speed / o.walkSpeed) : 0);
  }

  _updateCamera(dt) {
    if (this.renderer.xr.isPresenting) { this.rig.position.copy(this.player.position); this.rig.rotation.y = this.yaw; return; }
    this.dist = lerp(this.dist, this.targetDist, 1 - Math.pow(0.85, Math.max(dt, 0.001) * 60));
    const first = this.dist < 0.6;
    this.avatar.visible = !first && !this._intro && !this._introPending;
    const p = this.player.position;
    const eye = new THREE.Vector3(p.x, p.y + 1.65, p.z);
    if (first) {
      this.rig.position.copy(eye); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(this.pitch, this.yaw, this.roll || 0, 'YXZ');
    } else if (this.viewMode === 'top') {
      const camPos = new THREE.Vector3(p.x + Math.sin(this.yaw) * 2, p.y + 6 + this.dist * 1.6, p.z + Math.cos(this.yaw) * 2);
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0); this.rig.updateMatrixWorld(); this.camera.lookAt(eye);
    } else if (this.viewMode === 'orbit') {
      const a = this.t * 0.35; const camPos = new THREE.Vector3(p.x + Math.sin(a) * this.dist * 1.3, p.y + 2.2, p.z + Math.cos(a) * this.dist * 1.3);
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0); this.rig.updateMatrixWorld(); this.camera.lookAt(eye);
    } else {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const off = new THREE.Vector3(Math.sin(this.yaw) * cp * this.dist, -sp * this.dist + 0.6, Math.cos(this.yaw) * cp * this.dist);
      const od = off.length(); if (od > 0.01) off.multiplyScalar(this._occlusion(eye, off.clone().divideScalar(od), od) / od);
      const camPos = eye.clone().add(off);
      const gy = this.opts.groundY(camPos.x, camPos.z) + 0.4; if (camPos.y < gy) camPos.y = gy;
      // zoomed way out = world view: push the fog back so the whole map stays visible
      const far = this.dist > 30; if (far !== this._farMode) { this._farMode = far; this.setFar(far); if (!this._air) { this.scene.fog.near = far ? this.opts.fogFar * 2 : this.opts.fogNear; this.scene.fog.far = far ? this.opts.fogFar * 6 : this.opts.fogFar; } }
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0);
      this.rig.updateMatrixWorld(); this.camera.lookAt(eye); if (this.roll) this.camera.rotateZ(this.roll);
    }
  }

  setFar(on) { const f = (on || this._air) ? (this.opts.camFar || 2400) : 2400; if (this.camera.far !== f) { this.camera.far = f; this.camera.updateProjectionMatrix(); } }
  _occlusion(eye, dir, dist) {
    if (this.t - (this._occT || 0) > 0.25) { this._occT = this.t; let lim = Infinity;
      if (dist > 1.6 && dist < 30 && !this.ride) { const rc = this._rc || (this._rc = new THREE.Raycaster()); rc.set(eye, dir); rc.far = dist; rc.layers.set(0); const P0 = this.player.position; if (!this._occList || this.t - (this._occListT || -9) > 12 || Math.hypot(P0.x - (this._occX || 0), P0.z - (this._occZ || 0)) > 14 || (this.level || 0) !== this._occLv) { this._occListT = this.t; this._occX = P0.x; this._occZ = P0.z; this._occLv = this.level || 0; const L = []; const P = this.player.position; const v = new THREE.Vector3(); const near = []; for (const top of this.scene.children) { const c = top.userData._cs; if (top === this.player || top === this.rig || top.isLight || top.visible === false) continue; if (c && c.r < 400) { const ddx = top.position.x + c.ox - P.x, ddz = top.position.z + c.oz - P.z; if (ddx * ddx + ddz * ddz > (c.r + 50) * (c.r + 50)) continue; } near.push(top); } for (const top of near) top.traverse(o => { if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isSprite || L.length > 400) return; const m = o.material; if (!m || Array.isArray(m) || m.transparent || m.visible === false || o.userData.noOcclude) return; const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = g.boundingSphere; if (!bs || bs.radius < 1.5) return; v.setFromMatrixPosition(o.matrixWorld); const reach = bs.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) + 45; if ((v.x - P.x) ** 2 + (v.z - P.z) ** 2 > reach * reach) return; L.push(o); }); this._occList = L; }
        let hits = []; try { hits = rc.intersectObjects(this._occList, false); } catch (e) { }
        for (const h of hits) { const o = h.object; if (!o.isMesh || o.isSprite || h.distance < 0.8) continue; const m = o.material; if (!m || Array.isArray(m) || m.transparent || m.visible === false || o.userData.noOcclude) continue; let pa = o, skip = false; const veh = this.vehicle && this.vehicle.m; while (pa) { if (pa === this.player || pa === veh || !pa.visible) { skip = true; break; } pa = pa.parent; } if (skip) continue; lim = h.distance - 0.5; break; } }
      this._occLim = lim; }
    const want = Math.min(dist, this._occLim === undefined ? Infinity : this._occLim); this._occK = lerp(this._occK === undefined ? dist : this._occK, want, want < (this._occK || dist) ? 0.35 : 0.08); return Math.max(1.4, Math.min(dist, this._occK));
  }

  _updateNPCs(dt) {
    const PP = this.player.position, d = this._nv || (this._nv = new THREE.Vector3()), wideN = this.dist > 30 || !!this._intro || !!this._air;
    for (const n of this.npcs) {
      const p = n.p; const fx = p.position.x - PP.x, fz = p.position.z - PP.z; const farN = fx * fx + fz * fz > 130 * 130 || wideN || (this.level || 0) >= 3;
      if (n.wait > 0) { n.wait -= dt; if (!farN) animatePerson(p, this.t, 0); continue; }
      const tgt = n.path[(n.i + 1) % n.path.length];
      d.subVectors(tgt, p.position); d.y = 0;
      const L = d.length();
      if (L < 0.3) { n.i = (n.i + 1) % n.path.length; if (!n.loop && n.i === n.path.length - 1) n.i = 0; n.wait = n.pause ? rand(0, n.pause) : 0; continue; }
      d.normalize(); p.position.addScaledVector(d, n.speed * dt);
      p.position.y = n.y !== undefined ? n.y : this.opts.groundY(p.position.x, p.position.z);
      if (farN) continue;
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
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; this.keys[e.code] = true; if (e.code === 'KeyV') this.toggleView(); if (e.code === 'Escape') this.closePopup(); if (e.code === 'KeyL') this.toggleList(); if (e.code === 'KeyM') this.showMap(); if (e.code === 'KeyF') { e.preventDefault(); this.openSearch(); } if (e.code === 'KeyT' && this.vehicle) this.turbo(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    let dragging = false, lx = 0, ly = 0, moved = 0, downT = 0, pinch0 = 0, dist0 = 0, fov0 = 70;
    const onDown = (x, y) => { dragging = true; lx = x; ly = y; moved = 0; downT = performance.now(); };
    const onMove = (x, y) => {
      if (!dragging) return; const dx = x - lx, dy = y - ly; lx = x; ly = y; moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.005; this.pitch = clamp(this.pitch - dy * 0.005, -1.45, 1.45);
    };
    const onUp = (x, y) => { dragging = false; if (moved < 8 && performance.now() - downT < 400) this._tap(x, y); };
    el.addEventListener('mousedown', e => { onDown(e.clientX, e.clientY); });
    addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    addEventListener('mouseup', e => { if (dragging) onUp(e.clientX, e.clientY); });
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) { dragging = false; pinch0 = dist2(e.touches); fov0 = this.camera.fov; dist0 = this.targetDist; }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length === 2) { const d = dist2(e.touches); const k = pinch0 / d; if (this.targetDist < 0.6) this._zoom(fov0 * k); else { this.targetDist = clamp(dist0 * k, 2.2, this.opts.maxDist); } }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', e => { if (e.changedTouches.length && dragging) onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    el.addEventListener('wheel', e => { e.preventDefault(); this.targetDist = clamp(this.targetDist + e.deltaY * Math.max(0.01, this.targetDist * 0.002), 0.01, this.opts.maxDist); if (this.targetDist < 2.2) this.targetDist = e.deltaY < 0 ? 0.01 : 2.2; if (this.targetDist > 0.6 && this.targetDist < 2.2) this.targetDist = 2.2; }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    this._buildJoystick();
  }
  _zoom(fov) { this.camera.fov = clamp(fov, 30, 100); this.camera.updateProjectionMatrix(); }
  toggleView() {
    const modes = ['follow', 'first', 'top', 'orbit']; const cur = this.targetDist < 0.6 ? 'first' : this.viewMode; const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.viewMode = next === 'first' ? 'follow' : next; this.targetDist = next === 'first' ? 0.01 : Math.max(this.targetDist, 5);
    this.toast({ follow: 'Third person 👀', first: 'First person 🎯', top: 'Bird’s eye 🦅', orbit: 'Cinematic orbit 🎥' }[next]);
  }
  turbo() { if (!this.vehicle) return; this.vehicle.turbo = 1.2; this.toast('🔥 TURBO', 600); }
  _tap(x, y) {
    if (this.paused) return;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.hotspots, true);
    if (hits.length) { const h = hits[0].object.userData.hotspot; if (h) { this._activate(h, hits[0]); return; } }
    const gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.player.position.y);
    const pt = new THREE.Vector3(); if (ray.ray.intersectPlane(gp, pt)) { const P = this.player.position; if (!this.ride && !this.vehicle && Math.hypot(pt.x - P.x, pt.z - P.z) > 110 && Math.hypot(pt.x - P.x, pt.z - P.z) < 1200) { this._marker(pt); this.travel({ id: '_tap', name: 'that spot', icon: '📍', x: pt.x, z: pt.z, keys: '', say: 'Here we are. 📍' }); return; } this.walkTarget = pt; this._marker(pt); }
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
    const grip = pad.querySelector('.wvm-pad-grip'); let gd = false, gx = 0, gy = 0;
    const gs = (x, y) => { gd = true; const r = pad.getBoundingClientRect(); gx = x - r.left; gy = y - r.top; };
    const gm = (x, y) => { if (!gd) return; const nx = clamp(x - gx, 0, innerWidth - pad.offsetWidth), ny = clamp(y - gy, 0, innerHeight - pad.offsetHeight); pad.style.left = nx + 'px'; pad.style.top = ny + 'px'; pad.style.right = 'auto'; pad.style.bottom = 'auto'; };
    const ge = () => { if (gd) { gd = false; const r = pad.getBoundingClientRect(); this._save('wvm_padpos', { x: r.left, y: r.top }); } };
    grip.addEventListener('mousedown', e => { gs(e.clientX, e.clientY); e.preventDefault(); }); addEventListener('mousemove', e => gm(e.clientX, e.clientY)); addEventListener('mouseup', ge);
    grip.addEventListener('touchstart', e => { gs(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    grip.addEventListener('touchmove', e => { gm(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false }); grip.addEventListener('touchend', ge);
    const stick = pad.querySelector('.wvm-stick'), knob = pad.querySelector('.wvm-knob'); let sid = null;
    const sset = (x, y) => { const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (x - cx) / (r.width / 2), dy = (y - cy) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; const Lc = Math.min(1, L); if (Lc < 0.14) this.moveVec.set(0, 0); else { const k = (0.6 + 0.4 * (Lc - 0.14) / 0.86) / Lc; this.moveVec.set(dx * k, -dy * k); } this.running = L > 0.92; this.walkTarget = null; if (this._route) { this._route = null; } };
    const sclr = () => { knob.style.transform = ''; this.moveVec.set(0, 0); this.running = false; sid = null; };
    stick.addEventListener('touchstart', e => { sid = e.changedTouches[0].identifier; sset(e.changedTouches[0].clientX, e.changedTouches[0].clientY); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === sid) sset(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === sid) sclr(); });
    stick.addEventListener('mousedown', e => { sid = 'm'; sset(e.clientX, e.clientY); e.preventDefault(); }); addEventListener('mousemove', e => { if (sid === 'm') sset(e.clientX, e.clientY); }); addEventListener('mouseup', () => { if (sid === 'm') sclr(); });
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
        <a class="wvm-brand" href="/" title="World VR Mall home"><img class="wvm-logo-full" src="/images/world-vr-mall-logo-600.png" alt="World VR Mall"><img class="wvm-logo-mini" src="/images/world-vr-mall-favicon-192.png" alt="World VR Mall"></a>
        <div class="wvm-where">${esc(this.opts.worldName)}</div>
        <div class="wvm-tools">
          <button class="wvm-ico" id="wvm-find" title="Search: find any store or place (F)">🔍</button>
          <button class="wvm-ico" id="wvm-speed" title="Speed">🚶</button>
          <button class="wvm-ico" id="wvm-view" title="Change view (V)">👀</button>
          <button class="wvm-ico" id="wvm-me" title="Your character & selfie">🧑</button>
          <button class="wvm-ico" id="wvm-radio" title="Radio">📻</button>
          <button class="wvm-ico" id="wvm-map" title="Map (M)">🗺️</button>
          <button class="wvm-ico" id="wvm-full" title="Full screen">⛶</button>
          <button class="wvm-ico" id="wvm-list" title="My shopping list (L)">🛍️<span>0</span></button>
          <button class="wvm-ico" id="wvm-bag" title="My bag">🎒<span>0</span></button>
          <button class="wvm-ico" id="wvm-coins" title="Coins · Wall of Fame">🪙<span>0</span></button>
          <button class="wvm-ico" id="wvm-help" title="Controls">❔</button>
        </div>
      </div>
      <div id="wvm-toast"></div>
      <button id="wvm-act"></button>
      <button id="wvm-turbo" title="Turbo (T)">🔥 TURBO</button>
      <div id="wvm-searchpanel" class="wvm-panel"><div class="wvm-panel-head"><b>🔍 Find anything</b><button class="wvm-x">✕</button></div><input type="search" placeholder="zoo, beach, food, movies, art, a store…" autocomplete="off" enterkeyhint="search"><div class="wvm-search-body wvm-list-body"></div></div>
      <div id="wvm-bagpanel" class="wvm-panel"><div class="wvm-panel-head"><b>🎒 My Bag</b><button class="wvm-x">✕</button></div><div class="wvm-bag-body wvm-list-body"></div></div>
      <div id="wvm-listpanel" class="wvm-panel"><div class="wvm-panel-head"><b>🛍️ My Shopping List</b><button class="wvm-x">✕</button></div><div class="wvm-list-body"></div></div>
      <div id="wvm-radiopanel" class="wvm-panel"><div class="wvm-panel-head"><b>📻 Mall Radio</b><button class="wvm-x">✕</button></div><div class="wvm-radio-body"></div></div>
      <div id="wvm-pop" class="wvm-modal"><div class="wvm-card"><h3></h3><div class="wvm-pop-body"></div><div class="wvm-pop-actions"></div></div></div>
      <div id="wvm-selfie" class="wvm-modal"><div class="wvm-card wvm-card-wide">
        <h3>Make it you 🤳</h3>
        <p class="muted" style="margin-top:0">Pick a character, dress it up, then snap a selfie and your real face goes on it. Everything is free.</p>
        <div class="wvm-chars"></div>
        <div class="wvm-tabs"></div>
        <div class="wvm-looks"></div>
        <div class="wvm-cam"><video autoplay playsinline muted></video><canvas width="256" height="320"></canvas><div class="wvm-cam-hint">Face the camera, chin in the oval</div></div>
        <p class="wvm-privacy">🔒 <b>Your photo stays on this device.</b> Nothing is uploaded or sent anywhere; it's saved only in this browser and you can clear it any time. Kids: ask a parent to tap the camera button.</p>
        <div class="wvm-pop-actions">
          <button class="wvm-btn" id="wvm-cam-on">📷 Turn on camera</button>
          <button class="wvm-btn primary" id="wvm-cam-snap" disabled>Snap selfie</button>
          <button class="wvm-btn ghost" id="wvm-cam-clear">Use cartoon face</button>
          <button class="wvm-btn" id="wvm-selfie-done">Let's go!</button>
        </div>
      </div></div>
      <div id="wvm-fade"></div>
      <div id="wvm-loader"><div class="wvm-tele">
        <img src="/images/world-vr-mall-logo-600.png" alt="World VR Mall">
        <div class="wvm-machine">
          <div class="wvm-ring wvm-ring-top"></div>
          <div class="wvm-beam"><div class="wvm-beamcol"></div><div class="wvm-beam-lines"></div>
            <svg class="wvm-silh" viewBox="0 0 100 160" aria-hidden="true"><circle cx="50" cy="26" r="18"/><path d="M22 160V88c0-22 12-40 28-40s28 18 28 40v72z"/></svg></div>
          <div class="wvm-ring wvm-ring-base"><div class="wvm-pad-glow"></div></div>
          <div class="wvm-pillar wvm-pl"></div><div class="wvm-pillar wvm-pr"></div>
        </div>
        <div class="wvm-loadmsg">Scanning…</div><div class="wvm-barwrap"><div class="wvm-bar"></div></div><small>Teleport station · worldvrmall.com</small></div></div>`;
    stage.appendChild(hud);
    this.toastEl = hud.querySelector('#wvm-toast'); this.actBtn = hud.querySelector('#wvm-act'); this.actBtn.onclick = () => { if (this._act) this._act.fn(this); }; this.listPanel = hud.querySelector('#wvm-listpanel'); this.listBtn = hud.querySelector('#wvm-list');
    this.turboBtn = hud.querySelector('#wvm-turbo'); this.turboBtn.onclick = () => this.turbo(); this.turboBtn.addEventListener('touchstart', e => { e.preventDefault(); this.turbo(); }, { passive: false });
    this.radioPanel = hud.querySelector('#wvm-radiopanel'); this.bagPanel = hud.querySelector('#wvm-bagpanel'); this.bagBtn = hud.querySelector('#wvm-bag'); this.coinBtn = hud.querySelector('#wvm-coins'); this.coinBadge = this.coinBtn.querySelector('span');
    this.bagBtn.onclick = () => this.toggleBag(); this.bagPanel.querySelector('.wvm-x').onclick = () => this.toggleBag(false); this.coinBtn.onclick = () => this.wallOfFame();
    this.pop = hud.querySelector('#wvm-pop'); this.fade = hud.querySelector('#wvm-fade'); this.loader = hud.querySelector('#wvm-loader');
    this.bar = hud.querySelector('.wvm-bar'); this.loadMsg = hud.querySelector('.wvm-loadmsg'); this.selfieEl = hud.querySelector('#wvm-selfie');
    hud.querySelector('#wvm-view').onclick = () => this.toggleView();
    this.searchPanel = hud.querySelector('#wvm-searchpanel');
    hud.querySelector('#wvm-find').onclick = () => { if (this.searchPanel.classList.contains('on')) this.closeSearch(); else this.openSearch(); };
    this.searchPanel.querySelector('.wvm-x').onclick = () => this.closeSearch();
    { const inp = this.searchPanel.querySelector('input'); inp.addEventListener('input', () => this._renderSearch(inp.value)); inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const first = this.findPlaces(inp.value, 1)[0]; if (first) this.travel(first); } if (e.key === 'Escape') this.closeSearch(); }); inp.addEventListener('keyup', (e) => e.stopPropagation()); }
    hud.querySelector('#wvm-speed').onclick = () => { this.setSpeed(this.speedIdx + 1); this.toast('Speed: ' + WVM.SPEEDS[this.speedIdx][2], 1400); };
    this.setSpeed(this._load('wvm_speed', 1));
    hud.querySelector('#wvm-list').onclick = () => this.toggleList();
    hud.querySelector('#wvm-radio').onclick = () => this.toggleRadio();
    hud.querySelector('#wvm-map').onclick = () => this.showMap();
    hud.querySelector('#wvm-full').onclick = () => { const d = document; if (d.fullscreenElement) { d.exitFullscreen(); } else { (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => this.toast('Full screen is not available in this browser'))).call(d.documentElement); window.scrollTo(0, 0); } };
    this.listPanel.querySelector('.wvm-x').onclick = () => this.toggleList(false);
    this.radioPanel.querySelector('.wvm-x').onclick = () => this.toggleRadio(false);
    hud.querySelector('#wvm-me').onclick = () => this.openSelfie();
    hud.querySelector('#wvm-help').onclick = () => this.popup('How to move around', `
      <ul class="wvm-help">
        <li><b>Phone:</b> drag to look (full 360°, up and down too), pinch to zoom in and out, use the joystick or D-pad, or just tap where you want to walk.</li>
        <li><b>Laptop:</b> W A S D or arrow keys to walk, hold Shift to run, drag the mouse to look, scroll to zoom. <b>V</b> cycles views: third person, first person, bird's eye, cinematic.</li>
        <li><b>VR headset:</b> tap <b>Enter VR</b>. Left stick walks, right stick turns, trigger dashes forward.</li>
        <li><b>Carts:</b> hop in, then hit <b>🔥 TURBO</b> (or T) for flames.</li>
        <li><b>Tap</b> signs, doors, and people. Green rings are things you can do. Glowing rings are portals. Store doors take you inside.</li>
        <li>The joystick can be dragged anywhere on the screen (grab the ⋮⋮ handle) and switched to a D-pad with ⟲.</li>
      </ul>`);
    this.pop.addEventListener('click', e => { if (e.target === this.pop) this.closePopup(); });
    this._buildSelfie(); this._buildRadio(); this._dragPanel(this.radioPanel); this._dragPanel(this.listPanel); this._dragPanel(this.bagPanel);
  }
  /* ----- coins: spinning collectibles, a counter, and a Wall of Fame ----- */
  addCoin(x, y, z, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.2 })); c.rotation.x = Math.PI / 2; g.add(c);
    const star = makeSprite('★', { scale: 0.9, bg: 'rgba(0,0,0,0)', fg: '#fff', accent: '#ffd23f' }); star.position.z = 0.07; g.add(star);
        this.scene.add(g); const coin = { g, x, z, y, level: opts.level, taken: false }; (this.coinsList = this.coinsList || []).push(coin);
    if (!this._coinUpd) { this._coinUpd = true; this.onUpdate((dt, t) => { const p = this.player.position; for (const k of this.coinsList) { if (k.taken) continue; k.g.rotation.y += dt * 3; k.g.position.y = k.y + Math.sin(t * 3 + k.x) * 0.15; if (k.level !== undefined && k.level !== (this.level || 0)) continue; const dx = p.x - k.x, dz = p.z - k.z; if (dx * dx + dz * dz < 2.2 && Math.abs(p.y - k.y) < 3) { k.taken = true; this.scene.remove(k.g); this.coins = (this.coins || 0) + 1; this._save('wvm_coins', this.coins); this.coinBadge.textContent = this.coins; this.coinBtn.classList.add('bump'); setTimeout(() => this.coinBtn.classList.remove('bump'), 400); this.buzz(20); this.toast(`🪙 ${this.coins} coin${this.coins === 1 ? '' : 's'}` + (this.coins % 10 === 0 ? ' · check the Wall of Fame!' : ''), 1200); } } }); }
    return g;
  }
  wallOfFame() {
    const best = this._load('wvm_fame', []); const mine = this.coins || 0; const id = 'wf' + Math.floor(Math.random() * 1e6);
    const rows = best.slice(0, 10).map((r, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.1)"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} <b>${esc(r.n)}</b></span><b style="color:#ffd23f">${r.c} 🪙</b></div>`).join('') || '<p class="muted">Nobody yet. Be first.</p>';
    this.popup('🏆 Wall of Fame', `<p>You have <b style="color:#ffd23f">${mine}</b> coins. Coins hide all over the world and the mall; the rain cloud drops extra ones.</p>${rows}<div style="display:flex;gap:8px;margin-top:12px"><input id="${id}" maxlength="12" placeholder="Your name" style="flex:1;padding:10px;border-radius:10px;border:1px solid #ffd23f;background:#050b1c;color:#fff;font:inherit"></div>`, [{ label: '📝 Post my score', keep: true, fn: () => { const n = (document.getElementById(id).value || '').trim(); if (!n) { this.toast('Type a name first'); return; } const list = this._load('wvm_fame', []).filter(r => r.n !== n); list.push({ n, c: mine }); list.sort((a, b) => b.c - a.c); this._save('wvm_fame', list.slice(0, 10)); this.wallOfFame(); } }]);
  }
  /* ----- bag: pick things up, carry them, drop them in a cart ----- */
  addPickup(x, y, z, item) {
    const s = makeSprite(item.icon + ' ' + item.name, { scale: 2.4, bg: 'rgba(255,255,255,0.95)', fg: '#111', accent: '#7cff6b' }); s.position.set(x, y, z); this.scene.add(s);
    const it = { x, z, r: 2.2, label: '🖐️ Pick up ' + item.name, fn: (a) => { a.bag.push(item); a._save('wvm_bag', a.bag); a._renderBag(); a.scene.remove(s); a.interactables = a.interactables.filter(i => i !== it); a.toast(item.icon + ' ' + item.name + ' is in your bag 🎒', 2000); a.buzz(20); } }; (this.interactables = this.interactables || []).push(it);
    this.onUpdate((dt, t) => { s.position.y = y + Math.sin(t * 2 + x) * 0.15; }); return s;
  }
  _renderBag() { const b = this.bagPanel.querySelector('.wvm-bag-body'); this.bagBtn.querySelector('span').textContent = this.bag.length; if (!this.bag.length) { b.innerHTML = '<p class="muted">Empty. Things you pick up around the world go here. Drop them in a cart, or eat the snacks.</p>'; return; } b.innerHTML = ''; this.bag.forEach((it, i) => { const row = document.createElement('div'); row.className = 'wvm-list-row'; row.innerHTML = `<div><b>${esc(it.icon + ' ' + it.name)}</b><small>${esc(it.from || '')}</small></div>`; const use = document.createElement('button'); use.className = 'wvm-btn small'; use.textContent = it.eat ? '😋 Eat' : '📦 Drop'; use.onclick = () => { this.bag.splice(i, 1); this._save('wvm_bag', this.bag); this._renderBag(); this.toast(it.eat ? 'Mmm. ' + it.icon : 'Dropped ' + it.name); }; row.append(use); b.appendChild(row); }); }
  toggleBag(force) { const on = force ?? !this.bagPanel.classList.contains('on'); this.bagPanel.classList.toggle('on', on); if (on) { this.listPanel.classList.remove('on'); this.radioPanel.classList.remove('on'); } }
  /* ----- pet: a companion that follows you ----- */
  setPet(kind) {
    if (this.pet) { this.scene.remove(this.pet); this.pet = null; }
    const av = this._load('wvm_avatar', {}) || {}; av.pet = kind; this._save('wvm_avatar', av);
    if (!kind || kind === 'none') return;
    const g = makePet(kind); g.position.copy(this.player.position); this.scene.add(g); this.pet = g;
    if (!this._petUpd) { this._petUpd = true; this.onUpdate((dt, t) => { const p = this.pet; if (!p) return; const tgt = this.player.position.clone().add(new THREE.Vector3(-Math.sin(this.avatar.rotation.y + 2.4) * 1.6, 0, -Math.cos(this.avatar.rotation.y + 2.4) * 1.6)); const d = tgt.clone().sub(p.position); d.y = 0; const L = d.length(); if (L > 0.3) { p.position.addScaledVector(d.normalize(), Math.min(L, dt * (L > 6 ? 12 : 4))); p.rotation.y = lerpAngle(p.rotation.y, Math.atan2(d.x, d.z), 0.2); p.userData.moving = true; } else p.userData.moving = false; p.position.y = this.player.position.y; animatePet(p, t, p.userData.moving ? 1 : 0); }); }
  }
  /* Map: the page calls setMap(drawFn, {scale, cx, cz}) once. drawFn(ctx, toXY) paints the world; the engine adds you. */
  setMap(drawFn, opts = {}) { this.mapDraw = drawFn; this.mapOpts = Object.assign({ scale: 0.5, cx: 0, cz: 0, size: 720 }, opts); }
  /* v15 world map: full screen, pinch/scroll to zoom, drag to pan, a tilted 3D snapshot of the real world (buildings stand up, nothing is flat),
     labels that never stack (they thin out when zoomed out and fill in as you zoom), and a tappable list of every attraction beside it. */
  _mapSnap(o, half, tilt, rect, W, H) {
    try { const R = rect || { l: -half, r: half, t: half, b: -half }; const cam = new THREE.OrthographicCamera(R.l, R.r, R.t, R.b, 0.5, 9000); if (tilt) { const D = 3000; cam.position.set(o.cx, D * Math.cos(tilt), o.cz + D * Math.sin(tilt)); cam.up.set(0, 1, 0); } else { cam.position.set(o.cx, o.camY || 900, o.cz); cam.up.set(0, 0, -1); cam.far = (o.camY || 900) + 80; } cam.lookAt(o.cx, 0, o.cz); cam.updateProjectionMatrix();
      const rt = new THREE.WebGLRenderTarget(W, H); const fog = this.scene.fog, bgd = this.scene.background; this.scene.fog = null; this.scene.background = new THREE.Color(o.bg || 0x0f2a4a); const hidden = []; this.scene.traverse(ob => { if ((ob.userData.mapHide || ob.isSprite) && ob.visible) { ob.visible = false; hidden.push(ob); } });
      this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, cam); this.renderer.setRenderTarget(null); const px = new Uint8Array(W * H * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose(); this.scene.fog = fog; this.scene.background = bgd; hidden.forEach(h => h.visible = true);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g2 = c.getContext('2d'); const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.min(255, Math.pow(v / 255, 1 / 2.2) * 255 * 1.12 + 14); const img = g2.createImageData(W, H), D = img.data; for (let y = 0; y < H; y++) { const src = (H - 1 - y) * W * 4, dst = y * W * 4; for (let q = 0; q < W * 4; q += 4) { D[dst + q] = lut[px[src + q]]; D[dst + q + 1] = lut[px[src + q + 1]]; D[dst + q + 2] = lut[px[src + q + 2]]; D[dst + q + 3] = 255; } } g2.putImageData(img, 0, 0); return c;
    } catch (err) { console.warn('map snapshot failed', err); return null; }
  }
  showMap() {
    if (!this.mapDraw) { this.toast('No map for this area yet'); return; }
    const o = this.mapOpts, mob = isMobile(); const RES = mob ? 1536 : 2048; const half = o.half || (o.size / (2 * o.scale)); const tilt = o.tilt || 0, cosT = Math.cos(tilt); const k = RES / (2 * half);
    const base = document.createElement('canvas'); base.width = base.height = RES; const bg = base.getContext('2d'); bg.fillStyle = '#071233'; bg.fillRect(0, 0, RES, RES);
    const toBase = (x, z) => [RES / 2 + (x - o.cx) * k, RES / 2 + (z - o.cz) * k * cosT]; const fromBase = (px, py) => [(px - RES / 2) / k + o.cx, (py - RES / 2) / (k * cosT) + o.cz];
    let real = false; const ck = 'L' + (this.level || 0), mc = this._mapCache || (this._mapCache = {}); if (mc[ck] && this.t - mc[ck].t < 120 && mc[ck].c.width === RES) { bg.drawImage(mc[ck].c, 0, 0); real = true; } this._uncullAll();
    if (!real) { const c0 = this._mapSnap(o, half, tilt, null, RES, RES); if (c0) { bg.drawImage(c0, 0, 0); real = true; mc[ck] = { c: c0, t: this.t }; } }
    if (!real) { bg.save(); this.mapDraw(bg, (x, z) => toBase(x, z)); bg.restore(); }
    const tiles = this.places.filter(pl => pl.tile && pl.x !== undefined && (pl.level || 0) === (this.level || 0));
    const wrap = document.createElement('div'); wrap.id = 'wvm-bigmap'; wrap.innerHTML = '<div class="wvm-bm-head"><b>🗺️ ' + esc(o.title || 'Map') + '</b><span class="muted">pinch or scroll to zoom · drag to move · tap a pin</span><div><button class="wvm-btn small" data-z="1">＋</button><button class="wvm-btn small" data-z="-1">－</button><button class="wvm-btn small" data-z="0">⤢ Fit</button><button class="wvm-btn small" data-me="1">📍 Me</button><button class="wvm-btn small wvm-bm-toggle" data-list="1">📋 Places</button><button class="wvm-x">✕</button></div></div><div class="wvm-bm-chips"></div><div class="wvm-bm-body"><canvas></canvas><div class="wvm-bm-list"></div><div class="wvm-bm-go"></div></div>'; this.hud.appendChild(wrap); this.paused = true; document.body.classList.add('wvm-modal-open');
    const cv = wrap.querySelector('canvas'), g = cv.getContext('2d'), list = wrap.querySelector('.wvm-bm-list'); let vw = 0, vh = 0, zoom = 1, ox = 0, oy = 0, fit = 1; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const close = () => { clearInterval(pulse); clearTimeout(hiT); wrap.remove(); this.paused = false; document.body.classList.remove('wvm-modal-open'); removeEventListener('resize', size); }; wrap.querySelector('.wvm-x').onclick = close;
    const lv = this.level || 0; const here = this.places.filter(p => p.x !== undefined && !p.url && p.pin !== false && (p.level || 0) === lv); const sorted = here.slice().sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || (a.rank || 0) - (b.rank || 0));
    const clampView = () => { const s = fit * zoom, W = RES * s; ox = W <= vw ? (vw - W) / 2 : Math.min(0, Math.max(vw - W, ox)); oy = W <= vh ? (vh - W) / 2 : Math.min(0, Math.max(vh - W, oy)); };
    let boxes = [], hi = null, hiT = 0, picked = null, pulse = 0;
    const sharpen = () => { clearTimeout(hiT); hiT = setTimeout(() => { if (!document.body.contains(wrap) || zoom < 2.2) { if (hi && zoom < 2.2) { hi = null; draw(); } return; } const s = fit * zoom; const x0 = clamp(-ox / s, 0, RES), y0 = clamp(-oy / s, 0, RES), x1 = clamp((vw - ox) / s, 0, RES), y1 = clamp((vh - oy) / s, 0, RES); if (x1 - x0 < 4 || y1 - y0 < 4) return; const W = Math.min(mob ? 1024 : 1792, Math.round(vw * dpr)), H = Math.max(64, Math.round(W * (y1 - y0) / (x1 - x0))); const c = this._mapSnap(o, half, tilt, { l: (x0 - RES / 2) / k, r: (x1 - RES / 2) / k, t: -(y0 - RES / 2) / k, b: -(y1 - RES / 2) / k }, W, Math.min(2048, H)); if (c) { hi = { c, x0, y0, x1, y1 }; draw(); } }, 320); };
    const holoT = setInterval(() => { if (!document.body.contains(wrap)) { clearInterval(holoT); return; } if (!picked) draw(); }, 70);
    const goBar = wrap.querySelector('.wvm-bm-go'); const pick1 = (pl) => { picked = pl; goBar.innerHTML = '<span style="font-size:20px">' + (pl.icon || '📍') + '</span><b>' + esc(pl.name.split(' · ')[0]) + '</b><button class="wvm-btn primary small">Go ➜</button><button class="wvm-btn small" data-c="1">✕</button>'; goBar.classList.add('on'); goBar.querySelector('.primary').onclick = () => { close(); const dest = (pl.fn && pl.x !== undefined && !pl.tile) ? Object.assign({}, pl, { fn: undefined }) : pl; setTimeout(() => this.travel(dest), 60); }; goBar.querySelector('[data-c]').onclick = () => { picked = null; goBar.classList.remove('on'); clearInterval(pulse); draw(); }; clearInterval(pulse); pulse = setInterval(() => { if (!document.body.contains(wrap)) { clearInterval(pulse); return; } draw(); }, 60); };
    const draw = () => { const s = fit * zoom; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#050b1c'; g.fillRect(0, 0, vw, vh); g.imageSmoothingEnabled = true; g.drawImage(base, ox, oy, RES * s, RES * s); { const tt = performance.now() / 1000; g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(56,240,255,0.10)'; g.lineWidth = 1; const stp = Math.max(24, 100 * k * s); const gx0 = ((ox % stp) + stp) % stp, gy0 = ((oy % stp) + stp) % stp; g.beginPath(); for (let X = gx0; X < vw; X += stp) { g.moveTo(X, 0); g.lineTo(X, vh); } for (let Y = gy0; Y < vh; Y += stp) { g.moveTo(0, Y); g.lineTo(vw, Y); } g.stroke(); const sy = (tt * 90) % (vh + 160) - 80; const sg = g.createLinearGradient(0, sy - 60, 0, sy + 60); sg.addColorStop(0, 'rgba(56,240,255,0)'); sg.addColorStop(0.5, 'rgba(56,240,255,0.16)'); sg.addColorStop(1, 'rgba(56,240,255,0)'); g.fillStyle = sg; g.fillRect(0, sy - 60, vw, 120); for (const pl of here) { if (!pl.top) continue; const [hx, hy] = toBase(pl.x, pl.z); const X = ox + hx * s, Y = oy + hy * s; if (X < -40 || Y < -40 || X > vw + 40 || Y > vh + 40) continue; const q = (((tt * 0.6 + (pl.x * 0.013 + pl.z * 0.007)) % 1) + 1) % 1; g.strokeStyle = 'rgba(124,248,255,' + (0.55 * (1 - q)) + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(X, Y, 10 + q * 26, (10 + q * 26) * 0.45, 0, 0, 6.2832); g.stroke(); const bg2 = g.createLinearGradient(0, Y - 46, 0, Y); bg2.addColorStop(0, 'rgba(124,248,255,0)'); bg2.addColorStop(1, 'rgba(124,248,255,0.28)'); g.fillStyle = bg2; g.beginPath(); g.moveTo(X - 9, Y); g.lineTo(X + 9, Y); g.lineTo(X + 3, Y - 46); g.lineTo(X - 3, Y - 46); g.closePath(); g.fill(); } g.restore(); } if (hi) g.drawImage(hi.c, ox + hi.x0 * s, oy + hi.y0 * s, (hi.x1 - hi.x0) * s, (hi.y1 - hi.y0) * s); boxes = []; g.textBaseline = 'middle';
      for (const pl of tiles) { const [tx, ty] = toBase(pl.x, pl.z); const w = pl.tile[0] * k * s, h = pl.tile[1] * k * cosT * s, X = ox + tx * s, Y = oy + ty * s; if (X + w / 2 < 0 || Y + h / 2 < 0 || X - w / 2 > vw || Y - h / 2 > vh) continue; g.fillStyle = pl.tile[2] || 'rgba(56,240,255,0.25)'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.roundRect(X - w / 2, Y - h / 2, w, h, Math.min(14, w / 6)); g.fill(); g.stroke(); if (w > 70) { g.font = 'bold ' + Math.max(11, Math.min(20, w / 11)) + 'px Poppins, Segoe UI, Arial'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillText((pl.icon || '') + ' ' + pl.name.split(' · ')[0], X, Y + h / 2 - 14); } }
      if (picked && picked.x !== undefined) { const [bx, by] = toBase(picked.x, picked.z); const X = ox + bx * s, Y = oy + by * s, q = (performance.now() / 900) % 1; g.beginPath(); g.arc(X, Y, 16 + q * 14, 0, 6.28); g.strokeStyle = 'rgba(124,255,107,' + (1 - q) + ')'; g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(X, Y, 15, 0, 6.28); g.strokeStyle = '#7cff6b'; g.lineWidth = 3; g.stroke(); }
      const P = this.player.position, [mx, my] = toBase(P.x, P.z); const ux = ox + mx * s, uy = oy + my * s; 
      for (const pl of sorted) { const [bx, by] = toBase(pl.x, pl.z); const x = ox + bx * s, y = oy + by * s; if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) continue; const label = (pl.name.split(' · ')[0]); g.font = 'bold ' + (pl.top ? 13 : 12) + 'px Poppins, Segoe UI, Arial'; const tw = g.measureText(label).width; const bw = tw + 38, bh = 26; const rect = [x - 14, y - bh / 2, bw, bh];
        const hit = boxes.some(b => rect[0] < b[0] + b[2] + 4 && rect[0] + rect[2] + 4 > b[0] && rect[1] < b[1] + b[3] + 3 && rect[1] + rect[3] + 3 > b[1]);
        if (hit) { if (boxes.some(b => Math.abs(b[6] - x) < 9 && Math.abs(b[7] - y) < 9)) continue; g.beginPath(); g.arc(x, y, 5, 0, 6.28); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ff4f79'; g.stroke(); boxes.push([x - 8, y - 8, 16, 16, pl, true, x, y]); continue; }
        g.fillStyle = pl.top ? 'rgba(255,255,255,0.96)' : 'rgba(8,20,50,0.88)'; g.strokeStyle = pl.top ? '#ff4f79' : 'rgba(124,248,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.roundRect(rect[0], rect[1], bw, bh, 13); g.fill(); g.stroke(); g.textAlign = 'center'; g.font = '15px Segoe UI Emoji, Apple Color Emoji, Arial'; g.fillStyle = '#000'; g.fillText(pl.icon || '📍', x, y + 1); g.textAlign = 'left'; g.font = 'bold ' + (pl.top ? 13 : 12) + 'px Poppins, Segoe UI, Arial'; g.fillStyle = pl.top ? '#0b1a3a' : '#fff'; g.fillText(label, x + 14, y + 1); boxes.push([rect[0], rect[1], bw, bh, pl, false, x, y]); }
      g.beginPath(); g.arc(ux, uy, 9, 0, 6.28); g.fillStyle = '#2f6bff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); const d = -this.yaw; g.beginPath(); g.moveTo(ux, uy); g.lineTo(ux + Math.sin(d) * 24, uy - Math.cos(d) * 24 * cosT); g.strokeStyle = '#2f6bff'; g.lineWidth = 4; g.stroke(); g.font = 'bold 12px Poppins, Arial'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('YOU', ux + 12, uy - 12); };
    const size = () => { const r = cv.parentElement.getBoundingClientRect(); const lw = list.getBoundingClientRect(); const side = r.width > 760; vw = Math.max(200, side ? r.width - lw.width : r.width); vh = Math.max(200, r.height); cv.style.width = vw + 'px'; cv.style.height = vh + 'px'; cv.width = vw * dpr; cv.height = vh * dpr; fit = (side ? Math.min(vw, vh) : Math.max(vw, vh)) / RES; clampView(); draw(); };
    const zoomAt = (f, cx, cy) => { sharpen(); const s0 = fit * zoom; zoom = clamp(zoom * f, 1, 18); const s1 = fit * zoom; ox = cx - (cx - ox) * s1 / s0; oy = cy - (cy - oy) * s1 / s0; clampView(); draw(); };
    const focus = (x, z, zm) => { sharpen(); zoom = Math.max(zoom, zm); const s = fit * zoom, [bx, by] = toBase(x, z); ox = vw / 2 - bx * s; oy = vh / 2 - by * s; clampView(); draw(); };
    wrap.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const z = +b.dataset.z; if (!z) { zoom = 1; clampView(); draw(); } else zoomAt(z > 0 ? 1.6 : 1 / 1.6, vw / 2, vh / 2); }); wrap.querySelector('[data-me]').onclick = () => focus(this.player.position.x, this.player.position.z, 3); wrap.querySelector('[data-list]').onclick = () => { wrap.classList.toggle('list-open'); size(); };
    cv.addEventListener('dblclick', e => { const r = cv.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
    const chips = wrap.querySelector('.wvm-bm-chips'); const chipList = this.places.filter(p => p.top && !(p.id && p.id[0] === '_')).sort((a, b) => (a.url ? 1 : 0) - (b.url ? 1 : 0)); for (const p of chipList) { const b = document.createElement('button'); b.textContent = (p.icon || '📍') + ' ' + p.name.split(' · ')[0]; b.onclick = () => { chips.querySelectorAll('.on').forEach(q => q.classList.remove('on')); b.classList.add('on'); if (p.x !== undefined && !p.url && (p.level || 0) === lv) { focus(p.x, p.z, p.tile ? 3 : 5); pick1(p); } else { close(); setTimeout(() => this.travel(p), 60); } }; chips.appendChild(b); }
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    const ptrs = new Map(); let moved = 0, pd = 0; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (ptrs.size === 2) { const v = [...ptrs.values()]; pd = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
    cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId); const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) { ox += dx; oy += dy; moved += Math.abs(dx) + Math.abs(dy); clampView(); draw(); sharpen(); } else if (ptrs.size === 2) { const v = [...ptrs.values()]; const nd = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); const r = cv.getBoundingClientRect(); if (pd > 0) zoomAt(nd / pd, (v[0][0] + v[1][0]) / 2 - r.left, (v[0][1] + v[1][1]) / 2 - r.top); pd = nd; moved += 10; } });
    const up = (e) => { const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (!had || ptrs.size || moved > 8) return; const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; let best = null; for (const b of boxes) if (x >= b[0] - 4 && x <= b[0] + b[2] + 4 && y >= b[1] - 4 && y <= b[1] + b[3] + 4) { best = b; if (!b[5]) break; }
      if (best && best[5] && zoom < 16) { zoomAt(2, x, y); return; } const s = fit * zoom; if (best && best[4] && best[4].id !== '_spot') { pick1(best[4]); draw(); return; } const pl = best ? best[4] : (() => { const [wx, wz] = fromBase((x - ox) / s, (y - oy) / s); return { id: '_spot', name: 'that spot on the map', icon: '📍', x: wx, z: wz, keys: '', say: 'Here we are. 📍' }; })(); close(); setTimeout(() => this.travel(pl), 60); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
    // the list: every attraction, grouped, always tappable no matter how crowded the picture is
    const groups = {}; for (const p of this.places) { if (p.id && p.id[0] === '_') continue; const c = p.cat || 'Places'; (groups[c] = groups[c] || []).push(p); } const order = Object.keys(groups).sort((a, b) => (/Store|Space/.test(a) ? 1 : 0) - (/Store|Space/.test(b) ? 1 : 0) || a.localeCompare(b));
    for (const c of order) { const items = groups[c].slice().sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name)); if (/Space available/.test(c)) continue; const h = document.createElement('div'); h.className = 'wvm-bm-cat'; h.textContent = c + ' (' + items.length + ')'; list.appendChild(h); for (const p of items) { const b = document.createElement('button'); b.className = 'wvm-place'; b.innerHTML = '<span>' + (p.icon || '📍') + '</span><b>' + esc(p.name) + '</b><small>' + (p.url ? 'other area · transports you' : p.fn && !p.tile ? 'tap to go' : 'tap to find on the map') + '</small>'; b.onclick = () => { if (p.url || p.x === undefined || (p.fn && !p.tile) || (p.level || 0) !== lv || wrap.classList.contains('list-open')) { close(); setTimeout(() => this.travel(p), 60); return; } focus(p.x, p.z, 4); b.ondblclick = null; if (b.dataset.armed) { close(); setTimeout(() => this.travel(p), 60); } else { list.querySelectorAll('[data-armed]').forEach(q => { delete q.dataset.armed; q.querySelector('small').textContent = 'tap to find on the map'; }); b.dataset.armed = '1'; b.querySelector('small').textContent = '✅ shown on map · tap again to GO'; } }; list.appendChild(b); } }
    addEventListener('resize', size); requestAnimationFrame(() => { size(); if (o.start) focus(o.start[0], o.start[1], o.start[2] || 1); });
  }
  _dragPanel(panel) {
    const head = panel.querySelector('.wvm-panel-head'); let dr = false, ox = 0, oy = 0; head.style.cursor = 'grab'; head.title = 'Drag me anywhere';
    const st = (x, y) => { dr = true; const r = panel.getBoundingClientRect(); ox = x - r.left; oy = y - r.top; };
    const mv = (x, y) => { if (!dr) return; panel.style.left = clamp(x - ox, 0, innerWidth - 80) + 'px'; panel.style.top = clamp(y - oy, 0, innerHeight - 60) + 'px'; panel.style.right = 'auto'; };
    head.addEventListener('mousedown', ev => { if (ev.target.tagName === 'BUTTON') return; st(ev.clientX, ev.clientY); ev.preventDefault(); }); addEventListener('mousemove', ev => mv(ev.clientX, ev.clientY)); addEventListener('mouseup', () => dr = false);
    head.addEventListener('touchstart', ev => { if (ev.target.tagName === 'BUTTON') return; st(ev.touches[0].clientX, ev.touches[0].clientY); }, { passive: true }); head.addEventListener('touchmove', ev => { mv(ev.touches[0].clientX, ev.touches[0].clientY); ev.preventDefault(); }, { passive: false }); head.addEventListener('touchend', () => dr = false);
  }
  toggleList(force) { const on = force ?? !this.listPanel.classList.contains('on'); this.listPanel.classList.toggle('on', on); if (on) this.radioPanel.classList.remove('on'); }
  toggleRadio(force) { const on = force ?? !this.radioPanel.classList.contains('on'); this.radioPanel.classList.toggle('on', on); if (on) this.listPanel.classList.remove('on'); }
  /* Radio: YouTube playlists in a small drawer. Music keeps playing while you walk. */
  _buildRadio() {
    const body = this.radioPanel.querySelector('.wvm-radio-body');
    const stations = this.opts.stations || [['🤠 Country', 's2LRDjYedSA'], ['🎸 Rock', 'jSoGmtRW8RM'], ['🎻 Classical', 'oExWo1rIZsQ'], ['🎧 Uplifting beats', '7rOcIQnEzwA'], ['🌌 Deep space · relaxing', 'ztVV54sPOns'], ['🎤 Linkin Park', 'kXYiU_JCYtU']];
    const row = document.createElement('div'); row.className = 'wvm-stations';
    const frame = document.createElement('div'); frame.className = 'wvm-radio-frame';
    for (const [name, id] of stations) { const b = document.createElement('button'); b.className = 'wvm-btn small'; b.textContent = name; const play = (start = 0) => { row.querySelectorAll('.wvm-btn').forEach(x => x.classList.remove('primary')); b.classList.add('primary'); frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0&start=${Math.max(0, Math.floor(start))}" title="${esc(name)}" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:0"></iframe>`; try { sessionStorage.setItem('wvm_radio', JSON.stringify({ id, name, t0: Date.now() - Math.max(0, start) * 1000 })); } catch (err) { } }; b.onclick = () => play(0); b._play = play; b.dataset.sid = id; row.appendChild(b); }
    try { const sv = JSON.parse(sessionStorage.getItem('wvm_radio') || 'null'); if (sv && Date.now() - sv.t0 < 5 * 3600e3) { const btn = [...row.querySelectorAll('.wvm-btn')].find(q => q.dataset.sid === sv.id); if (btn) setTimeout(() => { btn._play((Date.now() - sv.t0) / 1000); this.toast('🎵 ' + sv.name + ' · picking up right where it left off. (Quiet? Tap 📻 once.)', 4200); }, 1200); } } catch (err) { }
    const off = document.createElement('button'); off.className = 'wvm-btn small ghost'; off.textContent = '⏹ Off'; off.onclick = () => { try { sessionStorage.removeItem('wvm_radio'); } catch (err) { } frame.innerHTML = ''; row.querySelectorAll('.wvm-btn').forEach(x => x.classList.remove('primary')); }; row.appendChild(off);
    body.append(row, frame); const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Pick a station. It keeps playing while you shop. Close this panel with ✕ and the music stays on.'; body.appendChild(hint);
  }

  /* ----- selfie / character ----- */
  _buildSelfie() {
    const el = this.selfieEl, chars = el.querySelector('.wvm-chars'), tabs = el.querySelector('.wvm-tabs'), looks = el.querySelector('.wvm-looks');
    const get = () => this._load('wvm_avatar', {}) || {}; const set = (patch) => { const a = Object.assign(get(), patch); this._save('wvm_avatar', a); this._buildAvatar(); return a; };
    // character cards
    const renderChars = () => { chars.innerHTML = ''; const cur = get().character || 'hero'; for (const c of CHARACTERS) { const b = document.createElement('button'); b.className = 'wvm-char' + (c.id === cur ? ' on' : ''); b.innerHTML = `<span class="ic">${c.icon}</span><b>${c.name}</b><small>${c.desc}</small>`; b.onclick = () => { set({ character: c.id }); renderChars(); renderLooks(); }; chars.appendChild(b); } };
    const groups = {
      Colors: [['shirt', 'Outfit', [['Sky', 0x38f0ff], ['Coral', 0xff4f79], ['Sun', 0xffd23f], ['Mint', 0x7cff6b], ['Violet', 0xb08cff], ['Orange', 0xff8a3d], ['White', 0xffffff], ['Navy', 0x1e2a4a], ['Black', 0x111111]]], ['pants', 'Pants', [['navy', 0x1e2a4a], ['black', 0x2b2b2b], ['purple', 0x4a3b8c], ['denim', 0x3a6ea5], ['khaki', 0x6b4f2a], ['wine', 0x8a1c3a], ['olive', 0x556b2f]]]],
      Skin: [['skin', 'Skin', [['light', 0xffdbac], ['fair', 0xf1c9a5], ['tan', 0xe0ac7e], ['olive', 0xc68642], ['brown', 0x8d5524], ['deep', 0x5c3a1e]]]],
      Hair: [['hair', 'Hair color', HAIR_COLORS], ['hairStyle', 'Hair style', [['short', 'short'], ['long', 'long'], ['ponytail', 'ponytail'], ['curly', 'curly'], ['bun', 'bun'], ['mohawk', 'mohawk'], ['spiky', 'spiky'], ['bald', 'bald']]]],
      Extras: [['toggles', '', [['🕶️ Sunglasses', 'sunglasses'], ['🎧 Headphones', 'headphones'], ['🧢 Hat', 'hat'], ['👗 Dress', 'dress'], ['🦸 Cape', 'cape'], ['🦋 Wings', 'wings'], ['👑 Crown', 'crown'], ['🎒 Backpack', 'backpack'], ['🛹 Skateboard', 'skateboard']]]],
      Pet: [['pet', 'Companion', [['none', 'none'], ['🐶 Dog', 'dog'], ['🐱 Cat', 'cat'], ['🐉 Dragon', 'dragon'], ['🦆 Duck', 'duck'], ['🤖 Robo-pup', 'robopup'], ['🦄 Mini unicorn', 'unicorn']]]],
    };
    let tab = 'Colors';
    const renderTabs = () => { tabs.innerHTML = ''; for (const k of Object.keys(groups)) { const b = document.createElement('button'); b.className = 'wvm-tab' + (k === tab ? ' on' : ''); b.textContent = k; b.onclick = () => { tab = k; renderTabs(); renderLooks(); }; tabs.appendChild(b); } };
    const renderLooks = () => {
      looks.innerHTML = ''; const a = get(); const ch = CHARACTERS.find(c => c.id === (a.character || 'hero')) || CHARACTERS[0];
      const cannot = { Hair: ch.kind !== 'classic' && ch.kind !== 'glb' && ch.kind !== 'cart', Skin: !['classic', 'glb'].includes(ch.kind) };
      if (cannot[tab]) { looks.innerHTML = `<p class="muted">${ch.name} doesn't use ${tab.toLowerCase()} options. Colors and Extras still apply.</p>`; return; }
      for (const [key, label, entries] of groups[tab]) {
        const wrap = document.createElement('div'); wrap.className = 'wvm-lookrow'; if (label) { const lb = document.createElement('span'); lb.className = 'wvm-looklabel'; lb.textContent = label; wrap.appendChild(lb); }
        for (const [name, val] of entries) {
          const b = document.createElement('button'); b.title = name;
          if (key === 'toggles') { b.className = 'wvm-look txt' + (a[val] ? ' on' : ''); b.textContent = name; b.onclick = () => { set({ [val]: !a[val] }); renderLooks(); }; }
          else if (typeof val === 'number') { b.className = 'wvm-look' + (a[key] === val ? ' on' : ''); b.style.background = '#' + val.toString(16).padStart(6, '0'); b.onclick = () => { set({ [key]: val }); renderLooks(); }; }
          else if (val === 'rainbow') { b.className = 'wvm-look rainbow' + (a[key] === val ? ' on' : ''); b.onclick = () => { set({ [key]: val }); renderLooks(); }; }
          else if (key === 'pet') { b.className = 'wvm-look txt' + ((a.pet || 'none') === val ? ' on' : ''); b.textContent = name; b.onclick = () => { this.setPet(val); renderLooks(); }; }
          else { b.className = 'wvm-look txt' + (a[key] === val ? ' on' : ''); b.textContent = name; b.onclick = () => { set({ [key]: val }); renderLooks(); }; }
          wrap.appendChild(b);
        }
        looks.appendChild(wrap);
      }
    };
    renderChars(); renderTabs(); renderLooks();
    // camera + face crop
    const video = el.querySelector('video'), cv = el.querySelector('canvas');
    let stream = null;
    el.querySelector('#wvm-cam-on').onclick = async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 } }); video.srcObject = stream; el.querySelector('#wvm-cam-snap').disabled = false; el.classList.add('cam'); }
      catch (e) { this.toast('Camera not available — cartoon face it is 😄'); }
    };
    el.querySelector('#wvm-cam-snap').onclick = () => {
      const W = 256, H = 320; const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
      const vw = video.videoWidth || 480, vh = video.videoHeight || 640;
      // take the middle of the frame, zoomed in on the face: 44% of the frame width, centered slightly above middle
      const sw = vw * 0.44, sh = sw * H / W; const sx = (vw - sw) / 2, sy = vh * 0.5 - sh * 0.52;
      g.save(); facePath(g, W, H); g.clip();
      g.translate(W, 0); g.scale(-1, 1); // mirror like a mirror
      g.drawImage(video, sx, sy, sw, sh, 0, 0, W, H); g.restore();
      // soft edge so the face blends into the skin of the head
      g.save(); g.globalCompositeOperation = 'destination-in'; const gr = g.createRadialGradient(W / 2, H * 0.5, H * 0.32, W / 2, H * 0.5, H * 0.5); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.85, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      try { localStorage.setItem('wvm_face', cv.toDataURL('image/png')); } catch (e) { }
      const ok = !!localStorage.getItem('wvm_face'); if (!ok) { try { localStorage.setItem('wvm_face', cv.toDataURL('image/jpeg', 0.85)); } catch (e2) { } } const ok2 = !!localStorage.getItem('wvm_face'); const sv = this._load('wvm_avatar', {}) || {}; const chNow = CHARACTERS.find(c => c.id === (sv.character || 'classic')); if (chNow && !chNow.face) { sv.character = 'classic'; this._save('wvm_avatar', sv); this.toast('Switched to Classic so your face fits 🙂', 2500); } this._buildAvatar(); this.toast(ok2 ? 'Looking good! That\'s you now ✨ (tap Let\'s go)' : '⚠️ Could not save the selfie on this device. Try a normal (non-private) browser window.', 4000); el.classList.add('snapped');
    };
    el.querySelector('#wvm-cam-clear').onclick = () => { localStorage.removeItem('wvm_face'); this._buildAvatar(); this.toast('Cartoon face restored'); };
    el.querySelector('#wvm-selfie-done').onclick = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; el.classList.remove('cam'); } el.classList.remove('on'); this.paused = false; document.body.classList.remove('wvm-modal-open'); localStorage.setItem('wvm_seen', '1'); };
  }
  openSelfie() { this.selfieEl.classList.add('on'); this.paused = true; document.body.classList.add('wvm-modal-open'); }
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
.wvm-brand .wvm-logo-mini{display:none}
@media (max-width:680px){.wvm-top{align-items:flex-start;gap:6px;padding:6px 6px}.wvm-brand .wvm-logo-full{display:none}.wvm-brand .wvm-logo-mini{display:block;height:38px;padding:2px 3px}.wvm-where{display:none}.wvm-tools{flex:1;flex-wrap:wrap;justify-content:flex-end;gap:5px}.wvm-ico{width:36px;height:36px;font-size:16px;border-radius:10px}}
      .wvm-ico{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid rgba(124,248,255,.35);background:rgba(8,20,50,.7);color:#fff;font-size:18px;cursor:pointer;}
      .wvm-ico span{position:absolute;top:-6px;right:-6px;background:#ff4f79;color:#fff;font-size:11px;font-weight:800;border-radius:10px;padding:1px 6px;min-width:12px}
      .wvm-ico.bump{transform:scale(1.2)}
      #wvm-vr{position:absolute!important;left:50%!important;transform:translateX(-50%);bottom:18px!important;background:#38f0ff!important;color:#04122a!important;border:0!important;border-radius:999px!important;font-weight:800!important;padding:10px 22px!important;font-family:inherit!important;opacity:1!important;width:auto!important;font-size:14px!important}
      #wvm-toast{position:absolute;top:64px;left:50%;transform:translateX(-50%) translateY(-10px);background:rgba(8,20,50,.92);border:1px solid #38f0ff;border-radius:999px;padding:8px 16px;font-weight:700;font-size:14px;opacity:0;transition:.25s;max-width:88vw;text-align:center}
      #wvm-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
      .wvm-panel{position:absolute;top:58px;right:10px;width:min(360px,92vw);max-height:70vh;overflow:auto;background:rgba(8,20,50,.95);border:1px solid rgba(124,248,255,.4);border-radius:16px;display:none;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .wvm-panel.on{display:block}
      #wvm-bigmap{position:fixed;inset:0;height:100dvh;z-index:60;background:#050b1c;display:flex;flex-direction:column;pointer-events:auto;color:#fff}
      .wvm-bm-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(8,20,50,.98);border-bottom:1px solid rgba(124,248,255,.35)} .wvm-bm-head .muted{font-size:12px} .wvm-bm-head div{display:flex;gap:6px;align-items:center}
      .wvm-bm-body{flex:1;min-height:0;display:flex;position:relative}
.wvm-bm-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 10px;background:rgba(5,11,28,.98);border-bottom:1px solid rgba(124,248,255,.2);-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.wvm-bm-chips button{flex:none;white-space:nowrap;border-radius:999px;border:1px solid rgba(124,248,255,.45);background:rgba(8,20,50,.9);color:#fff;font:600 12.5px Poppins,Segoe UI,Arial;padding:6px 11px;cursor:pointer}
.wvm-bm-chips button.on{background:#7cff6b;color:#04122a;border-color:#7cff6b}
.wvm-bm-go{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:none;gap:8px;align-items:center;background:rgba(8,20,50,.96);border:1px solid #7cff6b;border-radius:14px;padding:8px 10px;box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:94%;z-index:3}
.wvm-bm-go.on{display:flex}
.wvm-bm-go b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .wvm-bm-body canvas{display:block;cursor:grab;flex:none} .wvm-bm-list{width:300px;overflow:auto;padding:8px;background:rgba(8,20,50,.96);border-left:1px solid rgba(124,248,255,.3)} .wvm-bm-cat{font:800 12px Poppins,Segoe UI,Arial;letter-spacing:.06em;text-transform:uppercase;color:#7cf8ff;margin:10px 2px 6px}
      .wvm-bm-toggle{display:none}
      @media (max-width:760px){.wvm-bm-body{position:relative;display:block}.wvm-bm-head .muted{display:none}.wvm-bm-head{padding:6px 8px}.wvm-bm-head b{font-size:13px}.wvm-bm-toggle{display:inline-block;background:#7cff6b;color:#04122a}.wvm-bm-list{position:absolute;left:0;right:0;bottom:0;width:auto;height:62%;border-left:0;border-top:2px solid #7cff6b;border-radius:16px 16px 0 0;transform:translateY(102%);transition:transform .25s;z-index:2}#wvm-bigmap.list-open .wvm-bm-list{transform:none}.wvm-bm-list .wvm-place{padding:12px 10px;font-size:15px}}
      #wvm-searchpanel{left:50%;right:auto;transform:translateX(-50%);width:min(440px,94vw)} #wvm-searchpanel input{display:block;width:calc(100% - 20px);margin:0 10px 8px;padding:12px 14px;border-radius:12px;border:1px solid rgba(124,248,255,.6);background:#fff;color:#0b1a3a;font:600 16px Poppins,Segoe UI,Arial;outline:none}
      .wvm-place{display:grid;grid-template-columns:34px 1fr;grid-template-rows:auto auto;column-gap:8px;width:100%;text-align:left;background:rgba(255,255,255,.06);border:1px solid rgba(124,248,255,.22);border-radius:12px;color:#fff;padding:8px 10px;margin:0 0 6px;cursor:pointer;font:inherit} .wvm-place:hover,.wvm-place:focus{background:rgba(56,240,255,.18)} .wvm-place span{grid-row:1/3;font-size:22px;align-self:center;text-align:center} .wvm-place small{color:#9fc4e8;font-size:12px}
      .wvm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px} .wvm-chip{background:rgba(56,240,255,.14);border:1px solid rgba(124,248,255,.45);color:#fff;border-radius:99px;padding:6px 11px;font:600 13px Poppins,Segoe UI,Arial;cursor:pointer}
      .wvm-panel-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1);user-select:none;-webkit-user-select:none}
      .wvm-x{background:none;border:0;color:#fff;font-size:16px;cursor:pointer}
      .wvm-list-body,.wvm-radio-body{padding:10px 14px}
      .wvm-stations{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px} .wvm-radio-frame{aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden}
      .wvm-list-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .wvm-list-row > div{flex:1;min-width:0} .wvm-list-row b{display:block;font-size:13px} .wvm-list-row small{color:#9fd3ff}
      .wvm-list-foot{display:flex;gap:8px;padding-top:10px} .muted{color:#9fb3d9;font-size:13px}
      .wvm-btn{background:rgba(124,248,255,.15);border:1px solid #38f0ff;color:#fff;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;text-decoration:none;display:inline-block}
      .wvm-btn.primary{background:#38f0ff;color:#04122a} .wvm-btn.ghost{background:transparent;border-color:rgba(255,255,255,.3)} .wvm-btn.small{padding:6px 12px;font-size:12px}
      .wvm-modal{position:absolute;inset:0;background:rgba(2,6,20,.6);display:none;align-items:center;justify-content:center;padding:14px;}
      .wvm-modal.on{display:flex}
      .wvm-card{background:linear-gradient(160deg,#0d1f4d,#071233);border:1px solid rgba(124,248,255,.45);border-radius:20px;padding:20px 22px;width:min(560px,96vw);max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)}
      .wvm-card-wide{width:min(720px,96vw)}
      .wvm-card h3{margin:0 0 8px;font-size:22px;color:#7cf8ff} .wvm-card p,.wvm-card li{font-size:15px;line-height:1.5}
      .wvm-pop-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .wvm-help{padding-left:18px} .wvm-help li{margin:6px 0}
      .wvm-chars{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:6px 0 10px}
      .wvm-char{background:rgba(8,20,50,.8);border:2px solid rgba(124,248,255,.25);border-radius:14px;padding:8px 6px;color:#fff;cursor:pointer;font-family:inherit;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px}
      .wvm-char .ic{font-size:30px;line-height:1} .wvm-char b{font-size:13px} .wvm-char small{font-size:10px;color:#9fd3ff;line-height:1.2}
      .wvm-char.on{border-color:#38f0ff;box-shadow:0 0 0 2px rgba(56,240,255,.35);background:rgba(56,240,255,.14)}
      .wvm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0} .wvm-tab{background:transparent;border:1px solid rgba(124,248,255,.35);color:#cfe9ff;border-radius:999px;padding:6px 12px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit} .wvm-tab.on{background:#38f0ff;color:#04122a;border-color:#38f0ff}
      .wvm-looks{margin:8px 0} .wvm-lookrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0} .wvm-looklabel{font-size:12px;color:#9fd3ff;width:100%}
      .wvm-look{min-width:36px;height:36px;border-radius:18px;border:3px solid transparent;cursor:pointer;font-size:13px;font-weight:700;background:#0b1a3a;color:#fff;padding:0 10px;font-family:inherit} .wvm-look.on{border-color:#fff;box-shadow:0 0 0 2px #38f0ff} .wvm-look.txt{border-radius:999px} .wvm-look.rainbow{background:linear-gradient(135deg,#ff4f79,#ff8a3d,#ffd23f,#7cff6b,#38f0ff,#b08cff)}
      .wvm-cam{display:flex;gap:12px;align-items:center;margin:8px 0;position:relative} .wvm-cam video{width:0;height:0;border-radius:16px;object-fit:cover;transform:scaleX(-1)} #wvm-selfie.cam video{width:180px;height:180px} .wvm-cam canvas{width:96px;height:120px;border-radius:48px 48px 40px 40px/50px 50px 60px 60px;background:#0b1a3a;transition:.3s} #wvm-selfie.snapped canvas{width:160px;height:200px;box-shadow:0 0 0 4px #7cff6b} .wvm-cam-hint{font-size:12px;color:#9fd3ff;display:none} #wvm-selfie.cam .wvm-cam-hint{display:block}
      .wvm-privacy{font-size:13px;background:rgba(124,248,255,.1);border:1px solid rgba(124,248,255,.35);border-radius:10px;padding:8px 10px}
      #wvm-fade{position:absolute;inset:0;background:#ffffff;color:#0b1a3a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;opacity:0;pointer-events:none;transition:.5s}
      #wvm-fade.on{opacity:1;pointer-events:auto}
      /* ---- teleport station (white to match the logo) ---- */
      #wvm-loader{position:absolute;inset:0;background:#ffffff;display:flex;align-items:center;justify-content:center;transition:opacity .6s;z-index:5;color:#0b1a3a}
      #wvm-loader.off{opacity:0;pointer-events:none}
      .wvm-tele{text-align:center;width:min(460px,92vw)} .wvm-tele img{height:126px;max-width:88vw;object-fit:contain;margin-bottom:6px}
      .wvm-machine{position:relative;width:240px;height:250px;margin:0 auto 10px}
      .wvm-ring{position:absolute;left:20px;right:20px;height:26px;border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#dff7ff,#38f0ff 60%,#1aa8c9);box-shadow:0 0 22px rgba(56,240,255,.75),inset 0 -6px 10px rgba(0,60,90,.35)}
      .wvm-ring-top{top:0;animation:wvmhover 2.2s ease-in-out infinite} .wvm-ring-base{bottom:0;height:34px}
      .wvm-pad-glow{position:absolute;left:15%;right:15%;top:6px;height:14px;border-radius:50%;background:radial-gradient(ellipse,#fff,rgba(56,240,255,0) 70%);animation:wvmpulse 1.2s ease-in-out infinite}
      .wvm-pillar{position:absolute;top:12px;bottom:14px;width:14px;border-radius:7px;background:linear-gradient(90deg,#9fb8d1,#e6f0fa,#7f98b3);box-shadow:0 2px 8px rgba(0,0,0,.25)} .wvm-pl{left:4px} .wvm-pr{right:4px}
      .wvm-beam{position:absolute;left:44px;right:44px;top:16px;bottom:22px}
      .wvm-beam::before{content:"";position:absolute;left:-40px;right:-40px;top:-10px;bottom:-16px;background:repeating-conic-gradient(from 168deg at 50% 0,rgba(120,235,255,.0) 0 3deg,rgba(120,235,255,.22) 3deg 5deg,rgba(255,255,255,0) 5deg 9deg);-webkit-mask-image:linear-gradient(180deg,#000,transparent 92%);mask-image:linear-gradient(180deg,#000,transparent 92%);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);animation:wvmrays 7s ease-in-out infinite;transform-origin:50% 0}
      .wvm-beamcol{position:absolute;inset:0;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);background:radial-gradient(ellipse 60% 26% at 50% 100%,rgba(255,255,255,.98),rgba(190,246,255,.6) 45%,rgba(56,240,255,0) 75%),linear-gradient(90deg,rgba(56,240,255,0),rgba(150,240,255,.5) 30%,rgba(255,255,255,.85) 50%,rgba(150,240,255,.5) 70%,rgba(56,240,255,0)),linear-gradient(180deg,rgba(56,240,255,.12),rgba(120,235,255,.4));filter:blur(2.5px);animation:wvmbeam 3.2s ease-in-out infinite}
      .wvm-beam-lines{position:absolute;inset:0;clip-path:polygon(32% 0,68% 0,96% 100%,4% 100%);background-image:radial-gradient(circle,rgba(255,255,255,.98) 0 1.6px,rgba(255,255,255,0) 2.8px),radial-gradient(circle,rgba(130,238,255,.95) 0 1.1px,rgba(130,238,255,0) 2.2px);background-size:34px 46px,21px 23px;background-position:0 0,9px 11px;-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%,#000 82%,transparent);mask-image:linear-gradient(180deg,transparent,#000 22%,#000 82%,transparent);animation:wvmrise 2.6s linear infinite}
      .wvm-silh{position:absolute;left:50%;top:22px;width:96px;height:156px;margin-left:-48px;fill:#0b1a3a;filter:drop-shadow(0 0 12px #38f0ff);animation:wvmmat 2.4s ease-in-out infinite}
      #wvm-loader.beam .wvm-silh{animation:wvmup .6s ease-in forwards}
      @keyframes wvmbeam{0%,100%{opacity:.78}50%{opacity:1}} @keyframes wvmrise{from{background-position:0 0,9px 11px}to{background-position:0 -92px,9px -81px}} @keyframes wvmrays{0%,100%{transform:rotate(-2.5deg);opacity:.7}50%{transform:rotate(2.5deg);opacity:1}} @keyframes wvmhover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes wvmmat{0%{clip-path:inset(0 0 100% 0);opacity:.2}60%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 0);opacity:1}} @keyframes wvmpulse{0%,100%{transform:scaleX(.8);opacity:.6}50%{transform:scaleX(1.1);opacity:1}} @keyframes wvmup{to{transform:translateY(-260px);opacity:0}}
      @media (prefers-reduced-motion: reduce){.wvm-beamcol,.wvm-silh,.wvm-pad-glow,.wvm-ring-top,.wvm-beam-lines,.wvm-beam::before{animation:none}}
      .wvm-loadmsg{font-weight:800;margin-bottom:12px;min-height:22px;color:#0b1a3a} .wvm-barwrap{height:12px;border-radius:99px;background:rgba(11,26,58,.12);overflow:hidden;border:1px solid rgba(56,240,255,.6)}
      .wvm-bar{height:100%;width:0;background:linear-gradient(90deg,#38f0ff,#ff4f79,#ffd23f);transition:width .4s;box-shadow:0 0 16px #38f0ff}
      .wvm-tele small{display:block;margin-top:10px;color:#3a5a8a}
      #wvm-pad{position:absolute;left:18px;bottom:22px;width:150px;height:150px;user-select:none;-webkit-user-select:none}
      body.wvm-modal-open #wvm-pad,body.wvm-modal-open #wvm-act,body.wvm-modal-open #wvm-turbo,body.wvm-modal-open #wvm-vr{display:none!important}
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
      #wvm-act{position:absolute;bottom:78px;left:50%;transform:translateX(-50%);background:#7cff6b;color:#04122a;border:0;border-radius:999px;padding:14px 26px;font-weight:900;font-size:17px;display:none;box-shadow:0 8px 30px rgba(124,255,107,.45);font-family:inherit;cursor:pointer;animation:wvmpop .4s;max-width:70vw}
      #wvm-act.on{display:block} @keyframes wvmpop{from{transform:translateX(-50%) scale(.7)}to{transform:translateX(-50%) scale(1)}}
      #wvm-turbo{position:absolute;right:18px;bottom:96px;width:92px;height:92px;border-radius:50%;border:3px solid #ffd23f;background:radial-gradient(circle at 40% 35%,#ff8a3d,#c1121f);color:#fff;font-weight:900;font-size:14px;display:none;box-shadow:0 8px 30px rgba(255,80,40,.5);font-family:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}
      #wvm-turbo.on{display:block} #wvm-turbo:active{transform:scale(.94)}
      @media (prefers-reduced-motion: reduce){#wvm-act{animation:none} .wvm-ring{animation:none}}
      .wvm-scrollhint{position:absolute;bottom:14px;right:14px;background:rgba(8,20,50,.75);border:1px solid rgba(124,248,255,.4);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700}
    `;
    document.head.appendChild(s);
  }
}

WVM.SPEEDS = [['🐢', 0.6, 'Stroll'], ['🚶', 1, 'Walk'], ['🏃', 1.8, 'Jog'], ['⚡', 3, 'Zoom']];
WVM.STOP = new Set(['the', 'is', 'are', 'to', 'go', 'me', 'my', 'of', 'in', 'at', 'an', 'where', 'wheres', 'find', 'take', 'show', 'get', 'can', 'you', 'how', 'do', 'for', 'and', 'on', 'it', 'there', 'want', 'need', 'please', 'store', 'shop', 'area', 'whats', 'what', 'with', 'see', 'visit', 'bring', 'walk', 'transport', 'teleport', 'port']);

/* The selfie oval: wide across the eyes, tapering to a natural chin (same idea as the Phoenix face cutout). */
function facePath(g, W, H) {
  const cx = W / 2; g.beginPath();
  g.moveTo(cx, 8);
  g.bezierCurveTo(W * 0.92, 8, W * 0.98, H * 0.42, W * 0.9, H * 0.62);
  g.bezierCurveTo(W * 0.84, H * 0.8, W * 0.66, H - 6, cx, H - 6);
  g.bezierCurveTo(W * 0.34, H - 6, W * 0.16, H * 0.8, W * 0.1, H * 0.62);
  g.bezierCurveTo(W * 0.02, H * 0.42, W * 0.08, 8, cx, 8);
  g.closePath();
}

/* utilities */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dist2(t) { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.hypot(dx, dy); }
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
export { esc, lerpAngle };
