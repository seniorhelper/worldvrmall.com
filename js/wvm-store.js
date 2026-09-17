/* World VR Mall — storefront builder (shared by mall.html and store pages)
   buildStore(app, store, { x, z, rot, placeholder }) → THREE.Group
   rot: 0 = door faces +Z, Math.PI = faces -Z, Math.PI/2 = faces +X, -Math.PI/2 = faces -X
   Store footprint: 14 wide, 12 deep, 7 tall. */
import { THREE, makePerson, makeSprite, pick, rand, esc } from './wvm-engine.js';

const T = THREE;
const hex = (s) => new T.Color(s);
export const STORE_W = 14, STORE_D = 12, STORE_H = 7;

/* Logo sign texture: emoji + brand text + sub line in the brand's colors */
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

/* Product card texture (fallback when there is no image, or as a caption) */
function cardTexture(p, colors) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = colors.trim || '#38f0ff'; g.fillRect(0, 0, 512, 18);
  g.fillStyle = '#0b1a3a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  wrap(g, p.title, 256, 200, 440, 'bold 40px Poppins, "Segoe UI", Arial', 48);
  g.fillStyle = colors.trim || '#38f0ff'; g.font = 'bold 44px Poppins, "Segoe UI", Arial'; g.fillText(p.price || '', 256, 380);
  g.fillStyle = '#0b1a3a'; g.font = '26px Poppins, "Segoe UI", Arial'; g.fillText('tap to view', 256, 460);
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

