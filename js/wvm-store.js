/* World VR Mall — storefront builder v2 (shared by the mall and every store page)
   buildStore(app, store, { x, z, rot, placeholder }) → THREE.Group
   rot: 0 = door faces +Z, Math.PI = faces -Z, Math.PI/2 = faces +X, -Math.PI/2 = faces -X
   Footprint: 14 wide, 12 deep, 7 tall. */
import { THREE, makePerson, makeSprite, makeTextTexture, pick, rand, esc } from './wvm-engine.js?v=3';

const T = THREE;
const hex = (s) => new T.Color(s);
export const STORE_W = 14, STORE_D = 12, STORE_H = 7;

/* ---------- textures ---------- */
export function logoTexture(logo, opts = {}) {
  const { w = 1024, h = 320 } = opts;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = logo.bg || '#0b1a3a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = logo.accent || '#fff'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = '200px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.fillText(logo.icon || '🏬', 40, h / 2 + 8);
  g.fillStyle = logo.fg || '#fff'; g.font = 'bold 130px Poppins, "Segoe UI", Arial, sans-serif';
  g.shadowColor = logo.accent || '#fff'; g.shadowBlur = 18;
  fitText(g, logo.text || '', 300, h / 2 - (logo.sub ? 55 : 0), w - 340, 130);
  g.shadowBlur = 0;
  if (logo.sub) { g.fillStyle = logo.accent || '#fff'; g.font = 'bold 64px Poppins, "Segoe UI", Arial, sans-serif'; fitText(g, logo.sub, 300, h / 2 + 70, w - 340, 64); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
function fitText(g, text, x, y, maxW, size) {
  let s = size; const fam = g.font.replace(/^(bold )?\d+px /, ''); const bold = g.font.startsWith('bold') ? 'bold ' : '';
  g.font = `${bold}${s}px ${fam}`; while (g.measureText(text).width > maxW && s > 20) { s -= 4; g.font = `${bold}${s}px ${fam}`; }
  g.fillText(text, x, y);
}
function cardTexture(p, colors) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = colors.trim || '#38f0ff'; g.fillRect(0, 0, 512, 18);
  g.font = '150px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.icon || '🛍️', 256, 130);
  g.fillStyle = '#0b1a3a'; wrap(g, p.title, 256, 290, 440, 'bold 38px Poppins, "Segoe UI", Arial', 46);
  g.fillStyle = colors.trim || '#38f0ff'; g.font = 'bold 44px Poppins, "Segoe UI", Arial'; g.fillText(p.price || '', 256, 400);
  g.fillStyle = '#0b1a3a'; g.font = '26px Poppins, "Segoe UI", Arial'; g.fillText('tap to view', 256, 468);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
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
  const { x = 0, z = 0, rot = 0, placeholder = false, label = true, storePage = true, welcome = true } = opts;
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.userData.store = store;
  const colors = store.colors || { wall: '#123', floor: '#0b1a3a', trim: '#38f0ff' };
  const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const trim = hex(colors.trim), trimHex = trim.getHex();
  const W = STORE_W, D = STORE_D, H = STORE_H, hw = W / 2;
  const demo = !!store.demo;

  // floor + walls + ceiling
  const floor = new T.Mesh(new T.PlaneGeometry(W, D), M(hex(colors.floor), { roughness: 0.45, metalness: 0.15 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.02, -D / 2); g.add(floor);
  const wallM = M(hex(colors.wall));
  const back = new T.Mesh(new T.BoxGeometry(W, H, 0.3), wallM); back.position.set(0, H / 2, -D); g.add(back);
  for (const sx of [-1, 1]) { const side = new T.Mesh(new T.BoxGeometry(0.3, H, D), wallM); side.position.set(sx * hw, H / 2, -D / 2); g.add(side); }
  const ceil = new T.Mesh(new T.PlaneGeometry(W, D), M(0xffffff, { side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: placeholder ? 0.15 : 0.35 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.05, -D / 2); g.add(ceil);
  for (const zz of [-3, -6, -9]) { const strip = new T.Mesh(new T.BoxGeometry(W - 2, 0.1, 0.3), new T.MeshBasicMaterial({ color: placeholder ? 0x445 : 0xffffff })); strip.position.set(0, H - 0.2, zz); g.add(strip); }
  const runner = new T.Mesh(new T.PlaneGeometry(3.2, D - 1), M(trimHex, { emissive: trimHex, emissiveIntensity: 0.15, roughness: 0.6 })); runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.03, -D / 2 + 0.3); g.add(runner);

  // facade: header + logo, URL bar, glass, door mat, plants
  const header = new T.Mesh(new T.BoxGeometry(W + 0.6, 2.2, 0.6), M(hex(store.logo?.bg || colors.wall), { roughness: 0.4 })); header.position.set(0, H - 1.1, 0.3); g.add(header);
  const logo = new T.Mesh(new T.PlaneGeometry(W - 1, 1.9), new T.MeshBasicMaterial({ map: logoTexture(store.logo || { text: store.name }) })); logo.position.set(0, H - 1.1, 0.62); g.add(logo);
  const trimBar = new T.Mesh(new T.BoxGeometry(W + 0.6, 0.15, 0.7), new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: placeholder ? 0.3 : 1.2 })); trimBar.position.set(0, H - 2.25, 0.3); g.add(trimBar);
  if (!placeholder && store.url && store.url.startsWith('http')) {
    const urlBar = new T.Mesh(new T.PlaneGeometry(W - 3, 0.8), new T.MeshBasicMaterial({ map: makeTextTexture(host(store.url), { w: 1600, h: 128, bg: colors.trim, fg: '#04122a', border: null, glow: false, font: 'bold 84px Poppins, Segoe UI, Arial', radius: 40 }), transparent: true })); urlBar.position.set(0, H - 2.75, 0.62); g.add(urlBar);
    app.addHotspot(urlBar, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: [{ label: store.cta || 'Visit ' + host(store.url), href: store.url, newTab: true, primary: true }] });
  }
  const glassM = new T.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false });
  for (const sx of [-1, 1]) { const pane = new T.Mesh(new T.BoxGeometry(hw - 2.2, H - 2.9, 0.12), glassM); pane.position.set(sx * (hw - (hw - 2.2) / 2), (H - 2.9) / 2, 0); g.add(pane); const frame = new T.Mesh(new T.BoxGeometry(0.16, H - 2.9, 0.3), M(0x1e2a4a, { metalness: 0.6 })); frame.position.set(sx * 2.2, (H - 2.9) / 2, 0); g.add(frame); }
  const mat = new T.Mesh(new T.PlaneGeometry(4, 1.6), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: placeholder ? 0.25 : 0.7 })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.03, 0.9); g.add(mat);
  for (const sx of [-1, 1]) { const pot = new T.Mesh(new T.CylinderGeometry(0.35, 0.28, 0.6, 10), M(0xd9cbb0)); pot.position.set(sx * (hw - 0.6), 0.3, 0.9); g.add(pot); const leaf = new T.Mesh(new T.SphereGeometry(0.55, 8, 6), M(0x3fa34d)); leaf.position.set(sx * (hw - 0.6), 0.95, 0.9); g.add(leaf); }
  const plaque = makeSprite(`${store.flag || '🏬'} ${store.city || ''}`, { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); plaque.position.set(0, H + 1.2, 0.5); if (label) g.add(plaque);

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

  if (placeholder) {
    const s1 = makeSprite('SPACE AVAILABLE', { scale: 8, bg: 'rgba(255,79,121,0.9)', fg: '#fff', accent: '#ffd23f' }); s1.position.set(0, 3.8, -4); g.add(s1);
    const s2 = makeSprite(`Reserved for a ${store.tag} brand from ${store.city}`, { scale: 9, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); s2.position.set(0, 2.6, -4); g.add(s2);
    for (const sx of [-1, 1]) for (const y of [1.0, 2.6]) { const sh = new T.Mesh(new T.BoxGeometry(0.9, 0.08, D - 3.5), M(0xdfe6f5)); sh.position.set(sx * (hw - 0.6), y, -D / 2 - 1.2); g.add(sh); }
    const hot = { title: `${store.name} — space available`, html: `<p>This storefront in the <b>${esc(wingName(store.wing))}</b> is reserved for a <b>${esc(store.tag)}</b> brand from <b>${esc(store.city)}</b>. It could be yours instead.</p><p>Ten-minute setup. Your logo, your products, buy buttons to your own site, an AI clerk, and a search-optimized store page. Premium spots go first come, first served.</p>`, actions: [{ label: '📞 Claim this space: 1-800-481-8638', href: 'tel:18004818638', newTab: true, primary: true }, { label: 'Leasing details', href: '/lease/' }] };
    app.addHotspot(g, hot);
    return g;
  }

  // ----- shelves: two levels per side wall, three bays each (reading order), one back-wall row; filler goods in the gaps -----
  const shelfM = M(0xdfe6f5, { metalness: 0.3, roughness: 0.4 }), lipM = new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.9 });
  const slots = [];
  for (const sx of [-1, 1]) {
    for (const y of [0.95, 2.55]) {
      const sh = new T.Mesh(new T.BoxGeometry(1.0, 0.08, D - 3.6), shelfM); sh.position.set(sx * (hw - 0.65), y, -D / 2 - 1.3); g.add(sh);
      const lip = new T.Mesh(new T.BoxGeometry(0.06, 0.06, D - 3.6), lipM); lip.position.set(sx * (hw - 1.15), y + 0.05, -D / 2 - 1.3); g.add(lip);
      for (let k = 0; k < 3; k++) slots.push({ x: sx * (hw - 0.9), y: y + 0.95, z: -2.4 - k * 2.7, rotY: sx * -Math.PI / 2, shelfY: y + 0.04, side: true });
    }
    for (const zz of [-1.2, -D + 2.2]) { const col = new T.Mesh(new T.BoxGeometry(0.3, 3.4, 0.3), M(0xffffff)); col.position.set(sx * (hw - 0.65), 1.7, zz); g.add(col); }
  }
  const backShelf = new T.Mesh(new T.BoxGeometry(W - 3, 0.08, 0.9), shelfM); backShelf.position.set(0, 2.2, -D + 0.6); g.add(backShelf);
  for (let k = 0; k < 3; k++) slots.push({ x: -3.6 + k * 3.6, y: 3.15, z: -D + 0.65, rotY: 0, shelfY: 2.24, side: false });
  const products = (store.products || []).slice(0, slots.length);
  const used = new Set();
  products.forEach((p, i) => {
    const s = slots[i]; used.add(i);
    const card = new T.Group(); card.position.set(s.x, s.y, s.z); card.rotation.y = s.rotY;
    const frame = new T.Mesh(new T.BoxGeometry(1.7, 1.7, 0.12), M(0xffffff, { roughness: 0.3 })); card.add(frame);
    const face = new T.Mesh(new T.PlaneGeometry(1.55, 1.55), new T.MeshBasicMaterial({ map: cardTexture(p, colors) })); face.position.z = 0.07; card.add(face);
    if (p.img) { imgLoader.load(p.img, (tex) => { tex.colorSpace = T.SRGBColorSpace; face.material.map = tex; face.material.needsUpdate = true; const cap = new T.Mesh(new T.PlaneGeometry(1.55, 0.36), new T.MeshBasicMaterial({ map: priceTag(p.price || '', colors.trim), transparent: true })); cap.position.set(0, -0.62, 0.08); card.add(cap); }, undefined, () => { }); }
    const ring = new T.Mesh(new T.RingGeometry(1.0, 1.08, 32), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.35, side: T.DoubleSide })); ring.position.z = 0.05; card.add(ring);
    app.onUpdate((dt, t) => { ring.material.opacity = 0.2 + Math.sin(t * 2 + i) * 0.15; });
    const f = filler(colors); f.position.set(s.side ? -0.55 : -0.9, -0.91, 0.45); f.scale.setScalar(0.85); card.add(f);
    g.add(card);
    app.addHotspot(card, { fn: (a) => showProduct(a, store, p) });
  });
  slots.forEach((s, i) => { if (used.has(i)) return; const grp = new T.Group(); grp.position.set(s.x, s.shelfY, s.z); grp.rotation.y = s.rotY; for (let k = 0; k < 4; k++) { const f = filler(colors); f.position.set(-0.9 + k * 0.6, 0, rand(-0.2, 0.2)); grp.add(f); } g.add(grp); });
  for (const sx of [-1, 1]) { const row = new T.Group(); row.position.set(sx * (hw - 0.5), 4.3, -D / 2 - 1.3); const rail = new T.Mesh(new T.BoxGeometry(0.6, 0.06, D - 4), shelfM); row.add(rail); for (let k = 0; k < 7; k++) { const f = filler(colors); f.position.set(0, 0.03, -3.5 + k * 1.15); f.rotation.y = sx * -Math.PI / 2; row.add(f); } g.add(row); }

  // ----- wall posters + back-wall billboard -----
  const posters = store.posters || [[store.tag.toUpperCase(), store.city || ''], ['WHY ' + store.name.toUpperCase() + '?', (store.about || '').split('. ')[0].slice(0, 60)]];
  const aboutActions = [{ label: store.cta || 'Visit website', href: store.url, newTab: !!(store.url && store.url.startsWith('http')), primary: true }, ...(store.lead === false ? [] : [{ label: '✉️ Get in touch', fn: () => leadForm(app, store, store.leadIntro), keep: true }])];
  posters.slice(0, 2).forEach((lines, i) => {
    const sx = i === 0 ? -1 : 1;
    const ps = new T.Mesh(new T.PlaneGeometry(5.6, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture(lines, { w: 1400, h: 550, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 84px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true }));
    ps.position.set(sx * (hw - 0.18), 5.6, -D / 2 - 1.3); ps.rotation.y = sx * -Math.PI / 2; g.add(ps);
    app.addHotspot(ps, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
  });
  const bb = new T.Mesh(new T.PlaneGeometry(W - 3, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture([store.pitchLine || (store.cta || 'Visit ' + host(store.url)), demo ? 'Demo store · yours could be here' : (host(store.url) || store.city || '')], { w: 2000, h: 400, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 110px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true })); bb.position.set(0, 5.4, -D + 0.2); g.add(bb);
  app.addHotspot(bb, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });

  // ----- counter + clerk -----
  const counter = new T.Mesh(new T.BoxGeometry(5, 1.1, 1.2), M(trimHex, { roughness: 0.3, metalness: 0.2 })); counter.position.set(0, 0.55, -D + 3.2); g.add(counter);
  const counterTop = new T.Mesh(new T.BoxGeometry(5.2, 0.12, 1.4), M(0xffffff, { roughness: 0.2 })); counterTop.position.set(0, 1.16, -D + 3.2); g.add(counterTop);
  const reg = new T.Mesh(new T.BoxGeometry(0.6, 0.4, 0.5), M(0x1e2a4a, { metalness: 0.6 })); reg.position.set(1.6, 1.42, -D + 3.2); g.add(reg);
  const regScreen = new T.Mesh(new T.PlaneGeometry(0.5, 0.3), new T.MeshBasicMaterial({ color: 0x38f0ff })); regScreen.position.set(1.6, 1.5, -D + 3.46); g.add(regScreen);
  box(0, -D + 3.2, 2.6, 0.7);
  const clerk = makePerson({ shirt: hex(store.clerk?.shirt || colors.trim).getHex(), bag: false, age: 'adult', scale: 1 }); clerk.position.set(0, 0, -D + 2.2); g.add(clerk);
  const nameTag = makeSprite(`${store.clerk?.name || 'Clerk'} · ask me anything`, { scale: 4, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); nameTag.position.set(0, 2.5, -D + 2.2); g.add(nameTag);
  let li = 0; const lines = store.clerk?.lines || [`Welcome to ${store.name}!`];
  const clerkTalk = (a) => { const line = lines[li % lines.length]; li++; a.popup(`${store.clerk?.name || 'Clerk'} · ${store.name}`, `<p style="font-size:17px">“${esc(line)}”</p><p class="muted">${esc(store.about || '')}</p>`, [...aboutActions, { label: 'Tell me more', fn: () => clerkTalk(a), keep: true }, ...(store.phone ? [{ label: '📞 ' + store.phone, href: 'tel:' + store.phone.replace(/[^\d+]/g, ''), newTab: true }] : [])]); };
  app.addHotspot(clerk, { fn: clerkTalk });
  app.onUpdate((dt, t) => { clerk.userData.limbs.aR.rotation.z = -0.6 + Math.sin(t * 2.2 + x) * 0.25; clerk.rotation.y = Math.sin(t * 0.5 + z) * 0.25; });

  // ----- welcome conversation on walk-in (once per store per session) -----
  if (welcome) {
    const key = 'wvm_welcomed_' + store.slug;
    app.addTrigger(doorWorld[0], doorWorld[1], 2.6, (a) => {
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { }
      const greet = store.greeting || lines[0];
      a.popup(`${store.clerk?.name || 'Welcome'} · ${store.name} ${store.flag || ''}`, `<p style="font-size:17px">“${esc(greet)}”</p><p class="muted">${esc(store.about || '')}</p>`, [{ label: '🛍️ Browse the shelves', fn: () => { } }, ...aboutActions]);
    });
  }
  if (storePage) { const sp = makeSprite('ℹ️ Store page & all products', { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); sp.position.set(hw - 2.6, 1.3, 0.6); g.add(sp); app.addHotspot(sp, { go: `/stores/${store.slug}/`, label: `Opening ${store.name}…` }); }
  return g;
}

export function wingName(w) { return ({ lobby: 'Grand Lobby', americas: 'Americas Wing', europe: 'Europe Wing', asia: 'Asia & Islands Wing', food: 'Global Food Court', kids: "Kids' Discovery Zone", market: 'Old World Market' })[w] || 'Mall'; }

export function showProduct(app, store, p) {
  const img = p.img ? `<img src="${p.img}" alt="${esc(p.title)}" style="width:100%;max-height:220px;object-fit:contain;border-radius:12px;background:#fff;margin-bottom:8px" loading="lazy">` : '';
  const demo = store.demo || !p.url;
  app.popup(p.title, `${img}<p style="font-size:20px;color:#7cf8ff;margin:0 0 6px"><b>${esc(p.price || '')}</b></p><p>${esc(p.desc || '')}</p><p class="muted">${demo ? 'This is a demo store showing what a storefront looks like. A real brand could be here tomorrow.' : esc(store.name) + ' · ' + esc(store.city || '') + '. Checkout happens on the brand\'s own site.'}</p>`,
    demo ? [{ label: '🏬 Put my brand here', href: '/lease/', primary: true }] : [{ label: '🛒 Buy now', href: p.url, newTab: !p.url.startsWith('/'), primary: true }, { label: '＋ Add to my list', fn: () => app.addToList({ title: p.title, price: p.price, url: p.url, store: store.name }), keep: true }]);
}
