/* World VR Mall — storefront builder v3 (shared by the mall and every store page)
   buildStore(app, store, { x, z, rot, placeholder }) → THREE.Group
   rot: 0 = door faces +Z, Math.PI = faces -Z, Math.PI/2 = faces +X, -Math.PI/2 = faces -X
   Footprint: 14 wide, 12 deep, 7 tall (size 'large' = 24×20×9, 'xl' = 30×24×11).

   v3 (Sept 2026): product popup restyled (blurred store, big floating product, BUY on the tenant's
   own domain, heart-save), neon marquee facades with chase lights, decorated store BACKS (art,
   ads, an eyetoad.com projector) so nothing looks unfinished from behind, shelves under wall cards,
   a 'clinic' layout for medical / dental tenants, shadows on everything. Signs read correctly
   from both sides. */
import { THREE, makePerson, makeSprite, makeTextTexture, pick, rand, esc, L, TEX_SCALE, canvasTex, isMobile } from './wvm-engine.js?v=11';

const T = THREE;
const hex = (s) => new T.Color(s);
export const STORE_W = 14, STORE_D = 12, STORE_H = 7;

/* ---------- textures ---------- */
export function logoTexture(logo, opts = {}) {
  const { w = 1024, h = 320 } = opts;
  const c = document.createElement('canvas'); c.width = Math.round(w * TEX_SCALE); c.height = Math.round(h * TEX_SCALE); const g = c.getContext('2d'); g.scale(TEX_SCALE, TEX_SCALE);
  g.fillStyle = logo.bg || '#0b1a3a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = logo.accent || '#fff'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = '200px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.fillText(logo.icon || '🏬', 40, h / 2 + 8);
  g.fillStyle = logo.fg || '#fff'; g.font = 'bold 130px Poppins, "Segoe UI", Arial, sans-serif';
  g.shadowColor = logo.accent || '#fff'; g.shadowBlur = 18;
  fitText(g, logo.text || '', 300, h / 2 - (logo.sub ? 55 : 0), w - 340, 130);
  g.shadowBlur = 0;
  if (logo.sub) { g.fillStyle = logo.accent || '#fff'; g.font = 'bold 64px Poppins, "Segoe UI", Arial, sans-serif'; fitText(g, logo.sub, 300, h / 2 + 70, w - 340, 64); }
  const t = canvasTex(c); t.anisotropy = isMobile() ? 1 : 4; return t;
}
function fitText(g, text, x, y, maxW, size) {
  let s = size; const fam = g.font.replace(/^(bold )?\d+px /, ''); const bold = g.font.startsWith('bold') ? 'bold ' : '';
  g.font = `${bold}${s}px ${fam}`; while (g.measureText(text).width > maxW && s > 20) { s -= 4; g.font = `${bold}${s}px ${fam}`; }
  g.fillText(text, x, y);
}
function cardTexture(p, colors) {
  const c = document.createElement('canvas'); c.width = Math.round(512 * TEX_SCALE); c.height = Math.round(512 * TEX_SCALE); const g = c.getContext('2d'); g.scale(TEX_SCALE, TEX_SCALE);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = colors.trim || '#38f0ff'; g.fillRect(0, 0, 512, 18);
  g.font = '150px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.icon || '🛍️', 256, 130);
  g.fillStyle = '#0b1a3a'; wrap(g, p.title, 256, 290, 440, 'bold 38px Poppins, "Segoe UI", Arial', 46);
  g.fillStyle = colors.trim || '#38f0ff'; g.font = 'bold 44px Poppins, "Segoe UI", Arial'; g.fillText(p.price || '', 256, 400);
  g.fillStyle = '#0b1a3a'; g.font = '26px Poppins, "Segoe UI", Arial'; g.fillText('tap to view', 256, 468);
  return canvasTex(c);
}
function wrap(g, text, x, y, maxW, font, lh) {
  g.font = font; const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line);
  const y0 = y - (lines.length - 1) * lh / 2; lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
}
function priceTag(text, trim) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = trim || '#38f0ff'; roundRect(g, 0, 0, 512, 128, 40); g.fill();
  g.fillStyle = '#0b1a3a'; g.font = 'bold 60px Poppins, "Segoe UI", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = 60; while (g.measureText(text).width > 470 && s > 24) { s -= 4; g.font = `bold ${s}px Poppins, "Segoe UI", Arial`; }
  g.fillText(text, 256, 66);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const imgLoader = new T.TextureLoader(); imgLoader.setCrossOrigin('anonymous');
const host = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
/* Chase-light marquee texture: animated by shifting texture offset each frame. */
function marqueeTexture(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#0b1a3a'; g.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? color : '#fff6c0'; g.beginPath(); g.arc(16 + i * 32, 16, 9, 0, Math.PI * 2); g.fill(); }
  const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; return t;
}
/* Art for the backs of stores: abstract canvas paintings generated on the fly (no files, no copyright). */
function artTexture(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const g = c.getContext('2d');
  let s = Math.abs(Math.round(seed)) % 233280; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pal = pick([['#ff4f79', '#ffd23f', '#38f0ff', '#0b1a3a'], ['#7cff6b', '#b08cff', '#ffffff', '#1e2a4a'], ['#ff8a3d', '#f2b5d4', '#38f0ff', '#111827'], ['#ffd23f', '#ff4f79', '#2f6bff', '#ffffff']]);
  g.fillStyle = pal[3]; g.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 14; i++) { g.fillStyle = pal[i % 3]; g.globalAlpha = 0.55 + rnd() * 0.45; g.beginPath(); const x = rnd() * 512, y = rnd() * 384, r = Math.abs(30 + rnd() * 130); if (rnd() < 0.5) g.arc(x, y, r, 0, Math.PI * 2); else g.rect(x - r / 2, y - r / 3, r, r * 0.66); g.fill(); }
  g.globalAlpha = 1; g.lineWidth = 8; g.strokeStyle = pal[2]; g.beginPath(); g.moveTo(rnd() * 512, rnd() * 384); for (let i = 0; i < 5; i++) g.quadraticCurveTo(rnd() * 512, rnd() * 384, rnd() * 512, rnd() * 384); g.stroke();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/* ---------- interior variety: each store gets its own floor, wall band, lamps and props, seeded by its slug ---------- */
