/* App-like speed (v9): the engine, the world modules, three.js, the VR layer, the skies and the key panoramas are
   precached on install (one versioned cache per release), so the next visit opens in seconds and the mall works
   offline once seen. Pages, code and data still check the network first and fall back to the cache.
   Bump V together with ?v= on the code URLs. */
const V = 'v88';
const CODE = V + '-code', MEDIA = V + '-media', VENDOR = V + '-vendor';
const PRECACHE_CODE = [
  '/', '/mall/', '/feed/', '/directory/',
  '/js/wvm-shell.js?v=58', '/js/wvm-rail.js?v=58', '/js/wvm-icons.js?v=58', '/js/wvm-feed.js?v=58', '/js/wvm-config.js?v=58',
  '/js/wvm-engine.js?v=58', '/js/wvm-bot.js?v=58', '/js/wvm-store.js?v=58', '/js/wvm-outside.js?v=58', '/js/wvm-inside.js?v=58', '/js/wvm-storeworld.js?v=58',
  '/js/wvm-plus.js?v=58', '/js/wvm-xr.js', '/js/wvm-orbit3d.js', '/js/wvm-fun2.js', '/js/wvm-fun3.js', '/js/wvm-fun.js', '/js/wvm-sky.js', '/js/wvm-sso.js', '/js/wvm-studio.js', '/js/wvm-lifetools.js', '/js/aou-money.js', '/js/wvm-voice.js',
  '/data/stores.json', '/data/new-stores.json', '/data/mall-extras.json', '/data/offers.json',
];
const PRECACHE_VENDOR = [
  '/vendor/three/three.module.min.js', '/vendor/three/jsm/loaders/GLTFLoader.js', '/vendor/three/jsm/loaders/RGBELoader.js', '/vendor/three/jsm/utils/BufferGeometryUtils.js', '/vendor/three/jsm/utils/SkeletonUtils.js', '/vendor/three/jsm/webxr/VRButton.js',
  '/vendor/three/jsm/postprocessing/EffectComposer.js', '/vendor/three/jsm/postprocessing/RenderPass.js', '/vendor/three/jsm/postprocessing/UnrealBloomPass.js', '/vendor/three/jsm/postprocessing/OutputPass.js', '/vendor/three/jsm/postprocessing/ShaderPass.js', '/vendor/three/jsm/postprocessing/Pass.js', '/vendor/three/jsm/postprocessing/MaskPass.js',
  '/vendor/three/jsm/shaders/CopyShader.js', '/vendor/three/jsm/shaders/LuminosityHighPassShader.js', '/vendor/three/jsm/shaders/OutputShader.js',
];
const PRECACHE_MEDIA = [
  '/images/world-vr-mall-logo.png', '/images/world-vr-mall-logo-600.png', '/images/world-vr-mall-favicon-192.png',
  '/images/lake-mountain-landscape-360-main.avif', '/images/futuristic-global-mall-360-4096x2048.avif', '/images/realistic-night-sky-moon-stars-360.avif', '/images/tropical-beach-360-panorama.avif',
  '/textures/sky-day-2k.jpg', '/textures/sky-sunset-2k.jpg',
];
const addAll = async (name, urls) => { const c = await caches.open(name); await Promise.all(urls.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { }))); };
self.addEventListener('install', (e) => { e.waitUntil(Promise.all([addAll(CODE, PRECACHE_CODE), addAll(VENDOR, PRECACHE_VENDOR), addAll(MEDIA, PRECACHE_MEDIA)]).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(V)).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const cacheFirst = async (req, name) => { const c = await caches.open(name); const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; };
const networkFirst = async (req, name) => { const c = await caches.open(name); try { const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res; } catch (e) { const hit = await c.match(req) || (req.mode === 'navigate' ? await c.match(new URL(req.url).pathname) : null); if (hit) return hit; throw e; } };
self.addEventListener('fetch', (e) => { const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  /* three r160 is served from /vendor/ and never changes within a release: cache first (the old jsdelivr rule matched nothing) */
  if (u.pathname.startsWith('/vendor/')) { e.respondWith(cacheFirst(r, VENDOR)); return; }
  if (/\.(glb|gltf|avif|webp|png|jpe?g|svg|woff2?|mp3|hdr)$/i.test(u.pathname)) { e.respondWith(cacheFirst(r, MEDIA)); return; }
  if (/\.(js|json|css)$/i.test(u.pathname) || r.mode === 'navigate') { e.respondWith(networkFirst(r, CODE)); return; }
});
