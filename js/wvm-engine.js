/* ============================================================
   World VR Mall — shared engine  (worldvrmall.com)   v5
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
export const WVM_VERSION = '5';
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
export function makeTextTexture(lines, opts = {}) {
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
  const t = canvasTex(c); t.anisotropy = isMobile() ? 1 : 4;
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
export function makeSprite(text, opts = {}) {
  const { scale = 4, bg = 'rgba(8,20,50,0.85)', fg = '#fff', accent = '#7cf8ff', font = 'bold 56px Poppins, Segoe UI, Arial' } = opts;
  const tex = makeTextTexture(text, { w: 1024, h: 256, bg, fg, accent, font, radius: 120, border: accent, glow: true });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale / 4, 1);
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
  { id: 'kid', name: 'Kid', icon: '🧒', desc: 'Small, bouncy walk', kind: 'classic', age: 'kid', face: true },
  { id: 'alien', name: 'Alien', icon: '👽', desc: 'Friendly visitor', kind: 'alien', face: false },
  { id: 'robot', name: 'Robot', icon: '🤖', desc: 'Beep boop', kind: 'robot', face: false },
  { id: 'drone', name: 'Drone', icon: '🛸', desc: 'Hovers. No legs required', kind: 'drone', face: false },
  { id: 'cart', name: 'Shopping Cart', icon: '🛒', desc: 'Eyebrows, spiky hair, rolling wheels', kind: 'cart', face: true },
  { id: 'cat', name: 'Cat Head', icon: '🐱', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'cat', face: false },
  { id: 'unicorn', name: 'Unicorn', icon: '🦄', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'unicorn', face: false },
  { id: 'bear', name: 'Bear', icon: '🐻', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'bear', face: false },
  { id: 'lion', name: 'Lion', icon: '🦁', desc: 'Giant bobblehead', kind: 'bobble', bobble: 'lion', face: false },
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
  const light = new THREE.PointLight(o.accent, 0.6, 4); light.position.y = 1.2; g.add(light);
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
  if (ch.kind === 'alien') return Promise.resolve(makeAlien({ suit: av.shirt || 0xb08cff, sunglasses: !!av.sunglasses }));
  if (ch.kind === 'robot') return Promise.resolve(makeRobot({ accent: av.shirt || 0x38f0ff }));
  if (ch.kind === 'drone') return Promise.resolve(makeDrone({ accent: av.shirt || 0x38f0ff }));
  if (ch.kind === 'bobble') return Promise.resolve(makeBobble(ch.bobble, Object.assign({}, common)));
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
    renderer.xr.enabled = true;
    renderer.domElement.id = 'wvm-canvas';
    this.stage.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(o.fog, o.fogNear, o.fogFar);
    const camera = this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2400);
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
    // shadow camera follows the player so shadows stay sharp where you are
    this.onUpdate(() => { if (!this.sun.castShadow) return; const p = this.player.position; this.sun.position.set(p.x - 120, 140, p.z - 160); this.sun.target.position.set(p.x, 0, p.z); this.sun.target.updateMatrixWorld(); });
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
      const pm = new THREE.PMREMGenerator(this.renderer); const env = pm.fromEquirectangular(tex).texture; pm.dispose();
      if (this.scene.environment) this.scene.environment.dispose(); this.scene.environment = env;
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
    const ch = CHARACTERS.find(c => c.id === (saved.character || 'classic')) || CHARACTERS[0];
    // instant placeholder so the world never shows an empty rig while a GLB downloads
    const placeholder = makePerson(Object.assign({ bag: false, faceTex, age: 'adult', scale: 1, glasses: false, beard: false, dress: false, hairStyle: 'short', hair: 0x4a2e15, skin: 0xe0ac7e, shirt: 0x38f0ff, pants: 0x1e2a4a, hat: false }, saved));
    this._setAvatar(placeholder);
    const gen = this._avatarGen = (this._avatarGen || 0) + 1;
    buildCharacter(ch, saved, faceTex).then(av => { if (gen !== this._avatarGen) return; addExtras(av, saved); this._setAvatar(av); });
  }
  _setAvatar(av) {
    if (this.avatar) { this.player.remove(this.avatar); if (this.vehicle) sitPerson(av, true); }
    this.avatar = av; av.visible = this.dist > 0.5; this.player.add(av);
    if (this.vehicle) { sitPerson(av, true); av.position.y = this.vehicle.seatY || 0.5; }
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
  }

  /* ----- public API for pages ----- */
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  addObstacle(x, z, r) { this.obstacles.push({ x, z, r }); }
  addBox(x, z, hw, hd) { this.obstacles.push({ x, z, hw, hd }); }
  /* polygon obstacle: pts = [[x,z],...]; blocks INSIDE the polygon (a lake), or outside it when opts.keepIn (a boat) */
  addPoly(pts, opts = {}) { const ob = { poly: pts, keepIn: !!opts.keepIn, level: opts.level }; this.obstacles.push(ob); return ob; }
  static inPoly(pts, x, z) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; } return inside; }
  _blocked(nx, nz) { for (const ob of this.obstacles) { if (ob.level !== undefined && ob.level !== (this.level || 0)) continue; if (ob.poly) { if (ob.off) continue; const inn = WVM.inPoly(ob.poly, nx, nz); if (ob.keepIn ? !inn : inn) return true; continue; } if (ob.hw !== undefined) { if (Math.abs(nx - ob.x) < ob.hw && Math.abs(nz - ob.z) < ob.hd) return true; } else { const dx = nx - ob.x, dz = nz - ob.z; if (dx * dx + dz * dz < ob.r * ob.r) return true; } } return false; }
  addHotspot(obj, data) { obj.traverse(c => { c.userData.hotspot = data; }); this.hotspots.push(obj); return obj; }
  addZone(name, center, radius, build) { this.zones.push({ name, center, radius, build, built: false }); }
  addTrigger(x, z, r, fn) { (this.triggers = this.triggers || []).push({ x, z, r, fn, fired: false }); }
  /* Runs fn once after the visitor has walked `meters` on their own (for a delayed welcome popup). */
  onFirstSteps(meters, fn) { this._stepHooks.push({ meters, fn, done: false }); }
  /* Something you can DO when standing near it: shows a big green button with the label. */
  addInteractable(x, z, r, label, fn) { (this.interactables = this.interactables || []).push({ x, z, r, label, fn }); }
  _updateInteractables() {
    if (!this.interactables) return; const p = this.player.position; let best = null, bd = 1e9;
    for (const it of this.interactables) { if (it.level !== undefined && it.level !== (this.level || 0)) continue; const dx = p.x - it.x, dz = p.z - it.z, d = dx * dx + dz * dz; if (d < it.r * it.r && d < bd) { bd = d; best = it; } }
    if (this.ride || this.paused) best = null;
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
  walkTo(x, z) { this.walkTarget = new THREE.Vector3(x, this.opts.groundY(x, z), z); this._marker(this.walkTarget); }
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
    const headTop = seatY + (av.userData.headY || 2) * 0.8; const fit = roofY - 0.12; if (headTop > fit) { v.avScale = av.scale.x; av.scale.setScalar(av.scale.x * fit / headTop); }
    this.toast(opts.label || '🚗 Vroom. Hit TURBO for flames. Tap the button to hop out.', 3200);
    const it = { x: 0, z: 0, r: 1e9, label: '🚪 Hop out of the cart', fn: (a) => { const v = a.vehicle; a.vehicle = null; sitPerson(a.avatar, false); a.avatar.position.y = 0; if (v.avScale) a.avatar.scale.setScalar(v.avScale); a.interactables = a.interactables.filter(i => i !== it); v.m.position.copy(a.player.position); v.m.position.x += 2; v.m.rotation.y = a.avatar.rotation.y; if (v.flames) { v.m.remove(v.flames); } a.turboBtn.classList.remove('on'); if (v.park) v.park(v); } }; this.addInteractable(it.x, it.z, it.r, it.label, it.fn);
    // flames: a cone of sprites out the back, shown while turbo is held
    const flames = v.flames = new THREE.Group(); flames.visible = false; flames.position.set(0, 0.45, -1.3); cart.add(flames);
    const fm = (c) => new THREE.SpriteMaterial({ map: this._flameTex(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(fm(i % 3 === 0 ? 0xffd23f : i % 3 === 1 ? 0xff8a3d : 0xff4f2b)); s.userData.i = i; flames.add(s); }
    this.onUpdate((dt, t) => { if (!this.vehicle || this.vehicle !== v) return; const on = v.turbo > 0; flames.visible = on; if (on) { for (const s of flames.children) { const k = (t * 6 + s.userData.i * 0.37) % 1; s.position.set(Math.sin(s.userData.i * 2.1 + t * 9) * 0.25 * k, k * 0.3, -k * 2.4); const sc = 0.5 + k * 1.2; s.scale.set(sc, sc, 1); s.material.opacity = 1 - k; } } });
    this.turboBtn.classList.add('on');
  }
  _flameTex() { if (this._ft) return this._ft; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,220,120,0.9)'); gr.addColorStop(1, 'rgba(255,80,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this._ft = new THREE.CanvasTexture(c); return this._ft; }
  /* Ride anything. pathFn(t01) → Vector3 for progress 0..1; the avatar (and optional vehicle mesh) follows.
     opts: duration (s), loop, vehicle (mesh that moves too), seat (Vector3 offset inside the vehicle), yaw ('path' faces travel direction),
     lookUp (tilts the camera up a bit — balloons), onEnd. Returns a stop() function. */
  startRide(pathFn, opts = {}) {
    if (this.ride) return () => {};
    const dur = opts.duration || 40, t0 = this.t; const veh = opts.vehicle; const seat = opts.seat || new THREE.Vector3(0, 0, 0);
    const av = this.avatar; if (opts.sit !== false) sitPerson(av, true);
    const pitch0 = this.pitch; if (opts.lookUp) this.pitch = -0.6;
    const self = this; let last = pathFn(0);
    this.ride = { pos: (t) => { let k = (t - t0) / dur; if (opts.loop) k %= 1; else k = Math.min(1, k); const p = pathFn(k); if (veh) { veh.position.copy(p); if (opts.yaw === 'path') { veh.rotation.y = Math.atan2(p.x - last.x, p.z - last.z); } } last = p.clone(); const out = p.clone().add(seat); if (veh && opts.yaw === 'path') out.copy(p).add(seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), veh.rotation.y)); return out; }, yaw: undefined, until: opts.loop ? undefined : t0 + dur, done: () => stop(true) };
    const it = { x: 0, z: 0, r: 1e9, label: opts.exitLabel || '🛑 End the ride', fn: () => stop(false) }; this.addInteractable(it.x, it.z, it.r, it.label, it.fn);
    function stop(natural) { if (!self.ride) return; self.ride = null; sitPerson(av, false); self.pitch = pitch0; self.interactables = self.interactables.filter(i => i !== it); if (opts.exit) self.player.position.copy(opts.exit); if (opts.onEnd) opts.onEnd(natural); self.toast(natural ? (opts.endToast || 'What a ride! 🎉') : 'Hopped off.'); }
    if (opts.toast !== false) this.toast(opts.toast || '🎢 Hang on!', 2500);
    return () => stop(false);
  }
  /* Fade + navigate to another page (portal). */
  go(url, label = 'Teleporting…') {
    try { sessionStorage.setItem('wvm_from', this.opts.page); } catch (e) { }
    this.fade.classList.add('on'); this.fade.textContent = label;
    setTimeout(() => { location.href = url; }, 550);
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
    for (const a of actions) { const b = document.createElement('button'); b.className = 'wvm-btn' + (a.primary ? ' primary' : ''); b.textContent = a.label; b.onclick = () => { if (a.href) { if (a.newTab) window.open(a.href, '_blank', 'noopener'); else this.go(a.href, a.label); } else if (a.fn) a.fn(); if (!a.keep) this.closePopup(); }; ab.appendChild(b); }
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
      setTimeout(() => { this.loader.classList.add('off'); this._maybeSelfie(); }, 650);
    };
    Promise.resolve(buildFn(this)).then(() => {
      if (this.opts.shadows) this.enableShadows(this.scene);
      this._progress(0.9);
      setTimeout(done, 900);
    }).catch(err => { console.error(err); clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Build error: <code style="font-size:12px;color:#c00">' + esc(err && err.message ? err.message : String(err)) + '</code><br><small>' + esc((err && err.stack ? err.stack.split('\n')[1] : '') || '') + '</small><br>Screenshot this and send it to Zach.'; });
    addEventListener('error', (ev) => { if (!this.loader.classList.contains('off')) { clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Script error: <code style="font-size:12px;color:#c00">' + esc(ev.message || '') + '</code><br><small>' + esc((ev.filename || '').split('/').pop() + ':' + ev.lineno) + '</small>'; } });
    addEventListener('unhandledrejection', (ev) => { if (!this.loader.classList.contains('off')) { clearInterval(tick); this.loadMsg.innerHTML = '⚠️ Load error: <code style="font-size:12px;color:#c00">' + esc(ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)) + '</code>'; } });
    this.renderer.setAnimationLoop(() => this._frame());
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

  /* ----- frame ----- */
  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (!this.paused) this._movePlayer(dt);
    this._updateCamera(dt);
    this._updateNPCs(dt);
    this._updateZones(); this._updateInteractables(); this._updateBalls(dt);
    if (this.triggers && !this.paused) { const p = this.player.position; for (const tr of this.triggers) { const dx = p.x - tr.x, dz = p.z - tr.z; const inside = dx * dx + dz * dz < tr.r * tr.r; if (inside && !tr.fired) { tr.fired = true; tr.fn(this); } else if (!inside) tr.fired = false; } }
    for (const u of this.updaters) u(dt, this.t);
    if (this.composer && !this.renderer.xr.isPresenting) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
    if (mv.lengthSq() > 1) mv.normalize();
    // tap-to-walk
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
      if (!this._blocked(nx, nz)) { p.position.x = nx; p.position.z = nz; }
      else if (!this._blocked(nx, p.position.z)) { p.position.x = nx; }
      else if (!this._blocked(p.position.x, nz)) { p.position.z = nz; }
      const B = this.opts.bounds || 600; p.position.x = clamp(p.position.x, -B, B); p.position.z = clamp(p.position.z, -B, B);
      this.walked += before.distanceTo(p.position);
      for (const h of this._stepHooks) { if (!h.done && this.walked >= h.meters) { h.done = true; try { h.fn(this); } catch (e) { console.error(e); } } }
      const ang = Math.atan2(step.x, step.z); this.avatar.rotation.y = lerpAngle(this.avatar.rotation.y, ang, 0.25);
    }
    p.position.y = o.groundY(p.position.x, p.position.z);
    if (this.vehicle) { const v = this.vehicle.m; v.position.copy(p.position); v.rotation.y = this.avatar.rotation.y; if (this.vehicle.turbo > 0) this.vehicle.turbo -= dt; sitPerson(this.avatar, true); animatePerson(this.avatar, this.t, 0); return; }
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
    } else if (this.viewMode === 'top') {
      const camPos = new THREE.Vector3(p.x + Math.sin(this.yaw) * 2, p.y + 6 + this.dist * 1.6, p.z + Math.cos(this.yaw) * 2);
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0); this.rig.updateMatrixWorld(); this.camera.lookAt(eye);
    } else if (this.viewMode === 'orbit') {
      const a = this.t * 0.35; const camPos = new THREE.Vector3(p.x + Math.sin(a) * this.dist * 1.3, p.y + 2.2, p.z + Math.cos(a) * this.dist * 1.3);
      this.rig.position.copy(camPos); this.rig.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0); this.rig.updateMatrixWorld(); this.camera.lookAt(eye);
    } else {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const off = new THREE.Vector3(Math.sin(this.yaw) * cp * this.dist, -sp * this.dist + 0.6, Math.cos(this.yaw) * cp * this.dist);
      const camPos = eye.clone().add(off);
      const gy = this.opts.groundY(camPos.x, camPos.z) + 0.4; if (camPos.y < gy) camPos.y = gy;
      // zoomed way out = world view: push the fog back so the whole map stays visible
      const far = this.dist > 30; if (far !== this._farMode) { this._farMode = far; this.scene.fog.near = far ? this.opts.fogFar * 2 : this.opts.fogNear; this.scene.fog.far = far ? this.opts.fogFar * 6 : this.opts.fogFar; }
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
      p.position.y = n.y !== undefined ? n.y : this.opts.groundY(p.position.x, p.position.z);
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
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; this.keys[e.code] = true; if (e.code === 'KeyV') this.toggleView(); if (e.code === 'Escape') this.closePopup(); if (e.code === 'KeyL') this.toggleList(); if (e.code === 'KeyM') this.showMap(); if (e.code === 'KeyT' && this.vehicle) this.turbo(); });
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
    const grip = pad.querySelector('.wvm-pad-grip'); let gd = false, gx = 0, gy = 0;
    const gs = (x, y) => { gd = true; const r = pad.getBoundingClientRect(); gx = x - r.left; gy = y - r.top; };
    const gm = (x, y) => { if (!gd) return; const nx = clamp(x - gx, 0, innerWidth - pad.offsetWidth), ny = clamp(y - gy, 0, innerHeight - pad.offsetHeight); pad.style.left = nx + 'px'; pad.style.top = ny + 'px'; pad.style.right = 'auto'; pad.style.bottom = 'auto'; };
    const ge = () => { if (gd) { gd = false; const r = pad.getBoundingClientRect(); this._save('wvm_padpos', { x: r.left, y: r.top }); } };
    grip.addEventListener('mousedown', e => { gs(e.clientX, e.clientY); e.preventDefault(); }); addEventListener('mousemove', e => gm(e.clientX, e.clientY)); addEventListener('mouseup', ge);
    grip.addEventListener('touchstart', e => { gs(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    grip.addEventListener('touchmove', e => { gm(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false }); grip.addEventListener('touchend', ge);
    const stick = pad.querySelector('.wvm-stick'), knob = pad.querySelector('.wvm-knob'); let sid = null;
    const sset = (x, y) => { const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (x - cx) / (r.width / 2), dy = (y - cy) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; this.moveVec.set(dx, -dy); this.running = L > 0.92; this.walkTarget = null; };
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
        <a class="wvm-brand" href="/" title="World VR Mall home"><img src="/images/world-vr-mall-logo.png" alt="World VR Mall"></a>
        <div class="wvm-where">${esc(this.opts.worldName)}</div>
        <div class="wvm-tools">
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
        <img src="/images/world-vr-mall-logo.png" alt="World VR Mall">
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
    const light = new THREE.PointLight(0xffd23f, 0.4, 4); if (!isMobile()) g.add(light);
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
    const it = { x, z, r: 2.2, label: '🖐️ Pick up ' + item.name, fn: (a) => { a.bag.push(item); a._save('wvm_bag', a.bag); a._renderBag(); a.scene.remove(s); a.interactables = a.interactables.filter(i => i !== it); a.toast(item.icon + ' ' + item.name + ' is in your bag 🎒', 2000); a.buzz(20); } }; this.addInteractable(it.x, it.z, it.r, it.label, it.fn);
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
  showMap() {
    if (!this.mapDraw) { this.toast('No map for this area yet'); return; }
    const o = this.mapOpts, S = isMobile() ? Math.min(o.size, 640) : o.size; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    const scale = o.scale * (S / o.size); const toXY = (x, z) => [S / 2 + (x - o.cx) * scale, S / 2 + (z - o.cz) * scale];
    g.fillStyle = '#071233'; g.fillRect(0, 0, S, S);
    // a real photo of the world from straight above: render the scene with an orthographic camera into a texture, then draw it
    let real = false;
    try {
      const half = S / (2 * scale); const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.5, o.camY ? o.camY + 50 : 1500); cam.position.set(o.cx, o.camY || 900, o.cz); cam.up.set(0, 0, -1); cam.lookAt(o.cx, 0, o.cz); cam.updateProjectionMatrix();
      const rt = new THREE.WebGLRenderTarget(S, S); const fog = this.scene.fog, bg = this.scene.background; this.scene.fog = null; this.scene.background = new THREE.Color(o.bg || 0x0f2a4a);
      const hidden = []; this.scene.traverse(obj => { if (obj.userData.mapHide && obj.visible) { obj.visible = false; hidden.push(obj); } });
      this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, cam); this.renderer.setRenderTarget(null);
      const px = new Uint8Array(S * S * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, S, S, px); rt.dispose(); this.scene.fog = fog; this.scene.background = bg; hidden.forEach(h => h.visible = true);
      const img = g.createImageData(S, S); for (let y = 0; y < S; y++) { const src = (S - 1 - y) * S * 4, dst = y * S * 4; img.data.set(px.subarray(src, src + S * 4), dst); } g.putImageData(img, 0, 0); real = true;
      const grid = g.createLinearGradient(0, 0, 0, S); grid.addColorStop(0, 'rgba(5,11,28,0.35)'); grid.addColorStop(0.5, 'rgba(5,11,28,0)'); grid.addColorStop(1, 'rgba(5,11,28,0.35)'); g.fillStyle = grid; g.fillRect(0, 0, S, S);
    } catch (err) { console.warn('map render fell back to schematic', err); }
    if (!real) this.mapDraw(g, toXY);
    for (const [lx, lz, txt, col] of (o.labels || [])) { const [px2, py2] = toXY(lx, lz); g.font = 'bold 15px Poppins, Segoe UI, Arial'; g.textAlign = 'center'; const w = g.measureText(txt).width + 14; g.fillStyle = 'rgba(5,11,28,0.8)'; g.beginPath(); g.roundRect(px2 - w / 2, py2 - 12, w, 22, 8); g.fill(); g.fillStyle = col || '#fff'; g.fillText(txt, px2, py2 + 4); }
    const p = this.player.position; const [px, py] = toXY(p.x, p.z); g.fillStyle = '#ff4f79'; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    const d = -this.yaw; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(d) * 26, py - Math.cos(d) * 26); g.strokeStyle = '#ff4f79'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 20px Poppins, Segoe UI, Arial'; g.textAlign = 'left'; g.fillText('● you', px + 14, py + 6); if (o.title) { g.font = 'bold 22px Poppins, Segoe UI, Arial'; g.fillStyle = 'rgba(5,11,28,0.8)'; g.fillRect(0, 0, S, 36); g.fillStyle = '#fff'; g.fillText(o.title, 12, 26); }
    this.popup('🗺️ Map', '', []); const body = this.pop.querySelector('.wvm-pop-body'); c.style.cssText = 'width:100%;border-radius:12px;background:#071233'; body.appendChild(c);
    const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Tap anywhere on the map to walk there.'; body.appendChild(hint);
    c.onclick = (ev) => { const r = c.getBoundingClientRect(); const mx = (ev.clientX - r.left) / r.width * S, my = (ev.clientY - r.top) / r.height * S; const wx = (mx - S / 2) / scale + o.cx, wz = (my - S / 2) / scale + o.cz; this.closePopup(); this.walkTo(wx, wz); this.toast('Walking there… 🚶', 2000); };
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
    const stations = this.opts.stations || [['🤠 Country', 's2LRDjYedSA'], ['🎸 Rock', 'jSoGmtRW8RM'], ['🎻 Classical', 'oExWo1rIZsQ'], ['🎧 Uplifting beats', '7rOcIQnEzwA']];
    const row = document.createElement('div'); row.className = 'wvm-stations';
    const frame = document.createElement('div'); frame.className = 'wvm-radio-frame';
    for (const [name, id] of stations) { const b = document.createElement('button'); b.className = 'wvm-btn small'; b.textContent = name; b.onclick = () => { row.querySelectorAll('.wvm-btn').forEach(x => x.classList.remove('primary')); b.classList.add('primary'); frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0" title="${esc(name)}" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:0"></iframe>`; }; row.appendChild(b); }
    const off = document.createElement('button'); off.className = 'wvm-btn small ghost'; off.textContent = '⏹ Off'; off.onclick = () => { frame.innerHTML = ''; row.querySelectorAll('.wvm-btn').forEach(x => x.classList.remove('primary')); }; row.appendChild(off);
    body.append(row, frame); const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Pick a station. It keeps playing while you shop. Close this panel with ✕ and the music stays on.'; body.appendChild(hint);
  }

  /* ----- selfie / character ----- */
  _buildSelfie() {
    const el = this.selfieEl, chars = el.querySelector('.wvm-chars'), tabs = el.querySelector('.wvm-tabs'), looks = el.querySelector('.wvm-looks');
    const get = () => this._load('wvm_avatar', {}) || {}; const set = (patch) => { const a = Object.assign(get(), patch); this._save('wvm_avatar', a); this._buildAvatar(); return a; };
    // character cards
    const renderChars = () => { chars.innerHTML = ''; const cur = get().character || 'classic'; for (const c of CHARACTERS) { const b = document.createElement('button'); b.className = 'wvm-char' + (c.id === cur ? ' on' : ''); b.innerHTML = `<span class="ic">${c.icon}</span><b>${c.name}</b><small>${c.desc}</small>`; b.onclick = () => { set({ character: c.id }); renderChars(); renderLooks(); }; chars.appendChild(b); } };
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
      looks.innerHTML = ''; const a = get(); const ch = CHARACTERS.find(c => c.id === (a.character || 'classic')) || CHARACTERS[0];
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
      .wvm-ico{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid rgba(124,248,255,.35);background:rgba(8,20,50,.7);color:#fff;font-size:18px;cursor:pointer;backdrop-filter:blur(6px)}
      .wvm-ico span{position:absolute;top:-6px;right:-6px;background:#ff4f79;color:#fff;font-size:11px;font-weight:800;border-radius:10px;padding:1px 6px;min-width:12px}
      .wvm-ico.bump{transform:scale(1.2)}
      #wvm-vr{position:absolute!important;left:50%!important;transform:translateX(-50%);bottom:18px!important;background:#38f0ff!important;color:#04122a!important;border:0!important;border-radius:999px!important;font-weight:800!important;padding:10px 22px!important;font-family:inherit!important;opacity:1!important;width:auto!important;font-size:14px!important}
      #wvm-toast{position:absolute;top:64px;left:50%;transform:translateX(-50%) translateY(-10px);background:rgba(8,20,50,.92);border:1px solid #38f0ff;border-radius:999px;padding:8px 16px;font-weight:700;font-size:14px;opacity:0;transition:.25s;max-width:88vw;text-align:center}
      #wvm-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
      .wvm-panel{position:absolute;top:58px;right:10px;width:min(360px,92vw);max-height:70vh;overflow:auto;background:rgba(8,20,50,.95);border:1px solid rgba(124,248,255,.4);border-radius:16px;display:none;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .wvm-panel.on{display:block}
      .wvm-panel-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1);user-select:none;-webkit-user-select:none}
      .wvm-x{background:none;border:0;color:#fff;font-size:16px;cursor:pointer}
      .wvm-list-body,.wvm-radio-body{padding:10px 14px}
      .wvm-stations{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px} .wvm-radio-frame{aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden}
      .wvm-list-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .wvm-list-row > div{flex:1;min-width:0} .wvm-list-row b{display:block;font-size:13px} .wvm-list-row small{color:#9fd3ff}
      .wvm-list-foot{display:flex;gap:8px;padding-top:10px} .muted{color:#9fb3d9;font-size:13px}
      .wvm-btn{background:rgba(124,248,255,.15);border:1px solid #38f0ff;color:#fff;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;text-decoration:none;display:inline-block}
      .wvm-btn.primary{background:#38f0ff;color:#04122a} .wvm-btn.ghost{background:transparent;border-color:rgba(255,255,255,.3)} .wvm-btn.small{padding:6px 12px;font-size:12px}
      .wvm-modal{position:absolute;inset:0;background:rgba(2,6,20,.6);display:none;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(3px)}
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
      #wvm-fade{position:absolute;inset:0;background:#38f0ff;color:#04122a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;opacity:0;pointer-events:none;transition:.5s}
      #wvm-fade.on{opacity:1;pointer-events:auto}
      /* ---- teleport station (white to match the logo) ---- */
      #wvm-loader{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,#ffffff,#e9f4ff 55%,#cfe6ff);display:flex;align-items:center;justify-content:center;transition:opacity .6s;z-index:5;color:#0b1a3a}
      #wvm-loader.off{opacity:0;pointer-events:none}
      .wvm-tele{text-align:center;width:min(460px,92vw)} .wvm-tele img{height:126px;max-width:88vw;object-fit:contain;margin-bottom:6px}
      .wvm-machine{position:relative;width:240px;height:250px;margin:0 auto 10px}
      .wvm-ring{position:absolute;left:20px;right:20px;height:26px;border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#dff7ff,#38f0ff 60%,#1aa8c9);box-shadow:0 0 22px rgba(56,240,255,.75),inset 0 -6px 10px rgba(0,60,90,.35)}
      .wvm-ring-top{top:0;animation:wvmhover 2.2s ease-in-out infinite} .wvm-ring-base{bottom:0;height:34px}
      .wvm-pad-glow{position:absolute;left:15%;right:15%;top:6px;height:14px;border-radius:50%;background:radial-gradient(ellipse,#fff,rgba(56,240,255,0) 70%);animation:wvmpulse 1.2s ease-in-out infinite}
      .wvm-pillar{position:absolute;top:12px;bottom:14px;width:14px;border-radius:7px;background:linear-gradient(90deg,#9fb8d1,#e6f0fa,#7f98b3);box-shadow:0 2px 8px rgba(0,0,0,.25)} .wvm-pl{left:4px} .wvm-pr{right:4px}
      .wvm-beam{position:absolute;left:44px;right:44px;top:16px;bottom:22px}
      .wvm-beamcol{position:absolute;inset:0;background:linear-gradient(180deg,rgba(56,240,255,.05),rgba(56,240,255,.45) 40%,rgba(56,240,255,.7));border-radius:60px 60px 12px 12px;animation:wvmbeam 1.6s ease-in-out infinite;filter:blur(1px);box-shadow:0 0 40px rgba(56,240,255,.5)}
      .wvm-beam-lines{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.55) 0 2px,rgba(255,255,255,0) 2px 14px);border-radius:60px 60px 12px 12px;animation:wvmscan 1.1s linear infinite;opacity:.7}
      .wvm-silh{position:absolute;left:50%;top:22px;width:96px;height:156px;margin-left:-48px;fill:#0b1a3a;filter:drop-shadow(0 0 12px #38f0ff);animation:wvmmat 2.4s ease-in-out infinite}
      #wvm-loader.beam .wvm-silh{animation:wvmup .6s ease-in forwards}
      @keyframes wvmbeam{0%,100%{opacity:.55}50%{opacity:1}} @keyframes wvmscan{from{background-position:0 0}to{background-position:0 28px}} @keyframes wvmhover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes wvmmat{0%{clip-path:inset(0 0 100% 0);opacity:.2}60%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 0);opacity:1}} @keyframes wvmpulse{0%,100%{transform:scaleX(.8);opacity:.6}50%{transform:scaleX(1.1);opacity:1}} @keyframes wvmup{to{transform:translateY(-260px);opacity:0}}
      @media (prefers-reduced-motion: reduce){.wvm-beamcol,.wvm-silh,.wvm-pad-glow,.wvm-ring-top,.wvm-beam-lines{animation:none}}
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