function hashStr(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h; }
function storeFloorTex(kind, trim) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  if (kind === 'wood') { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${40 + Math.random() * 15}%,${34 + Math.random() * 14}%)`; g.fillRect(0, i * 32, 256, 32); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, i * 32, 256, 1); for (let k = 0; k < 20; k++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(Math.random() * 256, i * 32 + Math.random() * 30, 40 + Math.random() * 80, 1); } } }
  else if (kind === 'marble') { g.fillStyle = '#eef1f6'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(120,130,150,.35)'; g.lineWidth = 1.5; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(Math.random() * 256, Math.random() * 256); for (let k = 0; k < 4; k++) g.quadraticCurveTo(Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256); g.stroke(); } g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); }
  else if (kind === 'tile') { for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#dfe5ef' : '#f4f7fb'; g.fillRect(x * 64, y * 64, 64, 64); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x * 64, y * 64, 64, 2); g.fillRect(x * 64, y * 64, 2, 64); } }
  else if (kind === 'carpet') { g.fillStyle = trim; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } }
  else if (kind === 'concrete') { g.fillStyle = '#9aa0ab'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${40 + Math.random() * 60},${40 + Math.random() * 60},${50 + Math.random() * 60},.25)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(2, 2, 252, 252); }
  else { g.fillStyle = '#1a1f2e'; g.fillRect(0, 0, 256, 256); g.strokeStyle = trim; g.lineWidth = 2; g.globalAlpha = 0.6; for (let i = 0; i < 4; i++) g.strokeRect(i * 64 + 4, 4, 56, 248); g.globalAlpha = 1; }
  const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}
function decorate(g, store, W, D, H, colors, M, app, box) {
  const h = hashStr(store.slug || store.name); const kinds = ['wood', 'marble', 'tile', 'carpet', 'concrete', 'neon']; const kind = store.floorKind || kinds[h % kinds.length];
  const ft = storeFloorTex(kind, colors.trim); ft.repeat.set(W / 3, D / 3);
  const fl = new T.Mesh(new T.PlaneGeometry(W - 0.4, D - 0.4), M(0xffffff, { map: ft, roughness: kind === 'marble' ? 0.15 : 0.7, metalness: kind === 'marble' ? 0.2 : 0 })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.025, -D / 2); fl.receiveShadow = true; g.add(fl);
  // wall band + wainscot
  const bandY = 3.2 + (h % 3) * 0.6; const band = new T.Mesh(new T.BoxGeometry(W - 0.5, 0.25, 0.08), new T.MeshStandardMaterial({ color: hex(colors.trim), emissive: hex(colors.trim), emissiveIntensity: 0.5 })); band.position.set(0, bandY, -D + 0.2); g.add(band);
  for (const sx of [-1, 1]) { const b2 = band.clone(); b2.geometry = new T.BoxGeometry(0.08, 0.25, D - 0.5); b2.position.set(sx * (W / 2 - 0.2), bandY, -D / 2); g.add(b2); }
  // pendant lamps in a pattern that differs per store
  const lampStyle = h % 4; const rows = Math.max(2, Math.round(D / 6)), cols = Math.max(2, Math.round(W / 7));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -W / 2 + (c + 0.5) * W / cols, z = -(r + 0.5) * D / rows; const cord = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 1.6, 4), M(0x222222)); cord.position.set(x, H - 0.85, z); g.add(cord); let lamp; if (lampStyle === 0) lamp = new T.Mesh(new T.SphereGeometry(0.28, 12, 10), new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.6 })); else if (lampStyle === 1) lamp = new T.Mesh(new T.ConeGeometry(0.4, 0.4, 12, 1, true), new T.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c0, emissiveIntensity: 0.8, side: T.DoubleSide })); else if (lampStyle === 2) lamp = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.22, 16), new T.MeshStandardMaterial({ color: hex(colors.trim), emissive: hex(colors.trim), emissiveIntensity: 1.2 })); else lamp = new T.Mesh(new T.BoxGeometry(1.4, 0.08, 0.18), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4 })); lamp.position.set(x, H - 1.7, z); g.add(lamp); }
  // props: rug, plants, bench, a mannequin or a display table depending on the hash
  const rug = new T.Mesh(new T.CircleGeometry(1.8 + (h % 3) * 0.5, 24), M(hex(colors.trim), { roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.03, -2.6); rug.material.transparent = true; rug.material.opacity = 0.75; if (h % 5 !== 2) g.add(rug);
  const plantN = 1 + (h % 3); for (let i = 0; i < plantN; i++) { const px = (i % 2 ? 1 : -1) * (W / 2 - 1.2), pz = -D + 1.2 - i * 0.2; const pot = new T.Mesh(new T.CylinderGeometry(0.4, 0.32, 0.7, 10), M(pick([0xd9cbb0, 0x1e2a4a, 0xffffff]))); pot.position.set(px, 0.35, pz); g.add(pot); const leaf = new T.Mesh(new T.ConeGeometry(0.75, 2.0 + (h % 4) * 0.3, 8), M(pick([0x3fa34d, 0x2f8f6a, 0x6fbf4a]))); leaf.position.set(px, 1.7, pz); leaf.castShadow = true; g.add(leaf); }
  if (h % 4 === 0) { const bench = new T.Mesh(new T.BoxGeometry(2.4, 0.45, 0.8), M(0x8a5a2b, { roughness: 0.8 })); bench.position.set(0, 0.5, -D / 2 - 1); g.add(bench); for (const sx of [-1, 1]) { const leg = new T.Mesh(new T.BoxGeometry(0.1, 0.5, 0.7), M(0x1e2a4a)); leg.position.set(sx * 1.05, 0.25, -D / 2 - 1); g.add(leg); } box(0, -D / 2 - 1, 1.3, 0.5); }
  if (h % 4 === 1) { const dt = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 0.1, 20), M(0xffffff, { roughness: 0.2 })); dt.position.set(0, 0.95, -D / 2 - 1); g.add(dt); const dl = new T.Mesh(new T.CylinderGeometry(0.15, 0.4, 0.9, 10), M(0x9aa7c7, { metalness: 0.8 })); dl.position.set(0, 0.45, -D / 2 - 1); g.add(dl); box(0, -D / 2 - 1, 1.2, 1.2); }
  if (h % 4 === 2) { const mq = makePerson({ bag: false, skin: 0xdddddd, hair: 0xdddddd, hairStyle: 'bald', shirt: hex(colors.trim).getHex(), pants: 0xffffff }); mq.position.set(W / 2 - 2.2, 0.35, -2.2); mq.rotation.y = -0.6; g.add(mq); const base = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.35, 16), M(0x1e2a4a)); base.position.set(W / 2 - 2.2, 0.17, -2.2); g.add(base); box(W / 2 - 2.2, -2.2, 0.7, 0.7); }
  if (h % 4 === 3) { const aq = new T.Mesh(new T.BoxGeometry(2.6, 1.2, 0.9), new T.MeshPhysicalMaterial({ color: 0x38b6ff, transparent: true, opacity: 0.35, roughness: 0.05 })); aq.position.set(-W / 2 + 2, 1.3, -D + 1.2); g.add(aq); const stand = new T.Mesh(new T.BoxGeometry(2.7, 0.7, 1.0), M(0x1e2a4a)); stand.position.set(-W / 2 + 2, 0.35, -D + 1.2); g.add(stand); const fish = []; for (let i = 0; i < 5; i++) { const f = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), new T.MeshStandardMaterial({ color: pick([0xff8a3d, 0xffd23f, 0xffffff, 0x38f0ff]), emissive: 0x222222 })); f.scale.set(1.6, 1, 0.6); f.userData.o = Math.random() * 6; aq.add(f); fish.push(f); } app.onUpdate((dt, t) => { for (const f of fish) { f.position.set(Math.sin(t * 0.7 + f.userData.o) * 1.1, Math.sin(t * 1.3 + f.userData.o) * 0.35, Math.cos(t * 0.9 + f.userData.o) * 0.3); f.rotation.y = Math.cos(t * 0.7 + f.userData.o) > 0 ? 0 : Math.PI; } }); box(-W / 2 + 2, -D + 1.2, 1.5, 0.7); }
}

/* ---------- filler goods: colorful boxes, bottles, cans that make shelves look stocked ---------- */
function filler(colors) {
  const g = new T.Group(); const M = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.55 });
  const palette = [hex(colors.trim).getHex(), 0xffffff, 0xffd23f, 0xff8a3d, 0x9ad0ff, 0xf2b5d4, 0x7cff6b, 0xb08cff];
  const kind = pick(['box', 'bottle', 'can', 'bag', 'jar']);
  if (kind === 'box') { const h = rand(0.35, 0.6); const b = new T.Mesh(new T.BoxGeometry(rand(0.3, 0.5), h, 0.3), M(pick(palette))); b.position.y = h / 2; g.add(b); const lbl = new T.Mesh(new T.PlaneGeometry(0.22, 0.14), M(0xffffff)); lbl.position.set(0, h / 2, 0.16); g.add(lbl); }
  else if (kind === 'bottle') { const b = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, 0.42, 10), M(pick(palette))); b.position.y = 0.21; g.add(b); const neck = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.14, 8), b.material); neck.position.y = 0.48; g.add(neck); const cap = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.05, 8), M(0x222222)); cap.position.y = 0.57; g.add(cap); }
  else if (kind === 'can') { const c = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.3, 12), M(pick(palette))); c.position.y = 0.15; g.add(c); const top = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.02, 12), M(0xcccccc)); top.position.y = 0.31; g.add(top); }
  else if (kind === 'bag') { const b = new T.Mesh(new T.BoxGeometry(0.3, 0.42, 0.12), M(pick(palette))); b.position.y = 0.21; g.add(b); const h = new T.Mesh(new T.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), M(0x222222)); h.position.y = 0.45; g.add(h); }
  else { const j = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.28, 12), new T.MeshPhysicalMaterial({ color: pick(palette), transparent: true, opacity: 0.7, roughness: 0.1 })); j.position.y = 0.14; g.add(j); const lid = new T.Mesh(new T.CylinderGeometry(0.135, 0.135, 0.05, 12), M(0x8a5a2b)); lid.position.y = 0.3; g.add(lid); }
  return g;
}

/* ---------- lead form (hardened) ---------- */
const LF = { a: 'aHR0cHM6Ly9mb3Jtc3VibWl0LmNvLw==', u: 'aW5mbw==', d: 'ZXlldG9hZC5jb20=' };
let humanInput = false; const markHuman = () => { humanInput = true; };
if (typeof window !== 'undefined') { addEventListener('keydown', markHuman, { once: true }); addEventListener('pointerdown', markHuman, { once: true }); }
const inp = 'style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(124,248,255,.4);background:#050b1c;color:#fff;font:inherit;font-size:15px"';
const lbl = 'style="display:block;font-size:13px;font-weight:700;margin:8px 0 3px"';
export function leadForm(app, store, intro) {
  const t0 = Date.now(); const id = 'lf' + Math.floor(Math.random() * 1e6);
  const html = `<p>${esc(intro || `Tell ${store.name} what you need and a real person gets back to you. No spam, no pressure.`)}</p>
    <form id="${id}" novalidate>
      <label ${lbl}>Name *</label><input name="name" required autocomplete="name" ${inp}>
      <label ${lbl}>Phone *</label><input name="phone" type="tel" required autocomplete="tel" ${inp}>
      <label ${lbl}>Email</label><input name="email" type="email" autocomplete="email" ${inp}>
      <label ${lbl}>What do you need?</label><textarea name="message" ${inp.replace('padding:10px', 'min-height:70px;padding:10px')}></textarea>
      <div style="display:none"><input name="_honey" tabindex="-1" autocomplete="off"></div>
      <input type="hidden" name="_subject" value="World VR Mall lead — ${esc(store.name)}"><input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="store" value="${esc(store.name)}"><input type="hidden" name="store_site" value="${esc(store.url || '')}">
      <div id="${id}-st" style="margin-top:8px;font-weight:700;min-height:20px"></div>
    </form>`;
  app.popup(`Get in touch with ${store.name}`, html, [{ label: 'Send it', keep: true, primary: true, fn: () => {
    const f = document.getElementById(id), st = document.getElementById(id + '-st'); if (!f) return;
    const name = f.name.value.trim(), phone = f.phone.value.trim();
    if (!name || !phone) { st.style.color = '#ff4f79'; st.textContent = 'Name and phone, please, so they can reach you.'; return; }
    if (f._honey.value || Date.now() - t0 < 3000 || !humanInput) { st.style.color = '#9fd3ff'; st.textContent = 'One sec, then try again.'; return; }
    const url = atob(LF.a) + atob(LF.u) + String.fromCharCode(64) + atob(LF.d);
    st.style.color = '#9fd3ff'; st.textContent = 'Sending…';
    fetch(url, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : Promise.reject(r)).then(() => { st.style.color = '#7cff6b'; st.textContent = 'Sent! Expect a call or email within one business day.'; }).catch(() => { st.style.color = '#ffd23f'; st.textContent = 'Could not confirm delivery. ' + (store.phone ? 'Please call ' + store.phone + '.' : 'Please use the website instead.'); });
  } }, ...(store.phone ? [{ label: '📞 ' + store.phone, href: 'tel:' + store.phone.replace(/[^\d+]/g, ''), newTab: true }] : [])]);
}

/* ---------- the store ---------- */
export function buildStore(app, store, opts = {}) {
  const { x = 0, z = 0, rot = 0, placeholder = false, label = true, storePage = true, welcome = true, back = true } = opts;
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.userData.store = store;
  const colors = store.colors || { wall: '#123', floor: '#0b1a3a', trim: '#38f0ff' };
  const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const trim = hex(colors.trim), trimHex = trim.getHex();
  const big = store.size === 'large' || store.size === 'xl'; const xl = store.size === 'xl';
  const W = xl ? 30 : big ? 24 : STORE_W, D = xl ? 24 : big ? 20 : STORE_D, H = xl ? 11 : big ? 9 : STORE_H, hw = W / 2;
  const demo = !!store.demo; const layout = store.layout || 'shelves';
  g.userData.dims = { W, D, H };
  const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // floor + walls + ceiling
  const floor = new T.Mesh(new T.PlaneGeometry(W, D), M(hex(colors.floor), { roughness: 0.35, metalness: 0.2 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.02, -D / 2); floor.receiveShadow = true; g.add(floor);
  const wallM = M(hex(colors.wall));
  const backW = sh(new T.Mesh(new T.BoxGeometry(W, H, 0.3), wallM)); backW.position.set(0, H / 2, -D); g.add(backW);
  for (const sx of [-1, 1]) { const side = sh(new T.Mesh(new T.BoxGeometry(0.3, H, D), wallM)); side.position.set(sx * hw, H / 2, -D / 2); g.add(side); }
  const ceil = new T.Mesh(new T.PlaneGeometry(W, D), M(0xffffff, { side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: placeholder ? 0.15 : 0.35 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.05, -D / 2); g.add(ceil);
  const roof = new T.Mesh(new T.BoxGeometry(W + 0.6, 0.3, D + 0.6), M(0x2a3350, { roughness: 0.9 })); roof.position.set(0, H + 0.1, -D / 2); roof.receiveShadow = true; g.add(roof);
  for (const zz of (big ? [-3, -7, -11, -15] : [-3, -6, -9])) { const strip = new T.Mesh(new T.BoxGeometry(W - 2, 0.1, 0.3), new T.MeshBasicMaterial({ color: placeholder ? 0x445 : 0xffffff })); strip.position.set(0, H - 0.2, zz); g.add(strip); }
  const runner = new T.Mesh(new T.PlaneGeometry(3.2, D - 1), M(trimHex, { emissive: trimHex, emissiveIntensity: 0.15, roughness: 0.6 })); runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.035, -D / 2 + 0.3); if (placeholder) g.add(runner);

  // facade: header + logo, URL bar, glass, door mat, plants, neon marquee
  const header = sh(new T.Mesh(new T.BoxGeometry(W + 0.6, 2.2, 0.6), M(hex(store.logo?.bg || colors.wall), { roughness: 0.4 }))); header.position.set(0, H - 1.1, 0.3); g.add(header);
  const logo = new T.Mesh(new T.PlaneGeometry(W - 1, 1.9), new T.MeshBasicMaterial({ map: logoTexture(store.logo || { text: store.name }) })); logo.position.set(0, H - 1.1, 0.62); g.add(logo);
  const trimBar = new T.Mesh(new T.BoxGeometry(W + 0.6, 0.15, 0.7), new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: placeholder ? 0.3 : 1.2 })); trimBar.position.set(0, H - 2.25, 0.3); g.add(trimBar);
  if (!placeholder) {
    // chase lights around the logo, and a neon glow line that breathes
    const mq = new T.Mesh(new T.PlaneGeometry(W + 0.4, 0.28), new T.MeshBasicMaterial({ map: marqueeTexture(colors.trim) })); mq.material.map.repeat.set((W + 0.4) / 2, 1); mq.position.set(0, H + 0.06, 0.62); g.add(mq);
    const mq2 = mq.clone(); mq2.position.y = H - 2.3; mq2.position.z = 0.66; g.add(mq2);
    app.onUpdate((dt, t) => { mq.material.map.offset.x = Math.floor(t * 6) / 8; trimBar.material.emissiveIntensity = 0.9 + Math.sin(t * 2.2 + x) * 0.5; });
    if (store.neon) { const ns = new T.Mesh(new T.PlaneGeometry(Math.min(W - 1, 14), 1.7), new T.MeshBasicMaterial({ map: makeTextTexture(store.neon, { w: 1400, h: 180, bg: 'rgba(0,0,0,0)', fg: colors.trim, accent: colors.trim, border: null, glow: true, font: 'bold 120px Poppins, Segoe UI, Arial', radius: 0 }), transparent: true })); ns.position.set(0, H + 1.3, 0.4); g.add(ns); const ns2 = ns.clone(); ns2.rotation.y = Math.PI; ns2.position.z = 0.38; g.add(ns2); const halo = new T.Mesh(new T.PlaneGeometry(Math.min(W - 1, 14) + 1.5, 2.6), new T.MeshBasicMaterial({ color: hex(colors.trim), transparent: true, opacity: 0.18 })); halo.position.set(0, H + 1.3, 0.3); g.add(halo); app.onUpdate((dt, t) => { const flick = Math.random() < 0.015 ? 0.35 : 0.85 + Math.sin(t * 5) * 0.15; ns.material.opacity = flick; halo.material.opacity = 0.1 + flick * 0.15; halo.scale.setScalar(1 + Math.sin(t * 3) * 0.04); }); }
  }
  if (!placeholder && store.url && store.url.startsWith('http')) {
    const urlBar = new T.Mesh(new T.PlaneGeometry(W - 3, 0.8), new T.MeshBasicMaterial({ map: makeTextTexture(host(store.url), { w: 1600, h: 128, bg: colors.trim, fg: '#04122a', border: null, glow: false, font: 'bold 84px Poppins, Segoe UI, Arial', radius: 40 }), transparent: true })); urlBar.position.set(0, H - 2.75, 0.62); g.add(urlBar);
    app.addHotspot(urlBar, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: [{ label: store.cta || 'Visit ' + host(store.url), href: store.url, newTab: true, primary: true }] });
  }
  const glassM = new T.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false, envMapIntensity: 1.6 });
  for (const sx of [-1, 1]) { const pane = new T.Mesh(new T.BoxGeometry(hw - 2.2, H - 2.9, 0.12), glassM); pane.position.set(sx * (hw - (hw - 2.2) / 2), (H - 2.9) / 2, 0); g.add(pane); const frame = sh(new T.Mesh(new T.BoxGeometry(0.16, H - 2.9, 0.3), M(0x1e2a4a, { metalness: 0.6 }))); frame.position.set(sx * 2.2, (H - 2.9) / 2, 0); g.add(frame); }
  const mat = new T.Mesh(new T.PlaneGeometry(4, 1.6), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: placeholder ? 0.25 : 0.7 })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.03, 0.9); g.add(mat);
  for (const sx of [-1, 1]) { const pot = sh(new T.Mesh(new T.CylinderGeometry(0.35, 0.28, 0.6, 10), M(0xd9cbb0))); pot.position.set(sx * (hw - 0.6), 0.3, 0.9); g.add(pot); const leaf = sh(new T.Mesh(new T.SphereGeometry(0.55, 8, 6), M(0x3fa34d))); leaf.position.set(sx * (hw - 0.6), 0.95, 0.9); g.add(leaf); }
  const plaque = makeSprite(`${store.flag || '🏬'} ${store.city || ''}`, { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); plaque.position.set(0, H + 1.2, 0.5); if (label) g.add(plaque);

  // ----- the BACK of the store: never a blank wall. Art, an ad, or the eyetoad.com projector. -----
  if (back) {
    const kind = store.back || pick(['art', 'ad', 'projector', 'art', 'mural']);
    const bz = -D - 0.2; const addBack = (mesh) => { mesh.rotation.y = Math.PI; mesh.position.z = bz; g.add(mesh); return mesh; };
    if (kind === 'art') {
      for (let i = 0; i < (big ? 3 : 2); i++) { const fr = addBack(new T.Mesh(new T.BoxGeometry(4.2, 3.2, 0.12), M(0x2a1a10, { roughness: 0.6 }))); fr.position.set(-(big ? 8 : 3.5) + i * (big ? 8 : 7), H * 0.55, bz - 0.06); const art = addBack(new T.Mesh(new T.PlaneGeometry(3.8, 2.8), new T.MeshBasicMaterial({ map: artTexture(Math.round(x * 7 + z * 13 + i * 31)) }))); art.position.set(fr.position.x, H * 0.55, bz - 0.14); }
    } else if (kind === 'ad') {
      const ad = store.backAd || { lines: ['SEO CAMPAIGN', '10% OFF', 'eyetoad.com'], bg: '#0b1a3a', accent: '#ffd23f' };
      const p = addBack(new T.Mesh(new T.PlaneGeometry(W - 3, (W - 3) * 0.45), new T.MeshBasicMaterial({ map: makeTextTexture(ad.lines, { w: 1600, h: 720, bg: ad.bg, fg: '#fff', accent: ad.accent, font: 'bold 150px Poppins, Segoe UI, Arial', border: ad.accent, radius: 30 }) }))); p.position.set(0, H * 0.55, bz - 0.12);
      app.addHotspot(p, { title: ad.title || 'Eye To Ad Media', html: `<p>${esc(ad.about || 'Get found on Google and in AI answers. Show this ad for 10% off any SEO campaign.')}</p>`, actions: [{ label: ad.cta || 'eyetoad.com', href: ad.url || 'https://eyetoad.com', newTab: true, primary: true }] });
    } else if (kind === 'projector') {
      const screen = addBack(new T.Mesh(new T.PlaneGeometry(W - 3, (W - 3) * 0.5625), new T.MeshBasicMaterial({ map: makeTextTexture(['eyetoad.com', 'Denver SEO · AI Optimization', '10% off with this ad'], { w: 1600, h: 900, bg: '#050b1c', fg: '#fff', accent: '#38f0ff', font: 'bold 120px Poppins, Segoe UI, Arial', border: null, radius: 0 }), transparent: true }))); screen.position.set(0, H * 0.55, bz - 0.12);
      const proj = new T.Mesh(new T.BoxGeometry(0.5, 0.3, 0.6), M(0x222222, { metalness: 0.7 })); proj.position.set(0, H - 0.6, bz - 5); g.add(proj);
      const cone = new T.Mesh(new T.ConeGeometry((W - 3) / 2 * 0.98, 5, 4, 1, true), new T.MeshBasicMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.08, side: T.DoubleSide, depthWrite: false })); cone.rotation.x = -Math.PI / 2; cone.rotation.y = Math.PI / 4; cone.position.set(0, H * 0.55, bz - 2.5); cone.scale.set(1, 1, 0.56); g.add(cone);
      app.onUpdate((dt, t) => { screen.material.opacity = 0.85 + Math.sin(t * 24) * 0.05; cone.material.opacity = 0.06 + Math.sin(t * 18) * 0.02; });
      app.addHotspot(screen, { title: 'Eye To Ad Media', html: '<p>Denver SEO, AI optimization and websites that bring customers. Show this ad for 10% off any SEO campaign.</p>', actions: [{ label: 'eyetoad.com', href: 'https://eyetoad.com', newTab: true, primary: true }] });
    } else {
      const mural = addBack(new T.Mesh(new T.PlaneGeometry(W - 1, H - 1), new T.MeshBasicMaterial({ map: artTexture(Math.round(x * 3 + z * 5)) }))); mural.position.set(0, H / 2, bz - 0.12);
    }
    const vent = sh(new T.Mesh(new T.BoxGeometry(1.4, 0.8, 0.8), M(0x9aa7c7, { metalness: 0.6 }))); vent.position.set(hw - 1.5, H + 0.6, -D / 2 - 2); g.add(vent);
  }

  // obstacles (world space)
  const c0 = Math.cos(rot), s0 = Math.sin(rot); const toW = (px, pz) => [x + px * c0 + pz * s0, z - px * s0 + pz * c0];
  const box = (lx, lz, lhw, lhd) => {
    const k = Math.round(rot / (Math.PI / 2)) * Math.PI / 2;
    if (Math.abs(rot - k) < 0.01) { const [wx, wz] = toW(lx, lz); const quarter = Math.abs(Math.abs(k) - Math.PI / 2) < 0.01; app.addBox(wx, wz, quarter ? lhd : lhw, quarter ? lhw : lhd); return; }
    const along = lhw >= lhd ? 'x' : 'z', half = Math.max(lhw, lhd), r = Math.min(lhw, lhd) + 0.6, n = Math.max(1, Math.ceil(half / r));
    for (let i = 0; i <= n; i++) { const o = -half + (2 * half) * (i / n); const [wx, wz] = along === 'x' ? toW(lx + o, lz) : toW(lx, lz + o); app.addObstacle(wx, wz, r); }
  };
  box(-hw, -D / 2, 0.4, D / 2 + 0.3); box(hw, -D / 2, 0.4, D / 2 + 0.3); box(0, -D, hw + 0.3, 0.4);
  box(-(hw + 2.2) / 2, 0, (hw - 2.2) / 2, 0.3); box((hw + 2.2) / 2, 0, (hw - 2.2) / 2, 0.3);
  const doorWorld = toW(0, -1.6);
  if (!placeholder && !['cafe', 'market', 'garage', 'travel', 'tech'].includes(layout)) decorate(g, store, W, D, H, colors, M, app, box);

  if (placeholder) {
    const s1 = makeSprite('SPACE AVAILABLE', { scale: 8, bg: 'rgba(255,79,121,0.9)', fg: '#fff', accent: '#ffd23f' }); s1.position.set(0, 3.8, -4); g.add(s1);
    const s2 = makeSprite(`Reserved for a ${store.tag} brand from ${store.city}`, { scale: 9, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); s2.position.set(0, 2.6, -4); g.add(s2);
    for (const sx of [-1, 1]) for (const y of [1.0, 2.6]) { const shf = new T.Mesh(new T.BoxGeometry(0.9, 0.08, D - 3.5), M(0xdfe6f5)); shf.position.set(sx * (hw - 0.6), y, -D / 2 - 1.2); g.add(shf); }
    const hot = { title: `${store.name} — space available`, html: `<p>This storefront in the <b>${esc(wingName(store.wing))}</b> is reserved for a <b>${esc(store.tag)}</b> brand from <b>${esc(store.city)}</b>. It could be yours instead.</p><p>Ten-minute setup. Your logo, your products, buy buttons to your own site, an AI clerk, and a search-optimized store page. Premium spots go first come, first served.</p><p><b>360° Showroom upgrade:</b> a photo-real custom-built room with your products placed inside it (see the model showroom up front). Launch price $499/mo, 24-month minimum.</p>`, actions: [{ label: '📞 Claim this space: 1-800-481-8638', href: 'tel:18004818638', newTab: true, primary: true }, { label: 'Leasing details', href: '/lease/' }] };
    app.addHotspot(g, hot);
    return g;
  }

  const aboutActions = [{ label: store.cta || 'Visit website', href: store.url, newTab: !!(store.url && store.url.startsWith('http')), primary: true }, ...(store.lead ? [{ label: '✉️ Get in touch', fn: () => leadForm(app, store, store.leadIntro), keep: true }] : [])];
  const shelfM = M(0xdfe6f5, { metalness: 0.3, roughness: 0.4 }), lipM = new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.9 });
  const woodM = M(0x8a5a2b, { roughness: 0.9 }), darkM = M(0x1e2a4a, { metalness: 0.6, roughness: 0.3 });
  const slots = []; const used = new Set();
  const addCard = (p, i, s, scale = 1) => {
    const card = new T.Group(); card.position.set(s.x, s.y, s.z); card.rotation.y = s.rotY; card.scale.setScalar(scale);
    const frame = sh(new T.Mesh(new T.BoxGeometry(1.7, 1.7, 0.12), M(0xffffff, { roughness: 0.3 }))); card.add(frame);
    const face = new T.Mesh(new T.PlaneGeometry(1.55, 1.55), new T.MeshBasicMaterial({ map: cardTexture(p, colors) })); face.position.z = 0.07; card.add(face);
    if (p.img) { imgLoader.load(p.img, (tex) => { tex.colorSpace = T.SRGBColorSpace; face.material.map = tex; face.material.needsUpdate = true; const cap = new T.Mesh(new T.PlaneGeometry(1.55, 0.36), new T.MeshBasicMaterial({ map: priceTag(p.price || '', colors.trim), transparent: true })); cap.position.set(0, -0.62, 0.08); card.add(cap); }, undefined, () => { }); }
    const ring = new T.Mesh(new T.RingGeometry(1.0, 1.08, 32), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.35, side: T.DoubleSide })); ring.position.z = 0.05; card.add(ring);
    app.onUpdate((dt, t) => { ring.material.opacity = 0.2 + Math.sin(t * 2 + i) * 0.15; });
    // a shelf board under every wall card so nothing floats
    if (s.wall || s.side) { const board = sh(new T.Mesh(new T.BoxGeometry(2.0, 0.08, 0.55), shelfM)); board.position.set(0, -0.92, -0.18); card.add(board); const lip = new T.Mesh(new T.BoxGeometry(2.0, 0.05, 0.05), lipM); lip.position.set(0, -0.88, 0.1); card.add(lip); }
    g.add(card); app.addHotspot(card, { fn: (a) => showProduct(a, store, p) }); return card;
  };
  const fillGroup = (x, y, z, rotY, n = 4, spread = 0.6) => { const grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY; for (let k = 0; k < n; k++) { const f = filler(colors); f.position.set(-((n - 1) * spread) / 2 + k * spread, 0, rand(-0.15, 0.15)); grp.add(f); } g.add(grp); return grp; };
  const wallShelves = (levels = [0.95, 2.55], perLevel = 3) => {
    const len = D - 3.6; for (const sx of [-1, 1]) { for (const y of levels) { const shf = sh(new T.Mesh(new T.BoxGeometry(1.0, 0.08, len), shelfM)); shf.position.set(sx * (hw - 0.65), y, -D / 2 - 1.3); g.add(shf); const lip = new T.Mesh(new T.BoxGeometry(0.06, 0.06, len), lipM); lip.position.set(sx * (hw - 1.15), y + 0.05, -D / 2 - 1.3); g.add(lip); for (let k = 0; k < perLevel; k++) slots.push({ x: sx * (hw - 0.9), y: y + 0.95, z: -2.4 - k * (len - 1) / (perLevel - 1 || 1), rotY: sx * -Math.PI / 2, shelfY: y + 0.04, side: false }); } for (const zz of [-1.2, -D + 2.2]) { const col = sh(new T.Mesh(new T.BoxGeometry(0.3, 3.4, 0.3), M(0xffffff))); col.position.set(sx * (hw - 0.65), 1.7, zz); g.add(col); } }
    const backShelf = sh(new T.Mesh(new T.BoxGeometry(W - 3, 0.08, 0.9), shelfM)); backShelf.position.set(0, 2.2, -D + 0.6); g.add(backShelf);
    for (let k = 0; k < 3; k++) slots.push({ x: -(W - 6) / 2 + k * (W - 6) / 2, y: 3.15, z: -D + 0.65, rotY: 0, shelfY: 2.24, side: false });
    for (const sx of [-1, 1]) { const row = new T.Group(); row.position.set(sx * (hw - 0.5), 4.3, -D / 2 - 1.3); const rail = new T.Mesh(new T.BoxGeometry(0.6, 0.06, D - 4), shelfM); row.add(rail); for (let k = 0; k < Math.floor((D - 4) / 1.15); k++) { const f = filler(colors); f.position.set(0, 0.03, -(D - 4) / 2 + 0.6 + k * 1.15); f.rotation.y = sx * -Math.PI / 2; row.add(f); } g.add(row); }
  };
  const pedestal = (x, z, h = 1.0, r = 0.6) => { const p = sh(new T.Mesh(new T.CylinderGeometry(r, r + 0.1, h, 16), M(0xffffff, { roughness: 0.3, metalness: 0.2 }))); p.position.set(x, h / 2, z); g.add(p); const ring = new T.Mesh(new T.TorusGeometry(r + 0.05, 0.04, 6, 24), lipM); ring.rotation.x = Math.PI / 2; ring.position.set(x, h, z); g.add(ring); box(x, z, r + 0.2, r + 0.2); return p; };
  const products = (store.products || []);
  if (layout === 'showroom') {
    const rows = big ? 3 : 2, cols = big ? 6 : 4; const zx = -3.2, dz = (D - 6) / (cols - 1 || 1), dx = (W - 6) / (rows - 1 || 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -(W - 6) / 2 + r * dx, z = zx - c * dz; pedestal(x, z, 0.9, 0.7); slots.push({ x, y: 1.85, z, rotY: 0, shelfY: 0.94, side: false, ped: true }); }
    for (const sx of [-1, 1]) for (const y of [1.6, 3.6]) for (let k = 0; k < (big ? 7 : 4); k++) slots.push({ x: sx * (hw - 0.4), y, z: -1.8 - k * (D - 3) / (big ? 7 : 4), rotY: sx * -Math.PI / 2, shelfY: y - 0.9, side: true, wall: true });
    const aisleSign = (x, z, t) => { const sg = new T.Mesh(new T.PlaneGeometry(4, 0.8), new T.MeshBasicMaterial({ map: makeTextTexture(t, { w: 1024, h: 200, bg: colors.trim, fg: '#04122a', border: null, glow: false, font: 'bold 96px Poppins, Segoe UI, Arial', radius: 30 }), transparent: true })); sg.position.set(x, H - 1.2, z); g.add(sg); const sg2 = sg.clone(); sg2.rotation.y = Math.PI; sg2.position.z = z - 0.01; g.add(sg2); const c = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.2, 4), M(0x9aa7c7)); c.position.set(x, H - 0.5, z); g.add(c); };
    if (big) { aisleSign(-(W - 6) / 2, -3, store.aisles?.[0] || 'SHOWER PANS'); aisleSign(0, -3, store.aisles?.[1] || 'FULL PACKAGES'); aisleSign((W - 6) / 2, -3, store.aisles?.[2] || 'DESIGNER SYSTEMS'); }
    const cats = ['pan', 'package', 'service']; const ordered = products.slice().sort((a, b) => cats.indexOf(a.cat || 'pan') - cats.indexOf(b.cat || 'pan'));
    ordered.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, sl.wall ? 1.1 : 0.95); });
    if (/shower|bath|tub/i.test((store.tag || '') + ' ' + store.name)) {
    const unit = new T.Group(); unit.position.set(hw - 3.2, 0, -D + 3.6); const pan = sh(new T.Mesh(new T.BoxGeometry(2.4, 0.15, 2.0), M(0xffffff, { roughness: 0.2 }))); pan.position.y = 0.08; unit.add(pan); const wall1 = sh(new T.Mesh(new T.BoxGeometry(2.4, 2.2, 0.1), M(0xe4ecff, { roughness: 0.3 }))); wall1.position.set(0, 1.2, -1); unit.add(wall1); const wall2 = sh(new T.Mesh(new T.BoxGeometry(0.1, 2.2, 2), wall1.material)); wall2.position.set(-1.2, 1.2, 0); unit.add(wall2); const gl = new T.Mesh(new T.BoxGeometry(0.05, 2.1, 2), glassM); gl.position.set(1.2, 1.2, 0); unit.add(gl); const head = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.04, 12), M(0xdddddd, { metalness: 0.9 })); head.position.set(0, 2.1, -0.6); unit.add(head); const bar = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.8, 8), head.material); bar.rotation.z = Math.PI / 2; bar.position.set(-1.1, 1.1, 0.3); unit.add(bar); g.add(unit); box(hw - 3.2, -D + 3.6, 1.4, 1.2);
    app.addHotspot(unit, { title: 'Display unit', html: '<p>A barrier-free shower: zero-threshold pan, wall panels, grab bar, glass. This is the kind of thing that makes a bathroom safe to age in.</p>', actions: [{ label: store.cta || 'See all showers', href: store.url, newTab: true, primary: true }] }); }
  } else if (layout === 'boutique') {
    for (const sx of [-1, 1]) { for (let k = 0; k < 2; k++) { const z = -3 - k * 4; const rack = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 3, 6), M(0xdddddd, { metalness: 0.9 })); rack.rotation.x = Math.PI / 2; rack.position.set(sx * (hw - 1.6), 1.7, z); g.add(rack); for (const lx of [-1, 1]) { const leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.7, 6), rack.material); leg.position.set(sx * (hw - 1.6), 0.85, z + lx * 1.4); g.add(leg); } for (let h = 0; h < 6; h++) { const shirt = sh(new T.Mesh(new T.BoxGeometry(0.5, 0.7, 0.06), M(pick([hex(colors.trim).getHex(), 0xffffff, 0x1e2a4a, 0xf2b5d4, 0xffd23f, 0x2b8a3e])))); shirt.position.set(sx * (hw - 1.6), 1.3, z - 1.2 + h * 0.45); g.add(shirt); const hanger = new T.Mesh(new T.TorusGeometry(0.06, 0.01, 4, 8), rack.material); hanger.position.set(sx * (hw - 1.6), 1.68, z - 1.2 + h * 0.45); g.add(hanger); } box(sx * (hw - 1.6), z, 0.4, 1.6); } }
    const table = sh(new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.1, 24), woodM)); table.position.set(0, 0.9, -D / 2 - 1); g.add(table); const tl = new T.Mesh(new T.CylinderGeometry(0.15, 0.3, 0.9, 10), woodM); tl.position.set(0, 0.45, -D / 2 - 1); g.add(tl); box(0, -D / 2 - 1, 1.7, 1.7);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; slots.push({ x: Math.cos(a) * 1.0, y: 1.9, z: -D / 2 - 1 + Math.sin(a) * 1.0, rotY: -a + Math.PI / 2, shelfY: 0.95, side: false }); }
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) slots.push({ x: sx * (hw - 0.4), y: 3.6, z: -2.5 - k * 5, rotY: sx * -Math.PI / 2, shelfY: 2.7, side: true });
    const mirror = new T.Mesh(new T.PlaneGeometry(2.2, 4.4), new T.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 1, roughness: 0.05, envMapIntensity: 2 })); mirror.position.set(-hw + 0.2, 2.6, -D + 3.5); mirror.rotation.y = Math.PI / 2; g.add(mirror); const mf = new T.Mesh(new T.BoxGeometry(0.1, 4.6, 2.4), M(0xffd23f, { metalness: 0.8 })); mf.position.set(-hw + 0.15, 2.6, -D + 3.5); g.add(mf);
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, sl.side ? 1 : 0.8); });
  } else if (layout === 'cafe') {
    const cnt = sh(new T.Mesh(new T.BoxGeometry(W - 4, 1.1, 1.4), M(hex(colors.trim).getHex(), { roughness: 0.4 }))); cnt.position.set(0, 0.55, -3.5); g.add(cnt); const top = new T.Mesh(new T.BoxGeometry(W - 3.8, 0.12, 1.6), woodM); top.position.set(0, 1.16, -3.5); g.add(top); box(0, -3.5, (W - 4) / 2, 0.8);
    const menuTex = (() => { const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const gg = c.getContext('2d'); gg.fillStyle = '#111'; gg.fillRect(0, 0, 1400, 900); gg.fillStyle = colors.trim; gg.font = 'bold 84px Poppins, Segoe UI, Arial'; gg.textAlign = 'center'; gg.fillText('MENU', 700, 100); gg.font = '52px Poppins, Segoe UI, Arial'; gg.textAlign = 'left'; products.slice(0, 10).forEach((p, i) => { const col = i < 5 ? 60 : 720, row = 210 + (i % 5) * 130; gg.fillStyle = '#fff'; gg.fillText((p.icon || '•') + ' ' + p.title.slice(0, 22), col, row); gg.fillStyle = colors.trim; gg.textAlign = 'right'; gg.fillText(p.price || '', col + 600, row); gg.textAlign = 'left'; }); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const board = new T.Mesh(new T.PlaneGeometry(W - 5, (W - 5) * 0.64), new T.MeshBasicMaterial({ map: menuTex })); board.position.set(0, H - 2.4 - (W - 5) * 0.32 + 1.2, -D + 0.2); g.add(board);
    app.addHotspot(board, { fn: (a) => a.popup(store.name + ' · Menu', products.map(p => `<p style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1);padding:6px 0"><span>${esc(p.icon || '')} ${esc(p.title)}<br><small class="muted">${esc(p.desc || '')}</small></span><b style="color:#7cf8ff">${esc(p.price || '')}</b></p>`).join(''), [{ label: demo ? '🏬 Put my restaurant here' : (store.cta || 'Order / reserve'), href: demo ? '/lease/' : store.url, newTab: !demo, primary: true }]) });
    for (let k = 0; k < 5; k++) { const st = sh(new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.1, 12), M(0xff4f79))); st.position.set(-(W - 6) / 2 + k * (W - 6) / 4, 0.7, -1.9); g.add(st); const sl = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, 0.7, 8), darkM); sl.position.set(st.position.x, 0.35, -1.9); g.add(sl); }
    for (const [tx, tz] of [[-(hw - 3), -D + 4], [(hw - 3), -D + 4], [0, -D + 6.5]]) { const tb = sh(new T.Mesh(new T.CylinderGeometry(1, 1, 0.08, 16), woodM)); tb.position.set(tx, 0.85, tz); g.add(tb); const leg = new T.Mesh(new T.CylinderGeometry(0.08, 0.2, 0.85, 8), darkM); leg.position.set(tx, 0.42, tz); g.add(leg); for (let c = 0; c < 3; c++) { const ca = c * 2.1; const ch = sh(new T.Mesh(new T.BoxGeometry(0.45, 0.45, 0.45), M(0xffffff))); ch.position.set(tx + Math.cos(ca) * 1.5, 0.4, tz + Math.sin(ca) * 1.5); g.add(ch); } box(tx, tz, 1.1, 1.1); }
    const eater = makePerson({ bag: false }); eater.position.set(-(hw - 3), 0.15, -D + 5.5); eater.rotation.y = 0; eater.userData.limbs.lL.rotation.x = eater.userData.limbs.lR.rotation.x = 1.4; g.add(eater);
    const seatW = toW(0, -D + 6.5 + 1.6); const plates = [];
    app.addInteractable(seatW[0], seatW[1], 2.2, '🍽️ Sit down & order', (a) => { a.popup(`Table for one at ${store.name}`, `<p>“${esc((L(store.clerk?.lines) || [''])[0])}”</p><p>What can I get you?</p>`, products.slice(0, 6).map(p => ({ label: `${p.icon || '🍽️'} ${p.title} · ${p.price || ''}`, keep: false, fn: () => { const pl = makeSprite(`${p.icon || '🍽️'}  ${p.title}`, { scale: 3.5, bg: 'rgba(255,255,255,0.95)', fg: '#111', accent: colors.trim }); pl.position.set(0, 1.3, -D + 6.5); g.add(pl); plates.push(pl); a.toast(`${p.title} coming right up! 🧑‍🍳`, 3000); setTimeout(() => { g.remove(pl); }, 20000); } }))); });
    const waiter = makePerson({ shirt: 0xffffff, pants: 0x111111, bag: false }); const wp = [[-(hw - 3), -D + 6], [0, -D + 8], [(hw - 3), -D + 6]].map(([lx, lz]) => { const [wx, wz] = toW(lx, lz); return new T.Vector3(wx, 0, wz); }); app.addNPC(waiter, wp, { speed: 1.2, pause: 4 }); const wt = makeSprite('waiter', { scale: 2.5, bg: 'rgba(8,20,50,0.85)', accent: '#fff' }); wt.position.y = 2.4; waiter.add(wt);
    app.addHotspot(waiter, { fn: (a) => a.popup('Your waiter', '<p>“Grab any table. Tap the green button when you sit and I\'ll take your order.”</p>') });
  } else if (layout === 'tech') {
    floor.material = M(0x0a0a12, { roughness: 0.2, metalness: 0.4 }); for (const sx of [-1, 1]) { const line = new T.Mesh(new T.PlaneGeometry(0.12, D - 1), new T.MeshBasicMaterial({ color: trim })); line.rotation.x = -Math.PI / 2; line.position.set(sx * (hw - 2.2), 0.035, -D / 2); g.add(line); }
    const cols = 3, rows = 2; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -(W - 7) / 2 + c * (W - 7) / (cols - 1), z = -3.5 - r * 4; const pd = new T.Mesh(new T.BoxGeometry(1.2, 1.1, 1.2), new T.MeshPhysicalMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 })); pd.position.set(x, 0.55, z); g.add(pd); const glowB = new T.Mesh(new T.BoxGeometry(1.25, 0.06, 1.25), lipM); glowB.position.set(x, 0.03, z); g.add(glowB); box(x, z, 0.7, 0.7); slots.push({ x, y: 1.95, z, rotY: 0, shelfY: 1.12, side: false }); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) slots.push({ x: sx * (hw - 0.4), y: 3.2, z: -2.5 - k * 3.5, rotY: sx * -Math.PI / 2, shelfY: 2.3, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
    for (let k = 0; k < 8; k++) { const dot = new T.Mesh(new T.SphereGeometry(0.06, 6, 6), lipM); dot.position.set(rand(-hw + 1, hw - 1), rand(3.5, H - 0.5), rand(-D + 1, -1)); g.add(dot); app.onUpdate((dt, t) => { dot.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + k)); }); }
  } else if (layout === 'market') {
    floor.material = M(0xc9b48a, { roughness: 1 }); const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const gg = c.getContext('2d'); for (let i = 0; i < 8; i++) { gg.fillStyle = i % 2 ? colors.trim : '#ffffff'; gg.fillRect(i * 32, 0, 32, 64); } const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = T.SRGBColorSpace; return t; })();
    const canopy = new T.Mesh(new T.PlaneGeometry(W - 1, D - 2), M(0xffffff, { map: stripeTex, side: T.DoubleSide })); canopy.rotation.x = Math.PI / 2 - 0.08; canopy.position.set(0, H - 1.2, -D / 2); g.add(canopy);
    for (const sx of [-1, 1]) for (let c = 0; c < 3; c++) { const x = sx * (hw - 1.8), z = -2.5 - c * 3.4; const crate = sh(new T.Mesh(new T.BoxGeometry(2, 1.0, 1.6), woodM)); crate.position.set(x, 0.5, z); g.add(crate); box(x, z, 1.1, 0.9); slots.push({ x, y: 1.85, z, rotY: sx * -Math.PI / 2, shelfY: 1.04, side: true }); for (let f = 0; f < 5; f++) { const fl = filler(colors); fl.position.set(x + rand(-0.6, 0.6), 1.0, z + rand(-0.5, 0.5)); g.add(fl); } }
    for (let c = 0; c < 3; c++) { const x = -3 + c * 3, z = -D + 3.5; const barrel = sh(new T.Mesh(new T.CylinderGeometry(0.6, 0.55, 1.1, 14), woodM)); barrel.position.set(x, 0.55, z); g.add(barrel); box(x, z, 0.7, 0.7); slots.push({ x, y: 1.95, z, rotY: 0, shelfY: 1.12, side: false }); }
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
    for (const sx of [-1, 1]) { const lantern = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), new T.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 1.5 })); lantern.position.set(sx * 3, H - 2, -D / 2); g.add(lantern); }
  } else if (layout === 'agency') {
    const tvTex = (() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const gg = c.getContext('2d'); gg.fillStyle = '#fff'; gg.fillRect(0, 0, 1200, 700); gg.fillStyle = '#f1f3f4'; gg.fillRect(0, 0, 1200, 110); gg.fillStyle = '#fff'; gg.beginPath(); gg.roundRect(140, 30, 900, 56, 28); gg.fill(); gg.strokeStyle = '#dfe1e5'; gg.stroke(); gg.fillStyle = '#202124'; gg.font = '30px Arial'; gg.fillText((store.serpQuery || 'best ' + (store.tag || '').toLowerCase() + ' near me'), 170, 68); const rows = store.serp || [[host(store.url), store.name + ' — ' + store.tag, store.about || '']]; rows.slice(0, 3).forEach((r, i) => { const y = 170 + i * 170; gg.fillStyle = '#202124'; gg.font = '22px Arial'; gg.fillText(r[0], 60, y); gg.fillStyle = '#1a0dab'; gg.font = 'bold 34px Arial'; gg.fillText(r[1].slice(0, 48), 60, y + 45); gg.fillStyle = '#4d5156'; gg.font = '24px Arial'; gg.fillText(r[2].slice(0, 80), 60, y + 85); }); gg.fillStyle = '#188038'; gg.font = 'bold 26px Arial'; gg.fillText('#1 result', 60, 130); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const tv = new T.Mesh(new T.PlaneGeometry(7.2, 4.2), new T.MeshBasicMaterial({ map: tvTex })); tv.position.set(-hw + 0.2, 3.4, -D / 2 - 1); tv.rotation.y = Math.PI / 2; g.add(tv); const tvF = new T.Mesh(new T.BoxGeometry(0.1, 4.5, 7.5), M(0x111111)); tvF.position.set(-hw + 0.14, 3.4, -D / 2 - 1); g.add(tvF);
    app.addHotspot(tv, { title: 'That\'s the goal', html: `<p>Your business at the top of the search results, and cited in the AI answers, when people ask for what you do. That's the entire job.</p>`, actions: aboutActions });
    const wbTex = makeTextTexture(store.whiteboard || ['THE PLAN', '1. Get found', '2. Get chosen', '3. Grow'], { w: 1400, h: 900, bg: '#ffffff', fg: '#111', accent: colors.trim, border: '#ddd', glow: false, font: 'bold 96px Poppins, Segoe UI, Arial', radius: 20, align: 'left', pad: 80 });
    const wb = new T.Mesh(new T.PlaneGeometry(6, 3.9), new T.MeshBasicMaterial({ map: wbTex })); wb.position.set(hw - 0.2, 3.2, -D / 2 - 1); wb.rotation.y = -Math.PI / 2; g.add(wb);
    app.addHotspot(wb, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
    const table = sh(new T.Mesh(new T.BoxGeometry(4.5, 0.12, 2), woodM)); table.position.set(0, 0.9, -D / 2 - 1); g.add(table); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.9, 8), darkM); leg.position.set(sx * 2, 0.45, -D / 2 - 1 + sz * 0.8); g.add(leg); } box(0, -D / 2 - 1, 2.4, 1.2);
    for (let c = 0; c < 4; c++) { const ch = sh(new T.Mesh(new T.BoxGeometry(0.5, 0.9, 0.5), M(0x1e2a4a))); ch.position.set(-1.7 + c * 1.15, 0.45, -D / 2 - 1 + (c % 2 ? 1.6 : -1.6)); g.add(ch); }
    for (let k = 0; k < Math.min(products.length, 6); k++) slots.push({ x: -2.5 + (k % 3) * 2.5, y: 1.7, z: k < 3 ? -2.2 : -D / 2 - 1 + 0.01, rotY: 0, shelfY: 0.95, side: false });
    products.slice(0, 6).forEach((p, i) => { const sl = slots[i]; used.add(i); if (i < 3) { const es = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.6, 6), woodM); es.position.set(sl.x, 0.8, sl.z + 0.2); es.rotation.x = 0.15; g.add(es); addCard(p, i, { ...sl, y: 1.6 }, 0.9); } else addCard(p, i, { ...sl, y: 1.9, z: sl.z }, 0.75); });
    const plant = sh(new T.Mesh(new T.ConeGeometry(0.8, 2.2, 8), M(0x3fa34d))); plant.position.set(hw - 1.2, 1.6, -D + 1.5); g.add(plant); const pot = new T.Mesh(new T.CylinderGeometry(0.5, 0.4, 0.6, 10), M(0xd9cbb0)); pot.position.set(hw - 1.2, 0.3, -D + 1.5); g.add(pot);
  } else if (layout === 'clinic') {
    // medical / dental: reception desk, exam chair with light, a giant friendly tooth, poster wall, service cards on easels
    floor.material = M(0xeef3fb, { roughness: 0.25, metalness: 0.1 });
    const desk = sh(new T.Mesh(new T.BoxGeometry(5, 1.1, 1.2), M(0xffffff, { roughness: 0.3 }))); desk.position.set(0, 0.55, -3.2); g.add(desk); const deskTop = new T.Mesh(new T.BoxGeometry(5.2, 0.1, 1.4), M(hex(colors.trim).getHex(), { roughness: 0.3 })); deskTop.position.set(0, 1.15, -3.2); g.add(deskTop); box(0, -3.2, 2.6, 0.7);
    const chairBase = sh(new T.Mesh(new T.CylinderGeometry(0.5, 0.6, 0.4, 14), M(0x9aa7c7, { metalness: 0.7 }))); chairBase.position.set(-hw + 3, 0.2, -D + 4); g.add(chairBase);
    const seat = sh(new T.Mesh(new T.BoxGeometry(1.0, 0.35, 2.2), M(hex(colors.trim).getHex(), { roughness: 0.5 }))); seat.position.set(-hw + 3, 0.75, -D + 4); seat.rotation.x = -0.35; g.add(seat); const backrest = sh(new T.Mesh(new T.BoxGeometry(1.0, 1.2, 0.3), seat.material)); backrest.position.set(-hw + 3, 1.35, -D + 5.1); backrest.rotation.x = -0.5; g.add(backrest); box(-hw + 3, -D + 4, 0.8, 1.4);
    const arm = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.2, 8), M(0xdddddd, { metalness: 0.9 })); arm.position.set(-hw + 3.6, 2.2, -D + 3.6); arm.rotation.z = 0.4; g.add(arm); const lamp = new T.Mesh(new T.CylinderGeometry(0.35, 0.25, 0.25, 14), M(0xffffff, { emissive: 0xfff2c0, emissiveIntensity: 1.2 })); lamp.position.set(-hw + 3, 2.9, -D + 3.6); lamp.rotation.x = 0.3; g.add(lamp); const spot = new T.PointLight(0xfff2c0, 0.8, 6); spot.position.copy(lamp.position); g.add(spot);
    const tooth = new T.Group(); tooth.position.set(hw - 2.5, 0, -D + 3); const crown = sh(new T.Mesh(new T.SphereGeometry(0.9, 18, 14), M(0xffffff, { roughness: 0.25 }))); crown.position.y = 2.1; crown.scale.set(1, 0.9, 0.85); tooth.add(crown); for (const sx of [-1, 1]) { const root = sh(new T.Mesh(new T.ConeGeometry(0.4, 1.3, 12), crown.material)); root.position.set(sx * 0.4, 0.75, 0); root.rotation.z = Math.PI; tooth.add(root); } const eyeM = M(0x111111); for (const sx of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), eyeM); e.position.set(sx * 0.3, 2.25, 0.75); tooth.add(e); } const smile = new T.Mesh(new T.TorusGeometry(0.25, 0.04, 6, 14, Math.PI), M(0xff4f79)); smile.position.set(0, 1.95, 0.76); smile.rotation.z = Math.PI; tooth.add(smile); g.add(tooth); box(hw - 2.5, -D + 3, 1.1, 1.1);
    app.onUpdate((dt, t) => { tooth.position.y = Math.sin(t * 1.6) * 0.08; tooth.rotation.y = Math.sin(t * 0.8) * 0.3; });
    app.addHotspot(tooth, { title: store.mascotTitle || 'Say hi to Molar', html: `<p>${esc(store.mascotLine || 'Brush twice, floss once, and come see us twice a year. That is the whole secret.')}</p>`, actions: aboutActions });
    const posters = store.posters || [['NEW PATIENTS', 'WELCOME'], ['FREE', 'CONSULTATION']];
    posters.slice(0, 2).forEach((lines, i) => { const sx = i === 0 ? -1 : 1; const ps = new T.Mesh(new T.PlaneGeometry(4.4, 2.6), new T.MeshBasicMaterial({ map: makeTextTexture(lines, { w: 1100, h: 650, bg: '#ffffff', fg: '#0b1a3a', accent: colors.trim, font: 'bold 110px Poppins, Segoe UI, Arial', radius: 30, border: colors.trim, glow: false }) })); ps.position.set(sx * (hw - 0.18), 3.2, -D / 2 - 0.5); ps.rotation.y = sx * -Math.PI / 2; g.add(ps); app.addHotspot(ps, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions }); });
    for (let k = 0; k < Math.min(products.length, 6); k++) slots.push({ x: -3.75 + (k % 4) * 2.5, y: 1.6, z: k < 4 ? -1.5 : -D / 2 - 1.5, rotY: 0, shelfY: 0.95, side: false });
    products.slice(0, 6).forEach((p, i) => { const sl = slots[i]; used.add(i); const es = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.6, 6), M(0xdddddd, { metalness: 0.8 })); es.position.set(sl.x, 0.8, sl.z + 0.2); es.rotation.x = 0.15; g.add(es); addCard(p, i, sl, 0.85); });
    for (const sx of [-1, 1]) { const ch = sh(new T.Mesh(new T.BoxGeometry(0.6, 0.5, 0.6), M(hex(colors.trim).getHex()))); ch.position.set(sx * (hw - 1.6), 0.25, -1.5); g.add(ch); const bk = sh(new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.12), ch.material)); bk.position.set(sx * (hw - 1.6), 0.8, -1.8); g.add(bk); }
  } else if (layout === 'salon') {
    for (let k = 0; k < 3; k++) { const z = -2.5 - k * 3.2; const chair = sh(new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.9), M(0x111111, { roughness: 0.4 }))); chair.position.set(-hw + 2.2, 0.75, z); g.add(chair); const back = sh(new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.2), chair.material)); back.position.set(-hw + 2.2, 1.45, z - 0.35); g.add(back); const base = new T.Mesh(new T.CylinderGeometry(0.4, 0.5, 0.45, 12), M(0x9aa7c7, { metalness: 0.8 })); base.position.set(-hw + 2.2, 0.22, z); g.add(base); const mirror = new T.Mesh(new T.PlaneGeometry(1.4, 2.2), new T.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 1, roughness: 0.05, envMapIntensity: 2 })); mirror.position.set(-hw + 0.2, 2.2, z); mirror.rotation.y = Math.PI / 2; g.add(mirror); for (let b = 0; b < 4; b++) { const bulb = new T.Mesh(new T.SphereGeometry(0.06, 6, 6), new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.5 })); bulb.position.set(-hw + 0.25, 1.2 + b * 0.65, z - 0.8); g.add(bulb); const bulb2 = bulb.clone(); bulb2.position.z = z + 0.8; g.add(bulb2); } box(-hw + 2.2, z, 0.6, 0.6); }
    const client = makePerson({ bag: false, hairStyle: 'long' }); client.position.set(-hw + 2.2, 0.35, -2.5); client.rotation.y = -Math.PI / 2; client.userData.limbs.lL.rotation.x = client.userData.limbs.lR.rotation.x = 1.4; g.add(client);
    for (const y of [1.2, 2.4, 3.6]) { const shf = sh(new T.Mesh(new T.BoxGeometry(0.5, 0.06, D - 4), shelfM)); shf.position.set(hw - 0.4, y, -D / 2 - 1); g.add(shf); for (let k = 0; k < 8; k++) { const b = new T.Mesh(new T.CylinderGeometry(0.08, 0.09, rand(0.3, 0.5), 8), M(pick([0xffffff, 0xf2b5d4, 0xd81b60, 0x111111, 0xffd23f]))); b.position.set(hw - 0.4, y + 0.2, -2.2 - k * (D - 5) / 7); g.add(b); } }
    const bed = sh(new T.Mesh(new T.BoxGeometry(2.2, 0.8, 1.0), M(0xffffff, { roughness: 0.2 }))); bed.position.set(hw - 3, 0.4, -D + 2.2); g.add(bed); const lid = new T.Mesh(new T.BoxGeometry(2.2, 0.15, 1.0), new T.MeshStandardMaterial({ color: 0x9ad0ff, emissive: 0x38a0ff, emissiveIntensity: 0.8 })); lid.position.set(hw - 3, 1.35, -D + 2.6); lid.rotation.x = -0.8; g.add(lid); box(hw - 3, -D + 2.2, 1.2, 0.6);
    app.addHotspot(bed, { title: 'UV Tanning', html: '<p>Sun-kissed, year-round. Book a session.</p>', actions: aboutActions });
    for (let k = 0; k < Math.min(products.length, 5); k++) slots.push({ x: hw - 1.2, y: 1.95, z: -2.2 - k * (D - 5) / 4, rotY: -Math.PI / 2, shelfY: 1.05, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.8); });
  } else if (layout === 'garage') {
    floor.material = M(0x3b3f47, { roughness: 0.9 }); const car = new T.Group(); car.position.set(0, 1.4, -D / 2 - 1); const bodyM = M(hex(colors.trim).getHex(), { metalness: 0.6, roughness: 0.3 }); const cb = sh(new T.Mesh(new T.BoxGeometry(2.2, 0.7, 4.6), bodyM)); cb.position.y = 0.6; car.add(cb); const cab = sh(new T.Mesh(new T.BoxGeometry(1.9, 0.7, 2.4), bodyM)); cab.position.set(0, 1.25, -0.2); car.add(cab); const ws = new T.Mesh(new T.BoxGeometry(1.8, 0.6, 0.1), glassM); ws.position.set(0, 1.25, 1.05); car.add(ws); for (const sx of [-1, 1]) for (const sz of [-1.5, 1.5]) { const w = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 14), M(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.15, 0.42, sz); car.add(w); } g.add(car); for (const sx of [-1, 1]) { const post = sh(new T.Mesh(new T.BoxGeometry(0.3, 2.8, 0.3), M(0xff8a00))); post.position.set(sx * 1.7, 1.4, -D / 2 - 1); g.add(post); } box(0, -D / 2 - 1, 1.9, 2.6);
    app.addHotspot(car, { title: 'On the lift', html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
    for (let k = 0; k < 12; k++) { const tool = new T.Mesh(new T.BoxGeometry(0.12, rand(0.3, 0.7), 0.08), M(0x9aa7c7, { metalness: 0.9 })); tool.position.set(-hw + 0.25, 2 + (k % 3) * 0.9, -2 - Math.floor(k / 3) * 1.6); g.add(tool); }
    for (let k = 0; k < 4; k++) { const tire = sh(new T.Mesh(new T.TorusGeometry(0.45, 0.18, 8, 20), M(0x111111))); tire.rotation.x = Math.PI / 2; tire.position.set(hw - 1.2, 0.2 + k * 0.38, -D + 1.6); g.add(tire); } box(hw - 1.2, -D + 1.6, 0.7, 0.7);
    for (let k = 0; k < Math.min(products.length, 5); k++) slots.push({ x: hw - 0.4, y: 2.4 + (k % 2) * 1.9, z: -2.5 - Math.floor(k / 2) * 3.2, rotY: -Math.PI / 2, shelfY: 1.5, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
  } else if (layout === 'travel') {
    floor.material = M(0xf0dcae, { roughness: 1 }); for (const sx of [-1, 1]) { const trunk = sh(new T.Mesh(new T.CylinderGeometry(0.15, 0.2, 4.5, 8), M(0x8a5a2b))); trunk.position.set(sx * (hw - 1.4), 2.25, -D + 1.6); trunk.rotation.z = sx * -0.15; g.add(trunk); for (let f = 0; f < 6; f++) { const leaf = sh(new T.Mesh(new T.BoxGeometry(2.2, 0.05, 0.5), M(0x3fa34d))); const a = f / 6 * Math.PI * 2; leaf.position.set(sx * (hw - 1.4) + Math.cos(a) * 0.9, 4.5, -D + 1.6 + Math.sin(a) * 0.9); leaf.rotation.y = -a; leaf.rotation.z = -0.35; g.add(leaf); } box(sx * (hw - 1.4), -D + 1.6, 0.5, 0.5); }
    const hm = new T.Mesh(new T.PlaneGeometry(2.6, 1.1), M(0xffffff, { map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const gg = c.getContext('2d'); gg.fillStyle = colors.trim; gg.fillRect(0, 0, 128, 64); gg.fillStyle = '#fff'; for (let i = 0; i < 8; i++) gg.fillRect(i * 16, 0, 8, 64); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })(), side: T.DoubleSide })); hm.position.set(0, 1.2, -D + 1.8); hm.rotation.x = -Math.PI / 2 + 0.3; g.add(hm);
    const board = sh(new T.Mesh(new T.BoxGeometry(0.6, 2.4, 0.08), M(0xffd23f))); board.position.set(hw - 3.5, 1.2, -D + 0.4); board.rotation.z = 0.12; g.add(board);
    const wave = new T.Mesh(new T.PlaneGeometry(W - 1, 2.5), new T.MeshBasicMaterial({ map: makeTextTexture(store.tagline || [store.city + ' · ' + store.tag], { w: 2000, h: 300, bg: '#0891b2', fg: '#fff', accent: '#fde047', font: 'bold 120px Poppins, Segoe UI, Arial', radius: 0, border: null }) })); wave.position.set(0, H - 1.6, -D + 0.25); g.add(wave);
    for (let k = 0; k < Math.min(products.length, 6); k++) slots.push({ x: -(W - 6) / 2 + (k % 3) * (W - 6) / 2, y: 1.9, z: k < 3 ? -3 : -6.5, rotY: 0, shelfY: 0.95, side: false });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); pedestal(sl.x, sl.z, 0.9, 0.5); addCard(p, i, sl, 0.9); });
  } else {
    wallShelves(); products.slice(0, slots.length).forEach((p, i) => { used.add(i); addCard(p, i, slots[i]); });
    slots.forEach((sl, i) => { if (used.has(i)) return; fillGroup(sl.x, sl.shelfY, sl.z, sl.rotY, 4); });
  }
  // ----- wall posters + back-wall billboard -----
  const posters = store.posters || [[(store.tag || 'SHOP').toUpperCase(), store.city || ''], ['WHY ' + store.name.toUpperCase() + '?', (store.about || '').split('. ')[0].slice(0, 60)]];
  if (layout !== 'clinic') posters.slice(0, 2).forEach((lines, i) => {
    const sx = i === 0 ? -1 : 1;
    const ps = new T.Mesh(new T.PlaneGeometry(5.6, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture(lines, { w: 1400, h: 550, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 84px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true }));
    ps.position.set(sx * (hw - 0.18), 5.6, -D / 2 - 1.3); ps.rotation.y = sx * -Math.PI / 2; g.add(ps);
    app.addHotspot(ps, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
  });
  const bb = new T.Mesh(new T.PlaneGeometry(W - 3, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture([store.pitchLine || (store.cta || 'Visit ' + host(store.url)), demo ? 'Demo store · yours could be here' : (host(store.url) || store.city || '')], { w: 2000, h: 400, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 110px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true })); bb.position.set(0, 5.4, -D + 0.2); g.add(bb);
  app.addHotspot(bb, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
  // extra wall ads (e.g. Roof Solutions asked for a couple): store.ads = [{lines:[...], bg, accent, url, title}]
  (store.ads || []).slice(0, 3).forEach((ad, i) => { const sx = i % 2 ? 1 : -1; const zz = -D + 1.5 - i * 0.2; const p = new T.Mesh(new T.PlaneGeometry(4.6, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture(ad.lines, { w: 1400, h: 660, bg: ad.bg || '#ffffff', fg: ad.fg || '#0b1a3a', accent: ad.accent || colors.trim, border: ad.accent || colors.trim, glow: false, font: 'bold 96px Poppins, Segoe UI, Arial', radius: 30 }) })); p.position.set(sx * (hw - 0.18), 2.6, zz - 2); p.rotation.y = sx * -Math.PI / 2; g.add(p); app.addHotspot(p, { title: ad.title || store.name, html: `<p>${esc(ad.about || store.about || '')}</p>`, actions: [{ label: ad.cta || 'Learn more', href: ad.url || store.url, newTab: true, primary: true }] }); });

  // ----- store.fun: balloons, a spinning logo cube, sweeping spotlight, confetti (Zach's own stores) -----
  if (store.fun && !placeholder) {
    for (let i = 0; i < 7; i++) { const b = new T.Mesh(new T.SphereGeometry(0.42, 12, 10), M(pick([0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff]), { roughness: 0.3 })); b.scale.y = 1.2; const bx = rand(-hw + 2, hw - 2), bz = rand(-D + 2, -2), by = rand(H - 3, H - 1); b.position.set(bx, by, bz); g.add(b); const str = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 1.6, 4), M(0xffffff)); str.position.set(bx, by - 1.3, bz); g.add(str); app.onUpdate((dt, t) => { const y = by + Math.sin(t * 1.1 + i) * 0.3; b.position.y = y; str.position.y = y - 1.3; b.position.x = bx + Math.sin(t * 0.6 + i) * 0.2; str.position.x = b.position.x; }); }
    const cube = new T.Mesh(new T.BoxGeometry(2.2, 2.2, 2.2), new T.MeshStandardMaterial({ map: logoTexture(store.logo || { text: store.name }, { w: 512, h: 512 }), emissive: 0x222222, roughness: 0.3, metalness: 0.4 })); cube.position.set(0, H - 2.6, -D / 2); g.add(cube); const cubeRing = new T.Mesh(new T.TorusGeometry(2.1, 0.08, 6, 40), lipM); cubeRing.position.copy(cube.position); g.add(cubeRing);
    const sweep = new T.SpotLight(hex(colors.trim), isMobile() ? 0 : 30, 30, 0.35, 0.6, 1); sweep.position.set(0, H - 0.5, -2); sweep.target.position.set(0, 0, -D / 2); if (!isMobile()) { g.add(sweep); g.add(sweep.target); }
    const confM = new T.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }); const conf = []; for (let i = 0; i < 24; i++) { const sp = new T.Sprite(confM.clone()); sp.material.color.set(pick([0xff4f79, 0x38f0ff, 0xffd23f, 0x7cff6b, 0xb08cff])); sp.scale.set(0.18, 0.28, 1); sp.userData.x = rand(-hw + 1, hw - 1); sp.userData.z = rand(-D + 1, -1); sp.userData.o = rand(0, 10); g.add(sp); conf.push(sp); }
    app.onUpdate((dt, t) => { cube.rotation.y += dt * 0.8; cube.rotation.x = Math.sin(t) * 0.3; cubeRing.rotation.x += dt; cubeRing.rotation.y += dt * 0.5; sweep.target.position.set(Math.sin(t * 0.8) * (hw - 3), 0, -D / 2 + Math.cos(t * 0.5) * (D / 2 - 3)); for (const sp of conf) { const k = ((t * 0.25 + sp.userData.o) % 8) / 8; sp.position.set(sp.userData.x + Math.sin(t * 2 + sp.userData.o) * 0.4, H - 0.5 - k * (H - 1.2), sp.userData.z); sp.material.rotation += dt * 3; sp.material.opacity = k > 0.9 ? (1 - k) * 9 : 0.9; } });
    const wow = makeSprite('✨ ' + (store.funLabel || 'flagship store') + ' ✨', { scale: 6, bg: 'rgba(255,79,121,0.92)', fg: '#fff', accent: '#ffd23f' }); wow.position.set(0, H + 2.6, 0.5); g.add(wow);
  }
  // ----- counter + clerk -----
  const counterZ = layout === 'cafe' ? -3.5 : layout === 'clinic' ? -3.2 : -D + 3.2;
  if (layout !== 'cafe' && layout !== 'clinic') { const counter = sh(new T.Mesh(new T.BoxGeometry(5, 1.1, 1.2), M(trimHex, { roughness: 0.3, metalness: 0.2 }))); counter.position.set(0, 0.55, -D + 3.2); g.add(counter);
  const counterTop = new T.Mesh(new T.BoxGeometry(5.2, 0.12, 1.4), M(0xffffff, { roughness: 0.2 })); counterTop.position.set(0, 1.16, -D + 3.2); g.add(counterTop);
  const reg = new T.Mesh(new T.BoxGeometry(0.6, 0.4, 0.5), M(0x1e2a4a, { metalness: 0.6 })); reg.position.set(1.6, 1.42, -D + 3.2); g.add(reg);
  const regScreen = new T.Mesh(new T.PlaneGeometry(0.5, 0.3), new T.MeshBasicMaterial({ color: 0x38f0ff })); regScreen.position.set(1.6, 1.5, -D + 3.46); g.add(regScreen);
  box(0, -D + 3.2, 2.6, 0.7); }
  const clerk = makePerson({ shirt: hex(store.clerk?.shirt || colors.trim).getHex(), bag: false, age: 'adult', scale: 1, hairStyle: store.clerk?.hair || undefined }); clerk.position.set(0, 0, counterZ - 1); g.add(clerk);
  const nameTag = makeSprite(`${store.clerk?.name || 'Clerk'} · ask me anything`, { scale: 4, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); nameTag.position.set(0, 2.5, counterZ - 1); g.add(nameTag);
  let li = 0; const lines = L(store.clerk?.lines) || [`Welcome to ${store.name}!`];
  const clerkTalk = (a) => { const line = lines[li % lines.length]; li++; a.popup(`${store.clerk?.name || 'Clerk'} · ${store.name}`, `<p style="font-size:17px">“${esc(line)}”</p><p class="muted">${esc(store.about || '')}</p>`, [...aboutActions, { label: 'Tell me more', fn: () => clerkTalk(a), keep: true }, ...(store.phone ? [{ label: '📞 ' + store.phone, href: 'tel:' + store.phone.replace(/[^\d+]/g, ''), newTab: true }] : [])]); };
  app.addHotspot(clerk, { fn: clerkTalk });
  app.onUpdate((dt, t) => { clerk.userData.limbs.aR.rotation.z = -0.6 + Math.sin(t * 2.2 + x) * 0.25; clerk.rotation.y = Math.sin(t * 0.5 + z) * 0.25; });

  // ----- welcome conversation on walk-in (once per store per session) -----
  if (welcome) {
    const key = 'wvm_welcomed_' + store.slug;
    app.addTrigger(doorWorld[0], doorWorld[1], 2.6, (a) => {
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { }
      const greet = L(store.greeting) || lines[0];
      a.popup(`${store.clerk?.name || 'Welcome'} · ${store.name} ${store.flag || ''}`, `<p style="font-size:17px">“${esc(greet)}”</p><p class="muted">${esc(store.about || '')}</p>`, [{ label: '🛍️ Browse the shelves', fn: () => { } }, ...aboutActions]);
    });
  }
  if (storePage) { const sp = makeSprite('ℹ️ Store page & all products', { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); sp.position.set(hw - 2.6, 1.3, 0.6); g.add(sp); app.addHotspot(sp, { go: `/stores/${store.slug}/`, label: `Opening ${store.name}…` }); }
  return g;
}

export function wingName(w) { return ({ lobby: 'Grand Lobby', americas: 'Americas Wing', europe: 'Europe Wing', asia: 'Asia & Islands Wing', food: 'Global Food Court', kids: "Kids' Discovery Zone", market: 'Old World Market', chinatown: 'Chinatown', alien: 'Alien Quarter', upper: 'Upper Level', arcade: 'Game Room', future: 'Future Wing', village: 'World Village' })[w] || 'Mall'; }

/* ---------- product popup (v3): blurred store behind, product floats big, BUY on the tenant's domain, heart-save ---------- */
let popCSS = false;
function ensurePopCSS() {
  if (popCSS) return; popCSS = true;
  const s = document.createElement('style'); s.textContent = `
    body.wvm-product #wvm-pop{backdrop-filter:blur(10px) saturate(1.2);background:rgba(2,6,20,.55)}
    .wvm-prod{display:grid;gap:12px}
    .wvm-prod-img{position:relative;display:flex;align-items:center;justify-content:center;min-height:200px;padding:6px}
    .wvm-prod-img::before{content:"";position:absolute;inset:8% 14%;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.55),rgba(255,255,255,0) 70%);filter:blur(6px)}
    .wvm-prod-img img{position:relative;max-width:100%;max-height:min(46vh,340px);object-fit:contain;filter:drop-shadow(0 18px 30px rgba(0,0,0,.6));animation:wvmfloat 4s ease-in-out infinite}
    .wvm-prod-img img.plate{background:#fff;border-radius:14px;padding:8px}
    @keyframes wvmfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .wvm-prod-brand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9fd3ff;font-weight:800}
    .wvm-prod-name{font-size:24px;font-weight:900;line-height:1.15;margin:2px 0}
    .wvm-prod-price{font-size:22px;font-weight:900;color:#7cf8ff}
    .wvm-prod-desc{color:#dbe9ff;font-size:15px;line-height:1.5}
    .wvm-prod-buy{display:block;text-align:center;background:#38f0ff;color:#04122a;font-weight:900;border-radius:999px;padding:14px 18px;font-size:16px;text-decoration:none;box-shadow:0 8px 30px rgba(56,240,255,.35)}
    .wvm-prod-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .wvm-heart{background:rgba(255,79,121,.15);border:1px solid #ff4f79;color:#fff;border-radius:999px;padding:10px 16px;font-weight:800;cursor:pointer;font-family:inherit}
    .wvm-heart.on{background:#ff4f79}
    @media (prefers-reduced-motion:reduce){.wvm-prod-img img{animation:none}}
  `; document.head.appendChild(s);
}
/* Try to knock out a white studio background so the product floats. Cross-origin images that block canvas fall back to a white plate. */
function floatImage(imgEl) {
  try {
    const c = document.createElement('canvas'); const w = c.width = Math.min(imgEl.naturalWidth, 700), h = c.height = Math.round(imgEl.naturalHeight * w / imgEl.naturalWidth); const g = c.getContext('2d'); g.drawImage(imgEl, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h); const px = d.data; let edgeWhite = 0, edgeN = 0;
    for (let x = 0; x < w; x += 4) { for (const y of [0, h - 1]) { const i = (y * w + x) * 4; edgeN++; if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) edgeWhite++; } }
    if (edgeWhite / edgeN < 0.6) { imgEl.classList.add('plate'); return; }
    for (let i = 0; i < px.length; i += 4) { const r = px[i], gg = px[i + 1], b = px[i + 2]; const m = Math.min(r, gg, b); if (m > 238) px[i + 3] = 0; else if (m > 222) px[i + 3] = Math.round((238 - m) / 16 * 255); }
    g.putImageData(d, 0, 0); imgEl.src = c.toDataURL('image/png');
  } catch (e) { imgEl.classList.add('plate'); }
}
export function showProduct(app, store, p) {
  ensurePopCSS(); document.body.classList.add('wvm-product');
  const demo = store.demo || !p.url; const domain = host(p.url && p.url.startsWith('http') ? p.url : store.url) || 'the store';
  const id = 'pi' + Math.floor(Math.random() * 1e6);
  const img = p.img ? `<div class="wvm-prod-img"><img id="${id}" src="${esc(p.img)}" alt="${esc(p.title)}" crossorigin="anonymous" loading="eager"></div>` : `<div class="wvm-prod-img"><span style="font-size:96px;position:relative">${esc(p.icon || '🛍️')}</span></div>`;
  const saved = !!app.list.find(i => i.url === p.url);
  const html = `<div class="wvm-prod">${img}
    <div><div class="wvm-prod-brand">${esc(store.name)}${store.city ? ' · ' + esc(store.city) : ''}</div><div class="wvm-prod-name">${esc(p.title)}</div><div class="wvm-prod-price">${esc(p.price || '')}</div></div>
    <div class="wvm-prod-desc">${esc(p.desc || '')}</div>
    ${demo ? '<p class="muted">This is a demo store showing what a storefront looks like. A real brand could be here tomorrow.</p>' : `<a class="wvm-prod-buy" href="${esc(p.url)}" target="_blank" rel="noopener">BUY on ${esc(domain)} →</a><div class="wvm-prod-row"><span class="muted">Checkout happens on the brand's own site.</span><button class="wvm-heart${saved ? ' on' : ''}" id="${id}-h">${saved ? '♥ Saved' : '♡ Save to my list'}</button></div>`}
  </div>`;
  app.popup(p.title, html, demo ? [{ label: '🏬 Put my brand here', href: '/lease/', primary: true }] : []);
  const im = document.getElementById(id); if (im) { if (im.complete && im.naturalWidth) floatImage(im); else { im.onload = () => floatImage(im); im.onerror = () => { im.removeAttribute('crossorigin'); im.classList.add('plate'); im.src = p.img; im.onerror = null; }; } }
  const hb = document.getElementById(id + '-h'); if (hb) hb.onclick = () => { app.addToList({ title: p.title, price: p.price, url: p.url, store: store.name }); hb.classList.add('on'); hb.textContent = '♥ Saved'; };
  const obs = new MutationObserver(() => { if (!app.pop.classList.contains('on')) { document.body.classList.remove('wvm-product'); obs.disconnect(); } }); obs.observe(app.pop, { attributes: true, attributeFilter: ['class'] });
}