/* ------------------------------------------------------------ */
export function buildStore(app, store, opts = {}) {
  const { x = 0, z = 0, rot = 0, placeholder = false, label = true, storePage = true } = opts;
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.userData.store = store;
  const colors = store.colors || { wall: '#123', floor: '#0b1a3a', trim: '#38f0ff' };
  const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const trim = hex(colors.trim);
  const W = STORE_W, D = STORE_D, H = STORE_H, hw = W / 2;

  // floor + walls (interior goes from z=0 back to z=-D)
  const floor = new T.Mesh(new T.PlaneGeometry(W, D), M(hex(colors.floor), { roughness: 0.5, metalness: 0.15 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.02, -D / 2); g.add(floor);
  const wallM = M(hex(colors.wall));
  const back = new T.Mesh(new T.BoxGeometry(W, H, 0.3), wallM); back.position.set(0, H / 2, -D); g.add(back);
  for (const sx of [-1, 1]) { const side = new T.Mesh(new T.BoxGeometry(0.3, H, D), wallM); side.position.set(sx * hw, H / 2, -D / 2); g.add(side); }
  const ceil = new T.Mesh(new T.PlaneGeometry(W, D), M(0xffffff, { side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: placeholder ? 0.15 : 0.35 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H - 0.05, -D / 2); g.add(ceil);
  // light strips
  for (const zz of [-3, -6, -9]) { const strip = new T.Mesh(new T.BoxGeometry(W - 2, 0.1, 0.3), new T.MeshBasicMaterial({ color: placeholder ? 0x445 : 0xffffff })); strip.position.set(0, H - 0.2, zz); g.add(strip); }
  // facade: header band with logo, glass panels, door opening
  const header = new T.Mesh(new T.BoxGeometry(W + 0.6, 2.2, 0.6), M(hex(store.logo?.bg || colors.wall), { roughness: 0.4 })); header.position.set(0, H - 1.1, 0.3); g.add(header);
  const logo = new T.Mesh(new T.PlaneGeometry(W - 1, 1.9), new T.MeshBasicMaterial({ map: logoTexture(store.logo || { text: store.name }) })); logo.position.set(0, H - 1.1, 0.62); g.add(logo);
  const trimBar = new T.Mesh(new T.BoxGeometry(W + 0.6, 0.15, 0.7), new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: placeholder ? 0.3 : 1.2 })); trimBar.position.set(0, H - 2.25, 0.3); g.add(trimBar);
  const glassM = new T.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false });
  for (const sx of [-1, 1]) { const pane = new T.Mesh(new T.BoxGeometry(hw - 2.2, H - 2.2, 0.12), glassM); pane.position.set(sx * (hw - (hw - 2.2) / 2), (H - 2.2) / 2, 0); g.add(pane); const frame = new T.Mesh(new T.BoxGeometry(0.16, H - 2.2, 0.3), M(0x1e2a4a, { metalness: 0.6 })); frame.position.set(sx * 2.2, (H - 2.2) / 2, 0); g.add(frame); }
  // door mat + welcome light
  const mat = new T.Mesh(new T.PlaneGeometry(4, 1.6), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: placeholder ? 0.25 : 0.7 })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.03, 0.9); g.add(mat);
  // city / flag plaque
  const plaque = makeSprite(`${store.flag || '🏬'} ${store.city || ''}`, { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); plaque.position.set(0, H + 1.2, 0.5); if (label) g.add(plaque);

  // obstacles (world space)
  const box = (lx, lz, lhw, lhd) => {
    const c = Math.cos(rot), s = Math.sin(rot); const toW = (px, pz) => [x + px * c + pz * s, z - px * s + pz * c];
    const k = Math.round(rot / (Math.PI / 2)) * Math.PI / 2;
    if (Math.abs(rot - k) < 0.01) { const [wx, wz] = toW(lx, lz); const quarter = Math.abs(Math.abs(k) - Math.PI / 2) < 0.01; app.addBox(wx, wz, quarter ? lhd : lhw, quarter ? lhw : lhd); return; }
    // arbitrary angle: approximate the wall with a row of circles
    const along = lhw >= lhd ? 'x' : 'z', half = Math.max(lhw, lhd), r = Math.min(lhw, lhd) + 0.6, n = Math.max(1, Math.ceil(half / r));
    for (let i = 0; i <= n; i++) { const o = -half + (2 * half) * (i / n); const [wx, wz] = along === 'x' ? toW(lx + o, lz) : toW(lx, lz + o); app.addObstacle(wx, wz, r); }
  };
  box(-hw, -D / 2, 0.4, D / 2 + 0.3); box(hw, -D / 2, 0.4, D / 2 + 0.3); box(0, -D, hw + 0.3, 0.4);
  box(-(hw + 2.2) / 2, 0, (hw - 2.2) / 2, 0.3); box((hw + 2.2) / 2, 0, (hw - 2.2) / 2, 0.3);

  if (placeholder) {
    const s1 = makeSprite('SPACE AVAILABLE', { scale: 8, bg: 'rgba(255,79,121,0.9)', fg: '#fff', accent: '#ffd23f' }); s1.position.set(0, 3.8, -4); g.add(s1);
    const s2 = makeSprite(`Reserved for a ${store.tag} brand from ${store.city}`, { scale: 9, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); s2.position.set(0, 2.6, -4); g.add(s2);
    // empty shelves
    for (const sx of [-1, 1]) for (const y of [1.2, 2.6]) { const sh = new T.Mesh(new T.BoxGeometry(0.4, 0.08, D - 3), M(0x9aa7c7)); sh.position.set(sx * (hw - 0.5), y, -D / 2 - 0.5); g.add(sh); }
    const hot = { title: `${store.name} — space available`, html: `<p>This storefront in the <b>${esc(wingName(store.wing))}</b> is reserved for a <b>${esc(store.tag)}</b> brand from <b>${esc(store.city)}</b>. It could be yours instead.</p><p>Ten-minute setup. Your logo, your products, buy buttons to your own site, an AI clerk, and a search-optimized store page. Premium spots go first come, first served.</p>`, actions: [{ label: '📞 Claim this space: 1-800-481-8638', href: 'tel:18004818638', newTab: true, primary: true }, { label: 'Leasing details', href: '/lease/' }] };
    app.addHotspot(g, hot);
    return g;
  }

  // ----- shelves + product cards -----
  const products = (store.products || []).slice(0, 12);
  const slots = [];
  for (const sx of [-1, 1]) for (const y of [1.3, 2.9]) for (let k = 0; k < 3; k++) slots.push({ x: sx * (hw - 0.95), y, z: -2.6 - k * 2.6, rotY: sx * -Math.PI / 2 });
  for (let k = 0; k < 3; k++) slots.push({ x: -3.6 + k * 3.6, y: 2.1, z: -D + 0.9, rotY: 0 }); // back wall (behind counter, higher)
  // order: fill left/right lower first for visibility
  const order = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11, 12, 13, 14];
  for (const sx of [-1, 1]) for (const y of [1.0, 2.6]) { const sh = new T.Mesh(new T.BoxGeometry(0.9, 0.08, D - 3.5), M(0xdfe6f5, { metalness: 0.3, roughness: 0.4 })); sh.position.set(sx * (hw - 0.6), y, -D / 2 - 1.2); g.add(sh); const lip = new T.Mesh(new T.BoxGeometry(0.06, 0.06, D - 3.5), new T.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.9 })); lip.position.set(sx * (hw - 1.06), y + 0.05, -D / 2 - 1.2); g.add(lip); }
  products.forEach((p, i) => {
    const s = slots[order[i]] || slots[i]; if (!s) return;
    const card = new T.Group(); card.position.set(s.x, s.y, s.z); card.rotation.y = s.rotY;
    const frame = new T.Mesh(new T.BoxGeometry(1.7, 1.7, 0.12), M(0xffffff, { roughness: 0.3 })); card.add(frame);
    const face = new T.Mesh(new T.PlaneGeometry(1.55, 1.55), new T.MeshBasicMaterial({ map: cardTexture(p, colors) })); face.position.z = 0.07; card.add(face);
    if (p.img) { imgLoader.load(p.img, (tex) => { tex.colorSpace = T.SRGBColorSpace; face.material.map = tex; face.material.needsUpdate = true; const cap = new T.Mesh(new T.PlaneGeometry(1.55, 0.36), new T.MeshBasicMaterial({ map: priceTag(p.price || '', colors.trim), transparent: true })); cap.position.set(0, -0.62, 0.08); card.add(cap); }, undefined, () => { }); }
    const halo = new T.Mesh(new T.RingGeometry(1.05, 1.15, 32), new T.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.0, side: T.DoubleSide })); halo.position.z = 0.06; card.add(halo); card.userData.halo = halo;
    g.add(card);
    app.addHotspot(card, { fn: (a) => showProduct(a, store, p) });
  });
  // counter + clerk
  const counter = new T.Mesh(new T.BoxGeometry(5, 1.1, 1.2), M(hex(colors.trim), { roughness: 0.3, metalness: 0.2 })); counter.position.set(0, 0.55, -D + 3.2); g.add(counter);
  const counterTop = new T.Mesh(new T.BoxGeometry(5.2, 0.12, 1.4), M(0xffffff, { roughness: 0.2 })); counterTop.position.set(0, 1.16, -D + 3.2); g.add(counterTop);
  box(0, -D + 3.2, 2.6, 0.7);
  const clerk = makePerson({ shirt: hex(store.clerk?.shirt || colors.trim).getHex(), bag: false }); clerk.position.set(0, 0, -D + 2.2); clerk.rotation.y = 0; g.add(clerk);
  const nameTag = makeSprite(`${store.clerk?.name || 'Clerk'} · ask me anything`, { scale: 4, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); nameTag.position.set(0, 2.5, -D + 2.2); g.add(nameTag);
  let li = 0; const lines = store.clerk?.lines || [`Welcome to ${store.name}!`];
  app.addHotspot(clerk, { fn: (a) => { const line = lines[li % lines.length]; li++; a.popup(`${store.clerk?.name || 'Clerk'} · ${store.name}`, `<p style="font-size:17px">“${esc(line)}”</p><p class="muted">${esc(store.about || '')}</p>`, [{ label: store.cta || 'Visit website', href: store.url, newTab: true, primary: true }, { label: 'Tell me more', fn: () => { const l2 = lines[li % lines.length]; li++; a.popup(`${store.clerk?.name || 'Clerk'} · ${store.name}`, `<p style="font-size:17px">“${esc(l2)}”</p>`, [{ label: store.cta || 'Visit website', href: store.url, newTab: true, primary: true }]); }, keep: true }, ...(store.phone ? [{ label: '📞 ' + store.phone, href: 'tel:' + store.phone.replace(/[^\d+]/g, ''), newTab: true }] : [])]); } });
  app.onUpdate((dt, t) => { clerk.userData.limbs.aR.rotation.z = -0.6 + Math.sin(t * 2.2 + x) * 0.25; clerk.rotation.y = Math.sin(t * 0.5 + z) * 0.25; });
  // "store page" plaque by the door
  if (storePage) { const sp = makeSprite('ℹ️ Store page & all products', { scale: 5, bg: 'rgba(8,20,50,0.85)', accent: colors.trim }); sp.position.set(hw - 2.6, 1.3, 0.6); g.add(sp); app.addHotspot(sp, { go: `/stores/${store.slug}/`, label: `Opening ${store.name}…` }); }
  // decor: two plants at the door
  for (const sx of [-1, 1]) { const pot = new T.Mesh(new T.CylinderGeometry(0.35, 0.28, 0.6, 10), M(0xd9cbb0)); pot.position.set(sx * (hw - 0.6), 0.3, 0.9); g.add(pot); const leaf = new T.Mesh(new T.SphereGeometry(0.55, 8, 6), M(0x3fa34d)); leaf.position.set(sx * (hw - 0.6), 0.95, 0.9); g.add(leaf); }
  return g;
}

export function wingName(w) { return ({ lobby: 'Grand Lobby', americas: 'Americas Wing', europe: 'Europe Wing', asia: 'Asia & Islands Wing', food: 'Global Food Court', kids: "Kids' Discovery Zone", market: 'Old World Market' })[w] || 'Mall'; }

export function showProduct(app, store, p) {
  const img = p.img ? `<img src="${p.img}" alt="${esc(p.title)}" style="width:100%;max-height:220px;object-fit:contain;border-radius:12px;background:#fff;margin-bottom:8px" loading="lazy">` : '';
  app.popup(p.title, `${img}<p style="font-size:20px;color:#7cf8ff;margin:0 0 6px"><b>${esc(p.price || '')}</b></p><p>${esc(p.desc || '')}</p><p class="muted">${esc(store.name)} · ${esc(store.city || '')}. Checkout happens on the brand's own site.</p>`,
    [{ label: '🛒 Buy now', href: p.url, newTab: !p.url.startsWith('/lease'), primary: true }, { label: '＋ Add to my list', fn: () => app.addToList({ title: p.title, price: p.price, url: p.url, store: store.name }), keep: true }]);
}
