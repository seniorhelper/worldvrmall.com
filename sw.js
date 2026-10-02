/* App-like speed: 3D models, images and the 3D engine are cached on your device after the first visit,
   so the next visit opens in seconds. Pages and code always check for the newest version first. */
const V = 'v44';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(V)).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const cacheFirst = async (req, name) => { const c = await caches.open(name); const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; };
const networkFirst = async (req, name) => { const c = await caches.open(name); try { const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res; } catch (e) { const hit = await c.match(req); if (hit) return hit; throw e; } };
self.addEventListener('fetch', (e) => { const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin === location.origin && /\.(glb|gltf|avif|webp|png|jpe?g|svg|woff2?|mp3)$/i.test(u.pathname)) { e.respondWith(cacheFirst(r, V + '-media')); return; }
  if (u.hostname === 'cdn.jsdelivr.net' && /\/three@0\.160\.0\//.test(u.pathname)) { e.respondWith(cacheFirst(r, V + '-three')); return; }
  if (u.origin === location.origin && (/\.(js|json|css)$/i.test(u.pathname) || r.mode === 'navigate')) { e.respondWith(networkFirst(r, V + '-code')); return; }
});
