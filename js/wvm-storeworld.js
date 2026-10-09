/* ============================================================
   World VR Mall · a single store page's 3D world (v9)
   Booted by the shell only on "View in 3D" (or ?mode=3d / ?vr=1):
   the product page is the page; this is the walk-in version.
   ============================================================ */
import { WVM, THREE, rand, pick, makeSign, makeSprite, makePerson, makeTextTexture } from '/js/wvm-engine.js?v=58';
import { buildStore } from '/js/wvm-store.js?v=58';

export function bootStore({ slug, worldName }) {
  const T = THREE, SLUG = slug;
  const app = new WVM({ worldName: worldName || 'World VR Mall', page: 'store', spawn: new T.Vector3(0, 0, 13), spawnYaw: 0, groundY: () => 0, bounds: 40, fog: 0xdfeeff, fogNear: 60, fogFar: 200, showSelfieOnFirstVisit: false, sky: '/images/sky.jpg' });
  window.WVM_APP = app;
  app.arrivalCfg = { name: 'World VR Mall', tagline: 'Walk in. Every store is real.', accent: '#22d3ee' };
  app.goMenuExtra = app.goMenuExtra || [];
  const S = app.scene; const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const glow = (c, i = 1.2) => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
  const sh = document.getElementById('scrollhint'); if (sh) sh.onclick = () => document.getElementById('about').scrollIntoView({ behavior: 'smooth' });

  app.start(async (a) => {
    const r = await fetch('/data/stores.json', { cache: 'no-cache' }); const data = await r.json();
    const store = data.stores.find(s => s.slug === SLUG) || data.stores[0];
    // a little mall corridor around the store
    const floor = new T.Mesh(new T.CircleGeometry(40, 48), M(0xeef2fa, { roughness: 0.3, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; S.add(floor);
    const ceil = new T.Mesh(new T.RingGeometry(6, 40, 48), M(0xf7faff, { side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.25 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 16; S.add(ceil);
    const domeRing = new T.Mesh(new T.TorusGeometry(6.3, 0.4, 8, 48), glow(0x38f0ff, 1.4)); domeRing.rotation.x = Math.PI / 2; domeRing.position.y = 16; S.add(domeRing);
    for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2; if (Math.abs(an - Math.PI * 1.5) < 0.6) continue; const p = new T.Mesh(new T.CylinderGeometry(0.8, 1, 16, 12), M(0xffffff, { metalness: 0.3, roughness: 0.3 })); p.position.set(Math.cos(an) * 30, 8, Math.sin(an) * 30); S.add(p); a.addObstacle(Math.cos(an) * 30, Math.sin(an) * 30, 1.2); }
    // the store itself
    const g = buildStore(a, store, { x: 0, z: 0, rot: 0, storePage: false }); S.add(g);
    // portal back to the mall, behind you
    const arch = new T.Mesh(new T.TorusGeometry(5, 0.6, 12, 48, Math.PI), glow(0x38f0ff, 1.4)); arch.position.set(0, 0.2, 26); S.add(arch);
    const portal = new T.Mesh(new T.CircleGeometry(4.6, 40), new T.MeshBasicMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.45, side: T.DoubleSide })); portal.position.set(0, 0.2, 26.2); S.add(portal);
    const back = makeSign(['BACK TO THE MALL', 'tap the portal'], { width: 8, height: 2.8, postHeight: 5.6, bg: '#07123a', accent: '#7cff6b', border: '#7cff6b', posts: false }); back.position.set(0, 0, 25.5); back.rotation.y = Math.PI; S.add(back);
    for (const o of [arch, portal, back]) a.addHotspot(o, { go: '/mall/?store=' + encodeURIComponent(SLUG), label: 'Back to the mall…' });
    a.onUpdate((dt, t) => { portal.material.opacity = 0.35 + Math.sin(t * 3) * 0.15; });
    a.addPlace({ id: 'go-mall', name: 'Back to the mall', icon: '🏬', url: '/mall/?store=' + encodeURIComponent(SLUG), keys: 'mall back inside lobby', cat: 'Worlds', top: true });
    // a few shoppers wandering the corridor
    for (let i = 0; i < 5; i++) { const path = []; for (let k = 0; k < 4; k++) path.push(new T.Vector3(rand(-24, 24), 0, rand(4, 24))); a.addNPC(makePerson(), path, { pause: 3 }); }
    const hello = makeSprite(`Welcome to ${store.name} ${store.flag || ''}`, { scale: 12, bg: 'rgba(8,20,50,0.85)', accent: store.colors?.trim || '#38f0ff' }); hello.position.set(0, 10, 4); S.add(hello);
    a.onUpdate((dt, t) => { hello.position.y = 10 + Math.sin(t) * 0.3; });
    setTimeout(() => a.toast('Walk in, tap a product, or tap the clerk', 3500), 1200);
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
  return app;
}
