/* World VR Mall — storefront builder v2 (shared by the mall and every store page)
   buildStore(app, store, { x, z, rot, placeholder }) → THREE.Group
   rot: 0 = door faces +Z, Math.PI = faces -Z, Math.PI/2 = faces +X, -Math.PI/2 = faces -X
   Footprint: 14 wide, 12 deep, 7 tall. */
import { THREE, makePerson, makeSprite, makeTextTexture, pick, rand, esc, L } from './wvm-engine.js?v=4';

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
  const big = store.size === 'large'; const W = big ? 24 : STORE_W, D = big ? 20 : STORE_D, H = big ? 9 : STORE_H, hw = W / 2;
  const demo = !!store.demo; const layout = store.layout || 'shelves';
  g.userData.dims = { W, D, H };

  // floor + walls + ceiling
  const floor = new T.Mesh(new T.PlaneGeometry(W, D), M(hex(colors.floor), { roughness: 0.45, metalness: 0.15 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.02, -D / 2); g.add(floor);
  const wallM = M(hex(colors.wall));
  const back = new T.Mesh(new T.BoxGeometry(W, H, 0.3), wallM); back.position.set(0, H / 2, -D); g.add(back);
  for (const sx of [-1, 1]) { const side = new T.Mesh(new T.BoxGeometry(0.3, H, D), wallM); side.position.set(sx * hw, H / 2, -D / 2); g.add(side); }
  const ceil = new T.Mesh(new T.PlaneGeometry(W, D), M(0xffffff, { side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: placeholder ? 0.15 : 0.35 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.05, -D / 2); g.add(ceil);
  for (const zz of (big ? [-3, -7, -11, -15] : [-3, -6, -9])) { const strip = new T.Mesh(new T.BoxGeometry(W - 2, 0.1, 0.3), new T.MeshBasicMaterial({ color: placeholder ? 0x445 : 0xffffff })); strip.position.set(0, H - 0.2, zz); g.add(strip); }
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

  const aboutActions = [{ label: store.cta || 'Visit website', href: store.url, newTab: !!(store.url && store.url.startsWith('http')), primary: true }, ...(store.lead ? [{ label: '✉️ Get in touch', fn: () => leadForm(app, store, store.leadIntro), keep: true }] : [])];
  // ----- layouts: every store type gets its own furniture, so no two feel alike -----
  const shelfM = M(0xdfe6f5, { metalness: 0.3, roughness: 0.4 }), lipM = new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.9 });
  const woodM = M(0x8a5a2b, { roughness: 0.9 }), darkM = M(0x1e2a4a, { metalness: 0.6, roughness: 0.3 });
  const slots = []; const used = new Set();
  const addCard = (p, i, s, scale = 1) => {
    const card = new T.Group(); card.position.set(s.x, s.y, s.z); card.rotation.y = s.rotY; card.scale.setScalar(scale);
    const frame = new T.Mesh(new T.BoxGeometry(1.7, 1.7, 0.12), M(0xffffff, { roughness: 0.3 })); card.add(frame);
    const face = new T.Mesh(new T.PlaneGeometry(1.55, 1.55), new T.MeshBasicMaterial({ map: cardTexture(p, colors) })); face.position.z = 0.07; card.add(face);
    if (p.img) { imgLoader.load(p.img, (tex) => { tex.colorSpace = T.SRGBColorSpace; face.material.map = tex; face.material.needsUpdate = true; const cap = new T.Mesh(new T.PlaneGeometry(1.55, 0.36), new T.MeshBasicMaterial({ map: priceTag(p.price || '', colors.trim), transparent: true })); cap.position.set(0, -0.62, 0.08); card.add(cap); }, undefined, () => { }); }
    const ring = new T.Mesh(new T.RingGeometry(1.0, 1.08, 32), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.35, side: T.DoubleSide })); ring.position.z = 0.05; card.add(ring);
    app.onUpdate((dt, t) => { ring.material.opacity = 0.2 + Math.sin(t * 2 + i) * 0.15; });
    g.add(card); app.addHotspot(card, { fn: (a) => showProduct(a, store, p) }); return card;
  };
  const fillGroup = (x, y, z, rotY, n = 4, spread = 0.6) => { const grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY; for (let k = 0; k < n; k++) { const f = filler(colors); f.position.set(-((n - 1) * spread) / 2 + k * spread, 0, rand(-0.15, 0.15)); grp.add(f); } g.add(grp); return grp; };
  const wallShelves = (levels = [0.95, 2.55], perLevel = 3) => {
    const len = D - 3.6; for (const sx of [-1, 1]) { for (const y of levels) { const sh = new T.Mesh(new T.BoxGeometry(1.0, 0.08, len), shelfM); sh.position.set(sx * (hw - 0.65), y, -D / 2 - 1.3); g.add(sh); const lip = new T.Mesh(new T.BoxGeometry(0.06, 0.06, len), lipM); lip.position.set(sx * (hw - 1.15), y + 0.05, -D / 2 - 1.3); g.add(lip); for (let k = 0; k < perLevel; k++) slots.push({ x: sx * (hw - 0.9), y: y + 0.95, z: -2.4 - k * (len - 1) / (perLevel - 1 || 1), rotY: sx * -Math.PI / 2, shelfY: y + 0.04, side: true }); } for (const zz of [-1.2, -D + 2.2]) { const col = new T.Mesh(new T.BoxGeometry(0.3, 3.4, 0.3), M(0xffffff)); col.position.set(sx * (hw - 0.65), 1.7, zz); g.add(col); } }
    const backShelf = new T.Mesh(new T.BoxGeometry(W - 3, 0.08, 0.9), shelfM); backShelf.position.set(0, 2.2, -D + 0.6); g.add(backShelf);
    for (let k = 0; k < 3; k++) slots.push({ x: -(W - 6) / 2 + k * (W - 6) / 2, y: 3.15, z: -D + 0.65, rotY: 0, shelfY: 2.24, side: false });
    for (const sx of [-1, 1]) { const row = new T.Group(); row.position.set(sx * (hw - 0.5), 4.3, -D / 2 - 1.3); const rail = new T.Mesh(new T.BoxGeometry(0.6, 0.06, D - 4), shelfM); row.add(rail); for (let k = 0; k < Math.floor((D - 4) / 1.15); k++) { const f = filler(colors); f.position.set(0, 0.03, -(D - 4) / 2 + 0.6 + k * 1.15); f.rotation.y = sx * -Math.PI / 2; row.add(f); } g.add(row); }
  };
  const pedestal = (x, z, h = 1.0, r = 0.6) => { const p = new T.Mesh(new T.CylinderGeometry(r, r + 0.1, h, 16), M(0xffffff, { roughness: 0.3, metalness: 0.2 })); p.position.set(x, h / 2, z); g.add(p); const ring = new T.Mesh(new T.TorusGeometry(r + 0.05, 0.04, 6, 24), lipM); ring.rotation.x = Math.PI / 2; ring.position.set(x, h, z); g.add(ring); box(x, z, r + 0.2, r + 0.2); return p; };
  const products = (store.products || []);
  if (layout === 'showroom') {
    // big showroom: aisles of pedestals, product cards standing on them, wall cards on both sides, sign per aisle
    const rows = big ? 3 : 2, cols = big ? 6 : 4; const zx = -3.2, dz = (D - 6) / (cols - 1 || 1), dx = (W - 6) / (rows - 1 || 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -(W - 6) / 2 + r * dx, z = zx - c * dz; pedestal(x, z, 0.9, 0.7); slots.push({ x, y: 1.85, z, rotY: 0, shelfY: 0.94, side: false, ped: true }); }
    for (const sx of [-1, 1]) for (const y of [1.6, 3.6]) for (let k = 0; k < (big ? 7 : 4); k++) slots.push({ x: sx * (hw - 0.4), y, z: -1.8 - k * (D - 3) / (big ? 7 : 4), rotY: sx * -Math.PI / 2, shelfY: y - 0.9, side: true, wall: true });
    const aisleSign = (x, z, t) => { const sg = new T.Mesh(new T.PlaneGeometry(4, 0.8), new T.MeshBasicMaterial({ map: makeTextTexture(t, { w: 1024, h: 200, bg: colors.trim, fg: '#04122a', border: null, glow: false, font: 'bold 96px Poppins, Segoe UI, Arial', radius: 30 }), transparent: true, side: T.DoubleSide })); sg.position.set(x, H - 1.2, z); g.add(sg); const c = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.2, 4), M(0x9aa7c7)); c.position.set(x, H - 0.5, z); g.add(c); };
    if (big) { aisleSign(-(W - 6) / 2, -3, 'SHOWER PANS'); aisleSign(0, -3, 'FULL PACKAGES'); aisleSign((W - 6) / 2, -3, 'DESIGNER SYSTEMS'); }
    // put pans on the left row, packages middle/right if categories exist
    const cats = ['pan', 'package', 'service']; const ordered = products.slice().sort((a, b) => cats.indexOf(a.cat || 'pan') - cats.indexOf(b.cat || 'pan'));
    ordered.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, sl.wall ? 1.1 : 0.95); });
    // a demo shower unit on the floor (walls + pan + glass) for showrooms
    const unit = new T.Group(); unit.position.set(hw - 3.2, 0, -D + 3.6); const pan = new T.Mesh(new T.BoxGeometry(2.4, 0.15, 2.0), M(0xffffff, { roughness: 0.2 })); pan.position.y = 0.08; unit.add(pan); const wall1 = new T.Mesh(new T.BoxGeometry(2.4, 2.2, 0.1), M(0xe4ecff, { roughness: 0.3 })); wall1.position.set(0, 1.2, -1); unit.add(wall1); const wall2 = new T.Mesh(new T.BoxGeometry(0.1, 2.2, 2), wall1.material); wall2.position.set(-1.2, 1.2, 0); unit.add(wall2); const gl = new T.Mesh(new T.BoxGeometry(0.05, 2.1, 2), glassM); gl.position.set(1.2, 1.2, 0); unit.add(gl); const head = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.04, 12), M(0xdddddd, { metalness: 0.9 })); head.position.set(0, 2.1, -0.6); unit.add(head); const bar = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.8, 8), head.material); bar.rotation.z = Math.PI / 2; bar.position.set(-1.1, 1.1, 0.3); unit.add(bar); g.add(unit); box(hw - 3.2, -D + 3.6, 1.4, 1.2);
    app.addHotspot(unit, { title: 'Display unit', html: '<p>A barrier-free shower: zero-threshold pan, wall panels, grab bar, glass. This is the kind of thing that makes a bathroom safe to age in.</p>', actions: [{ label: store.cta || 'See all showers', href: store.url, newTab: true, primary: true }] });
  } else if (layout === 'boutique') {
    // clothing racks with hanging garments, a round display table, a mirror; products on wall cards + table
    for (const sx of [-1, 1]) { for (let k = 0; k < 2; k++) { const z = -3 - k * 4; const rack = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 3, 6), M(0xdddddd, { metalness: 0.9 })); rack.rotation.x = Math.PI / 2; rack.position.set(sx * (hw - 1.6), 1.7, z); g.add(rack); for (const lx of [-1, 1]) { const leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.7, 6), rack.material); leg.position.set(sx * (hw - 1.6), 0.85, z + lx * 1.4); g.add(leg); } for (let h = 0; h < 6; h++) { const shirt = new T.Mesh(new T.BoxGeometry(0.5, 0.7, 0.06), M(pick([hex(colors.trim).getHex(), 0xffffff, 0x1e2a4a, 0xf2b5d4, 0xffd23f, 0x2b8a3e]))); shirt.position.set(sx * (hw - 1.6), 1.3, z - 1.2 + h * 0.45); g.add(shirt); const hanger = new T.Mesh(new T.TorusGeometry(0.06, 0.01, 4, 8), rack.material); hanger.position.set(sx * (hw - 1.6), 1.68, z - 1.2 + h * 0.45); g.add(hanger); } box(sx * (hw - 1.6), z, 0.4, 1.6); } }
    const table = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.1, 24), woodM); table.position.set(0, 0.9, -D / 2 - 1); g.add(table); const tl = new T.Mesh(new T.CylinderGeometry(0.15, 0.3, 0.9, 10), woodM); tl.position.set(0, 0.45, -D / 2 - 1); g.add(tl); box(0, -D / 2 - 1, 1.7, 1.7);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; slots.push({ x: Math.cos(a) * 1.0, y: 1.9, z: -D / 2 - 1 + Math.sin(a) * 1.0, rotY: -a + Math.PI / 2, shelfY: 0.95, side: false }); }
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) slots.push({ x: sx * (hw - 0.4), y: 3.6, z: -2.5 - k * 5, rotY: sx * -Math.PI / 2, shelfY: 2.7, side: true });
    const mirror = new T.Mesh(new T.PlaneGeometry(2.2, 4.4), new T.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 1, roughness: 0.05, envMapIntensity: 2 })); mirror.position.set(-hw + 0.2, 2.6, -D + 3.5); mirror.rotation.y = Math.PI / 2; g.add(mirror); const mf = new T.Mesh(new T.BoxGeometry(0.1, 4.6, 2.4), M(0xffd23f, { metalness: 0.8 })); mf.position.set(-hw + 0.15, 2.6, -D + 3.5); g.add(mf);
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, sl.side ? 1 : 0.8); });
  } else if (layout === 'cafe') {
    // counter across the front third, menu board with every product, stools, tables; sit & order interactable
    const cnt = new T.Mesh(new T.BoxGeometry(W - 4, 1.1, 1.4), M(hex(colors.trim).getHex(), { roughness: 0.4 })); cnt.position.set(0, 0.55, -3.5); g.add(cnt); const top = new T.Mesh(new T.BoxGeometry(W - 3.8, 0.12, 1.6), woodM); top.position.set(0, 1.16, -3.5); g.add(top); box(0, -3.5, (W - 4) / 2, 0.8);
    const menuTex = (() => { const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const gg = c.getContext('2d'); gg.fillStyle = '#111'; gg.fillRect(0, 0, 1400, 900); gg.fillStyle = colors.trim; gg.font = 'bold 84px Poppins, Segoe UI, Arial'; gg.textAlign = 'center'; gg.fillText('MENU', 700, 100); gg.font = '52px Poppins, Segoe UI, Arial'; gg.textAlign = 'left'; products.slice(0, 10).forEach((p, i) => { const col = i < 5 ? 60 : 720, row = 210 + (i % 5) * 130; gg.fillStyle = '#fff'; gg.fillText((p.icon || '•') + ' ' + p.title.slice(0, 22), col, row); gg.fillStyle = colors.trim; gg.textAlign = 'right'; gg.fillText(p.price || '', col + 600, row); gg.textAlign = 'left'; }); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const board = new T.Mesh(new T.PlaneGeometry(W - 5, (W - 5) * 0.64), new T.MeshBasicMaterial({ map: menuTex })); board.position.set(0, H - 2.4 - (W - 5) * 0.32 + 1.2, -D + 0.2); g.add(board);
    app.addHotspot(board, { fn: (a) => a.popup(store.name + ' · Menu', products.map(p => `<p style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1);padding:6px 0"><span>${esc(p.icon || '')} ${esc(p.title)}<br><small class="muted">${esc(p.desc || '')}</small></span><b style="color:#7cf8ff">${esc(p.price || '')}</b></p>`).join(''), [{ label: demo ? '🏬 Put my restaurant here' : (store.cta || 'Order / reserve'), href: demo ? '/lease/' : store.url, newTab: !demo, primary: true }]) });
    for (let k = 0; k < 5; k++) { const st = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.1, 12), M(0xff4f79)); st.position.set(-(W - 6) / 2 + k * (W - 6) / 4, 0.7, -1.9); g.add(st); const sl = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, 0.7, 8), darkM); sl.position.set(st.position.x, 0.35, -1.9); g.add(sl); }
    for (const [tx, tz] of [[-(hw - 3), -D + 4], [(hw - 3), -D + 4], [0, -D + 6.5]]) { const tb = new T.Mesh(new T.CylinderGeometry(1, 1, 0.08, 16), woodM); tb.position.set(tx, 0.85, tz); g.add(tb); const leg = new T.Mesh(new T.CylinderGeometry(0.08, 0.2, 0.85, 8), darkM); leg.position.set(tx, 0.42, tz); g.add(leg); for (let c = 0; c < 3; c++) { const ca = c * 2.1; const ch = new T.Mesh(new T.BoxGeometry(0.45, 0.45, 0.45), M(0xffffff)); ch.position.set(tx + Math.cos(ca) * 1.5, 0.4, tz + Math.sin(ca) * 1.5); g.add(ch); } box(tx, tz, 1.1, 1.1); }
    const eater = makePerson({ bag: false }); eater.position.set(-(hw - 3), 0.15, -D + 5.5); eater.rotation.y = 0; eater.userData.limbs.lL.rotation.x = eater.userData.limbs.lR.rotation.x = 1.4; g.add(eater);
    // sit & order
    const seatW = toW(0, -D + 6.5 + 1.6); const plates = [];
    app.addInteractable(seatW[0], seatW[1], 2.2, '🍽️ Sit down & order', (a) => { a.popup(`Table for one at ${store.name}`, `<p>“${esc((L(store.clerk?.lines) || [''])[0])}”</p><p>What can I get you?</p>`, products.slice(0, 6).map(p => ({ label: `${p.icon || '🍽️'} ${p.title} · ${p.price || ''}`, keep: false, fn: () => { const pl = makeSprite(`${p.icon || '🍽️'}  ${p.title}`, { scale: 3.5, bg: 'rgba(255,255,255,0.95)', fg: '#111', accent: colors.trim }); pl.position.set(0, 1.3, -D + 6.5); g.add(pl); plates.push(pl); a.toast(`${p.title} coming right up! 🧑‍🍳`, 3000); setTimeout(() => { g.remove(pl); }, 20000); } }))); });
    const waiter = makePerson({ shirt: 0xffffff, pants: 0x111111, bag: false }); const wp = [[-(hw - 3), -D + 6], [0, -D + 8], [(hw - 3), -D + 6]].map(([lx, lz]) => { const [wx, wz] = toW(lx, lz); return new T.Vector3(wx, 0, wz); }); app.addNPC(waiter, wp, { speed: 1.2, pause: 4 }); const wt = makeSprite('waiter', { scale: 2.5, bg: 'rgba(8,20,50,0.85)', accent: '#fff' }); wt.position.y = 2.4; waiter.add(wt);
    app.addHotspot(waiter, { fn: (a) => a.popup('Your waiter', '<p>“Grab any table. Tap the green button when you sit and I\'ll take your order.”</p>') });
  } else if (layout === 'tech') {
    // dark room, glowing glass pedestals in a grid, neon floor lines
    floor.material = M(0x0a0a12, { roughness: 0.2, metalness: 0.4 }); for (const sx of [-1, 1]) { const line = new T.Mesh(new T.PlaneGeometry(0.12, D - 1), new T.MeshBasicMaterial({ color: trim })); line.rotation.x = -Math.PI / 2; line.position.set(sx * (hw - 2.2), 0.035, -D / 2); g.add(line); }
    const cols = 3, rows = 2; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -(W - 7) / 2 + c * (W - 7) / (cols - 1), z = -3.5 - r * 4; const pd = new T.Mesh(new T.BoxGeometry(1.2, 1.1, 1.2), new T.MeshPhysicalMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 })); pd.position.set(x, 0.55, z); g.add(pd); const glowB = new T.Mesh(new T.BoxGeometry(1.25, 0.06, 1.25), lipM); glowB.position.set(x, 0.03, z); g.add(glowB); box(x, z, 0.7, 0.7); slots.push({ x, y: 1.95, z, rotY: 0, shelfY: 1.12, side: false }); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) slots.push({ x: sx * (hw - 0.4), y: 3.2, z: -2.5 - k * 3.5, rotY: sx * -Math.PI / 2, shelfY: 2.3, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
    for (let k = 0; k < 8; k++) { const dot = new T.Mesh(new T.SphereGeometry(0.06, 6, 6), lipM); dot.position.set(rand(-hw + 1, hw - 1), rand(3.5, H - 0.5), rand(-D + 1, -1)); g.add(dot); app.onUpdate((dt, t) => { dot.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + k)); }); }
  } else if (layout === 'market') {
    // wooden crates, barrels, and a striped canopy; goods piled in crates
    floor.material = M(0xc9b48a, { roughness: 1 }); const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const gg = c.getContext('2d'); for (let i = 0; i < 8; i++) { gg.fillStyle = i % 2 ? colors.trim : '#ffffff'; gg.fillRect(i * 32, 0, 32, 64); } const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = T.SRGBColorSpace; return t; })();
    const canopy = new T.Mesh(new T.PlaneGeometry(W - 1, D - 2), M(0xffffff, { map: stripeTex, side: T.DoubleSide })); canopy.rotation.x = Math.PI / 2 - 0.08; canopy.position.set(0, H - 1.2, -D / 2); g.add(canopy);
    let k = 0; for (const sx of [-1, 1]) for (let c = 0; c < 3; c++) { const x = sx * (hw - 1.8), z = -2.5 - c * 3.4; const crate = new T.Mesh(new T.BoxGeometry(2, 1.0, 1.6), woodM); crate.position.set(x, 0.5, z); g.add(crate); box(x, z, 1.1, 0.9); slots.push({ x, y: 1.85, z, rotY: sx * -Math.PI / 2, shelfY: 1.04, side: true }); for (let f = 0; f < 5; f++) { const fl = filler(colors); fl.position.set(x + rand(-0.6, 0.6), 1.0, z + rand(-0.5, 0.5)); g.add(fl); } k++; }
    for (let c = 0; c < 3; c++) { const x = -3 + c * 3, z = -D + 3.5; const barrel = new T.Mesh(new T.CylinderGeometry(0.6, 0.55, 1.1, 14), woodM); barrel.position.set(x, 0.55, z); g.add(barrel); box(x, z, 0.7, 0.7); slots.push({ x, y: 1.95, z, rotY: 0, shelfY: 1.12, side: false }); }
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
    for (const sx of [-1, 1]) { const lantern = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), new T.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 1.5 })); lantern.position.set(sx * 3, H - 2, -D / 2); g.add(lantern); }
  } else if (layout === 'agency') {
    // office: reception desk, a big SERP TV showing search results, whiteboard pitch, meeting table
    const tvTex = (() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const gg = c.getContext('2d'); gg.fillStyle = '#fff'; gg.fillRect(0, 0, 1200, 700); gg.fillStyle = '#f1f3f4'; gg.fillRect(0, 0, 1200, 110); gg.fillStyle = '#fff'; gg.beginPath(); gg.roundRect(140, 30, 900, 56, 28); gg.fill(); gg.strokeStyle = '#dfe1e5'; gg.stroke(); gg.fillStyle = '#202124'; gg.font = '30px Arial'; gg.fillText((store.serpQuery || 'best ' + (store.tag || '').toLowerCase() + ' near me'), 170, 68); const rows = store.serp || [[host(store.url), store.name + ' — ' + store.tag, store.about || '']]; rows.slice(0, 3).forEach((r, i) => { const y = 170 + i * 170; gg.fillStyle = '#202124'; gg.font = '22px Arial'; gg.fillText(r[0], 60, y); gg.fillStyle = '#1a0dab'; gg.font = 'bold 34px Arial'; gg.fillText(r[1].slice(0, 48), 60, y + 45); gg.fillStyle = '#4d5156'; gg.font = '24px Arial'; gg.fillText(r[2].slice(0, 80), 60, y + 85); }); gg.fillStyle = '#188038'; gg.font = 'bold 26px Arial'; gg.fillText('#1 result', 60, 130); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const tv = new T.Mesh(new T.PlaneGeometry(7.2, 4.2), new T.MeshBasicMaterial({ map: tvTex })); tv.position.set(-hw + 0.2, 3.4, -D / 2 - 1); tv.rotation.y = Math.PI / 2; g.add(tv); const tvF = new T.Mesh(new T.BoxGeometry(0.1, 4.5, 7.5), M(0x111111)); tvF.position.set(-hw + 0.14, 3.4, -D / 2 - 1); g.add(tvF);
    app.addHotspot(tv, { title: 'That\'s the goal', html: `<p>Your business at the top of the search results, and cited in the AI answers, when people ask for what you do. That's the entire job.</p>`, actions: aboutActions });
    const wbTex = makeTextTexture(store.whiteboard || ['THE PLAN', '1. Get found', '2. Get chosen', '3. Grow'], { w: 1400, h: 900, bg: '#ffffff', fg: '#111', accent: colors.trim, border: '#ddd', glow: false, font: 'bold 96px Poppins, Segoe UI, Arial', radius: 20, align: 'left', pad: 80 });
    const wb = new T.Mesh(new T.PlaneGeometry(6, 3.9), new T.MeshBasicMaterial({ map: wbTex })); wb.position.set(hw - 0.2, 3.2, -D / 2 - 1); wb.rotation.y = -Math.PI / 2; g.add(wb);
    app.addHotspot(wb, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
    const table = new T.Mesh(new T.BoxGeometry(4.5, 0.12, 2), woodM); table.position.set(0, 0.9, -D / 2 - 1); g.add(table); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.9, 8), darkM); leg.position.set(sx * 2, 0.45, -D / 2 - 1 + sz * 0.8); g.add(leg); } box(0, -D / 2 - 1, 2.4, 1.2);
    for (let c = 0; c < 4; c++) { const ch = new T.Mesh(new T.BoxGeometry(0.5, 0.9, 0.5), M(0x1e2a4a)); ch.position.set(-1.7 + c * 1.15, 0.45, -D / 2 - 1 + (c % 2 ? 1.6 : -1.6)); g.add(ch); }
    for (let k = 0; k < Math.min(products.length, 6); k++) slots.push({ x: -2.5 + (k % 3) * 2.5, y: k < 3 ? 1.7 : 1.7, z: k < 3 ? -2.2 : -D / 2 - 1 + 0.01, rotY: 0, shelfY: 0.95, side: false });
    // service cards on easels at the front, and on the meeting table
    products.slice(0, 6).forEach((p, i) => { const sl = slots[i]; used.add(i); if (i < 3) { const es = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.6, 6), woodM); es.position.set(sl.x, 0.8, sl.z + 0.2); es.rotation.x = 0.15; g.add(es); addCard(p, i, { ...sl, y: 1.6 }, 0.9); } else addCard(p, i, { ...sl, y: 1.9, z: sl.z }, 0.75); });
    const plant = new T.Mesh(new T.ConeGeometry(0.8, 2.2, 8), M(0x3fa34d)); plant.position.set(hw - 1.2, 1.6, -D + 1.5); g.add(plant); const pot = new T.Mesh(new T.CylinderGeometry(0.5, 0.4, 0.6, 10), M(0xd9cbb0)); pot.position.set(hw - 1.2, 0.3, -D + 1.5); g.add(pot);
  } else if (layout === 'salon') {
    // styling chairs with mirrors along the left, product wall on the right, a tanning bed at the back
    for (let k = 0; k < 3; k++) { const z = -2.5 - k * 3.2; const chair = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.9), M(0x111111, { roughness: 0.4 })); chair.position.set(-hw + 2.2, 0.75, z); g.add(chair); const back = new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.2), chair.material); back.position.set(-hw + 2.2, 1.45, z - 0.35); g.add(back); const base = new T.Mesh(new T.CylinderGeometry(0.4, 0.5, 0.45, 12), M(0x9aa7c7, { metalness: 0.8 })); base.position.set(-hw + 2.2, 0.22, z); g.add(base); const mirror = new T.Mesh(new T.PlaneGeometry(1.4, 2.2), new T.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 1, roughness: 0.05, envMapIntensity: 2 })); mirror.position.set(-hw + 0.2, 2.2, z); mirror.rotation.y = Math.PI / 2; g.add(mirror); for (let b = 0; b < 4; b++) { const bulb = new T.Mesh(new T.SphereGeometry(0.06, 6, 6), new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.5 })); bulb.position.set(-hw + 0.25, 1.2 + b * 0.65, z - 0.8); g.add(bulb); const bulb2 = bulb.clone(); bulb2.position.z = z + 0.8; g.add(bulb2); } box(-hw + 2.2, z, 0.6, 0.6); }
    const client = makePerson({ bag: false, hairStyle: 'long' }); client.position.set(-hw + 2.2, 0.35, -2.5); client.rotation.y = -Math.PI / 2; client.userData.limbs.lL.rotation.x = client.userData.limbs.lR.rotation.x = 1.4; g.add(client);
    for (const y of [1.2, 2.4, 3.6]) { const sh = new T.Mesh(new T.BoxGeometry(0.5, 0.06, D - 4), shelfM); sh.position.set(hw - 0.4, y, -D / 2 - 1); g.add(sh); for (let k = 0; k < 8; k++) { const b = new T.Mesh(new T.CylinderGeometry(0.08, 0.09, rand(0.3, 0.5), 8), M(pick([0xffffff, 0xf2b5d4, 0xd81b60, 0x111111, 0xffd23f]))); b.position.set(hw - 0.4, y + 0.2, -2.2 - k * (D - 5) / 7); g.add(b); } }
    const bed = new T.Mesh(new T.BoxGeometry(2.2, 0.8, 1.0), M(0xffffff, { roughness: 0.2 })); bed.position.set(hw - 3, 0.4, -D + 2.2); g.add(bed); const lid = new T.Mesh(new T.BoxGeometry(2.2, 0.15, 1.0), new T.MeshStandardMaterial({ color: 0x9ad0ff, emissive: 0x38a0ff, emissiveIntensity: 0.8 })); lid.position.set(hw - 3, 1.35, -D + 2.6); lid.rotation.x = -0.8; g.add(lid); box(hw - 3, -D + 2.2, 1.2, 0.6);
    app.addHotspot(bed, { title: 'UV Tanning', html: '<p>Sun-kissed, year-round. Book a session.</p>', actions: aboutActions });
    for (let k = 0; k < Math.min(products.length, 5); k++) slots.push({ x: hw - 1.2, y: 1.95, z: -2.2 - k * (D - 5) / 4, rotY: -Math.PI / 2, shelfY: 1.05, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.8); });
  } else if (layout === 'garage') {
    // a car on a lift, tool wall, stack of tires, service cards on the wall
    floor.material = M(0x3b3f47, { roughness: 0.9 }); const car = new T.Group(); car.position.set(0, 1.4, -D / 2 - 1); const bodyM = M(hex(colors.trim).getHex(), { metalness: 0.6, roughness: 0.3 }); const cb = new T.Mesh(new T.BoxGeometry(2.2, 0.7, 4.6), bodyM); cb.position.y = 0.6; car.add(cb); const cab = new T.Mesh(new T.BoxGeometry(1.9, 0.7, 2.4), bodyM); cab.position.set(0, 1.25, -0.2); car.add(cab); const ws = new T.Mesh(new T.BoxGeometry(1.8, 0.6, 0.1), glassM); ws.position.set(0, 1.25, 1.05); car.add(ws); for (const sx of [-1, 1]) for (const sz of [-1.5, 1.5]) { const w = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 14), M(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.15, 0.42, sz); car.add(w); } g.add(car); for (const sx of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(0.3, 2.8, 0.3), M(0xff8a00)); post.position.set(sx * 1.7, 1.4, -D / 2 - 1); g.add(post); } box(0, -D / 2 - 1, 1.9, 2.6);
    app.addHotspot(car, { title: 'On the lift', html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
    for (let k = 0; k < 12; k++) { const tool = new T.Mesh(new T.BoxGeometry(0.12, rand(0.3, 0.7), 0.08), M(0x9aa7c7, { metalness: 0.9 })); tool.position.set(-hw + 0.25, 2 + (k % 3) * 0.9, -2 - Math.floor(k / 3) * 1.6); g.add(tool); }
    for (let k = 0; k < 4; k++) { const tire = new T.Mesh(new T.TorusGeometry(0.45, 0.18, 8, 20), M(0x111111)); tire.rotation.x = Math.PI / 2; tire.position.set(hw - 1.2, 0.2 + k * 0.38, -D + 1.6); g.add(tire); } box(hw - 1.2, -D + 1.6, 0.7, 0.7);
    for (let k = 0; k < Math.min(products.length, 5); k++) slots.push({ x: hw - 0.4, y: 2.4 + (k % 2) * 1.9, z: -2.5 - Math.floor(k / 2) * 3.2, rotY: -Math.PI / 2, shelfY: 1.5, side: true });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); addCard(p, i, sl, 0.85); });
  } else if (layout === 'travel') {
    // photo-wall posters, palm trees, a hammock, a surfboard; cards along a sandy floor
    floor.material = M(0xf0dcae, { roughness: 1 }); for (const sx of [-1, 1]) { const trunk = new T.Mesh(new T.CylinderGeometry(0.15, 0.2, 4.5, 8), M(0x8a5a2b)); trunk.position.set(sx * (hw - 1.4), 2.25, -D + 1.6); trunk.rotation.z = sx * -0.15; g.add(trunk); for (let f = 0; f < 6; f++) { const leaf = new T.Mesh(new T.BoxGeometry(2.2, 0.05, 0.5), M(0x3fa34d)); const a = f / 6 * Math.PI * 2; leaf.position.set(sx * (hw - 1.4) + Math.cos(a) * 0.9, 4.5, -D + 1.6 + Math.sin(a) * 0.9); leaf.rotation.y = -a; leaf.rotation.z = -0.35; g.add(leaf); } box(sx * (hw - 1.4), -D + 1.6, 0.5, 0.5); }
    const hm = new T.Mesh(new T.PlaneGeometry(2.6, 1.1), M(0xffffff, { map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const gg = c.getContext('2d'); gg.fillStyle = colors.trim; gg.fillRect(0, 0, 128, 64); gg.fillStyle = '#fff'; for (let i = 0; i < 8; i++) gg.fillRect(i * 16, 0, 8, 64); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })(), side: T.DoubleSide })); hm.position.set(0, 1.2, -D + 1.8); hm.rotation.x = -Math.PI / 2 + 0.3; g.add(hm);
    const board = new T.Mesh(new T.BoxGeometry(0.6, 2.4, 0.08), M(0xffd23f)); board.position.set(hw - 3.5, 1.2, -D + 0.4); board.rotation.z = 0.12; g.add(board);
    const wave = new T.Mesh(new T.PlaneGeometry(W - 1, 2.5), new T.MeshBasicMaterial({ map: makeTextTexture(store.tagline || [store.city + ' · ' + store.tag], { w: 2000, h: 300, bg: '#0891b2', fg: '#fff', accent: '#fde047', font: 'bold 120px Poppins, Segoe UI, Arial', radius: 0, border: null }) })); wave.position.set(0, H - 1.6, -D + 0.25); g.add(wave);
    for (let k = 0; k < Math.min(products.length, 6); k++) slots.push({ x: -(W - 6) / 2 + (k % 3) * (W - 6) / 2, y: 1.9, z: k < 3 ? -3 : -6.5, rotY: 0, shelfY: 0.95, side: false });
    products.forEach((p, i) => { const sl = slots[i]; if (!sl) return; used.add(i); pedestal(sl.x, sl.z, 0.9, 0.5); addCard(p, i, sl, 0.9); });
  } else {
    wallShelves(); products.slice(0, slots.length).forEach((p, i) => { used.add(i); addCard(p, i, slots[i]); });
    slots.forEach((sl, i) => { if (used.has(i)) return; fillGroup(sl.x, sl.shelfY, sl.z, sl.rotY, 4); });
  }
  // ----- wall posters + back-wall billboard -----
  const posters = store.posters || [[store.tag.toUpperCase(), store.city || ''], ['WHY ' + store.name.toUpperCase() + '?', (store.about || '').split('. ')[0].slice(0, 60)]];
  posters.slice(0, 2).forEach((lines, i) => {
    const sx = i === 0 ? -1 : 1;
    const ps = new T.Mesh(new T.PlaneGeometry(5.6, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture(lines, { w: 1400, h: 550, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 84px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true }));
    ps.position.set(sx * (hw - 0.18), 5.6, -D / 2 - 1.3); ps.rotation.y = sx * -Math.PI / 2; g.add(ps);
    app.addHotspot(ps, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });
  });
  const bb = new T.Mesh(new T.PlaneGeometry(W - 3, 2.2), new T.MeshBasicMaterial({ map: makeTextTexture([store.pitchLine || (store.cta || 'Visit ' + host(store.url)), demo ? 'Demo store · yours could be here' : (host(store.url) || store.city || '')], { w: 2000, h: 400, bg: store.logo?.bg || colors.wall, fg: store.logo?.fg || '#fff', accent: colors.trim, font: 'bold 110px Poppins, Segoe UI, Arial', radius: 40, border: colors.trim }), transparent: true })); bb.position.set(0, 5.4, -D + 0.2); g.add(bb);
  app.addHotspot(bb, { title: store.name, html: `<p>${esc(store.about || '')}</p>`, actions: aboutActions });

  // ----- counter + clerk -----
  const counterZ = layout === 'cafe' ? -3.5 : -D + 3.2;
  if (layout !== 'cafe') { const counter = new T.Mesh(new T.BoxGeometry(5, 1.1, 1.2), M(trimHex, { roughness: 0.3, metalness: 0.2 })); counter.position.set(0, 0.55, -D + 3.2); g.add(counter);
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

export function wingName(w) { return ({ lobby: 'Grand Lobby', americas: 'Americas Wing', europe: 'Europe Wing', asia: 'Asia & Islands Wing', food: 'Global Food Court', kids: "Kids' Discovery Zone", market: 'Old World Market' })[w] || 'Mall'; }

export function showProduct(app, store, p) {
  const img = p.img ? `<img src="${p.img}" alt="${esc(p.title)}" style="width:100%;max-height:220px;object-fit:contain;border-radius:12px;background:#fff;margin-bottom:8px" loading="lazy">` : '';
  const demo = store.demo || !p.url;
  app.popup(p.title, `${img}<p style="font-size:20px;color:#7cf8ff;margin:0 0 6px"><b>${esc(p.price || '')}</b></p><p>${esc(p.desc || '')}</p><p class="muted">${demo ? 'This is a demo store showing what a storefront looks like. A real brand could be here tomorrow.' : esc(store.name) + ' · ' + esc(store.city || '') + '. Checkout happens on the brand\'s own site.'}</p>`,
    demo ? [{ label: '🏬 Put my brand here', href: '/lease/', primary: true }] : [{ label: '🛒 Buy now', href: p.url, newTab: !p.url.startsWith('/'), primary: true }, { label: '＋ Add to my list', fn: () => app.addToList({ title: p.title, price: p.price, url: p.url, store: store.name }), keep: true }]);
}
