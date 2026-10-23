/* ============================================================
   World VR Mall · page shell for the 3D pages (v9)
   The flat content is in the HTML and visible at once. This decides
   whether the 3D engine boots at all, and when:
     ?mode=flat / saved wvm_mode=flat  -> never (on / that already
       redirected to /feed/ from the head script)
     ?vr=1                              -> boot + the one-tap VR door
     ?mode=3d, deep links, default      -> boot after the shell paints
   Store pages boot only on "View in 3D" or ?mode=3d / ?vr=1.
   Also: the mode rail, the "Back to AllOfUs" chip, the VR body
   chosen before a session starts, and the overlay layout fixes.
   Hooks for the VR layer: app.arrivalCfg, app.goMenuExtra, app.vrBody(),
   app._cancelArrival (mall), places with a url (Go menu rows).
   The VR layer itself (wvm-xr.js + wvm-go.js + wvm-lifevr.js) is booted
   here for every 3D page (outside, mall, store) once the renderer exists;
   ?vr=1 / ?xrsim=1 modulepreload it, ?vr=basic skips it.
   ============================================================ */
import { mountRail, backChip, setMode, savedMode, aouUrl, ensureCSS, go, me } from '/js/wvm-rail.js?v=59';
import { HICON } from '/js/wvm-icons.js?v=59';

const I = (k) => HICON[k] || '';
const SHELL_CSS = `
/* stage is hidden until the engine boots: the flat page is the page */
body:not(.wvm-3d) #wvm-stage{display:none}
body:not(.wvm-3d) #scrollhint{display:none}
body:not(.wvm-3d) .wvm-only3d{display:none!important}
body.wvm-3d .wvm-onlyflat{display:none!important}
.wvm-flatbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px;padding:12px 14px;border:1px solid rgba(124,248,255,.35);border-radius:14px;background:linear-gradient(135deg,rgba(13,31,77,.9),rgba(7,18,51,.9))}
.wvm-flatbar b{color:#fff;font-size:15px;flex:1 1 220px}
.wvm-flatbar .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;font-size:14px}
.wvm-flatbar .btn .hic{width:16px;height:16px}
body.wvm-3d .wvm-flatbar{display:none}
.wvm-booting{display:none;position:fixed;inset:0;z-index:8;background:#fff;color:#0b1a3a;align-items:center;justify-content:center;flex-direction:column;gap:10px;font:800 15px Poppins,Arial}
.wvm-booting img{height:90px;max-width:70vw;object-fit:contain}
.wvm-booting.on{display:flex}
/* 3D HUD overlay layout (desktop): voice bar and the back chip live under the logo at left, panels at right, toast in the middle */
body.wvm-3d #mp-voice{left:10px;top:64px;transform:none}
body.wvm-3d #mp-dive{right:auto;left:50%;transform:translateX(-50%);bottom:140px}
body.wvm-3d .wvm-top .wvm-where{min-width:0}
body.pax-open #mp-dock,body.pax-open #wvm-turbo{display:none!important}
@media (min-width:821px) and (max-width:1180px){
  body.wvm-3d #wvm-toast{top:104px}
  body.wvm-3d #mp-voice{top:104px}
  body.wvm-3d .mp-banner{top:170px}
}
/* phones: the rail is the bottom bar, everything else moves up and out of each other's way */
@media (max-width:820px){
  body.wvm-3d #scrollhint{display:none}
  body.wvm-3d #wvm-pad{left:14px;bottom:70px}
  body.wvm-3d #wvm-vr,body.wvm-3d .wvm-vrbadge{left:auto!important;right:14px!important;transform:none!important;bottom:66px!important}
  body.wvm-3d #wvm-act{bottom:250px;max-width:calc(100vw - 150px);padding:12px 16px;font-size:15px}
  body.wvm-3d #wvm-turbo{right:14px;bottom:150px;width:84px;height:84px}
  body.wvm-3d #mp-dock{top:140px;bottom:auto;right:6px}
  body.wvm-3d #mp-dive{right:auto;left:14px;transform:none;bottom:306px}
  body.wvm-3d #fly-btns{bottom:360px}
  body.wvm-3d #pax-tab{top:auto;bottom:330px;right:6px}
  body.wvm-3d #pax-stage{bottom:70px}
  body.wvm-3d .mp-banner{top:150px;left:8px;right:66px;transform:none;max-width:none}
  body.wvm-3d .mp-banner.on{transform:none}
}
@media (max-width:680px){ body.wvm-3d #wvm-toast{top:130px} body.wvm-3d .wvm-panel{top:130px} }
/* the intro's Skip button: above the scroll hint on desktop (inline bottom:58px), above the bottom rail + VR button on phones */
@media (max-width:820px){ body.wvm-3d #wvm-skip{bottom:118px!important} }
/* desktop: the Pax helper sits above the dock's top tile instead of on it */
@media (min-width:821px){ body.wvm-3d #pax-tab{top:auto;bottom:476px} }
/* the one-tap VR door */
#wvm-door{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;display:flex;flex-direction:column;gap:10px;align-items:center;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border-radius:16px;padding:20px 28px;box-shadow:0 16px 40px rgba(2,8,30,.5);font-family:Poppins,Arial;max-width:92vw}
#wvm-door button{border:0;border-radius:12px;background:#fff;color:#0b1a3a;font:900 22px Poppins,Arial;padding:14px 26px;cursor:pointer;display:flex;align-items:center;gap:10px}
#wvm-door button .hic{width:26px;height:26px}
#wvm-door small{font:700 13px Poppins,Arial;opacity:.9;text-align:center}
#wvm-door label{display:flex;gap:8px;align-items:center;font:700 12px Poppins,Arial}
#wvm-door select{border:0;border-radius:9px;padding:6px 8px;font:700 12px Poppins,Arial;color:#0b1a3a}
`;

const XR_PRELOADS = ['/js/wvm-xr.js', '/js/wvm-go.js', '/js/wvm-icons.js?v=59', '/js/wvm-arrival.js'];
const PRELOADS = ['/vendor/three/three.module.min.js', '/vendor/three/jsm/loaders/GLTFLoader.js', '/vendor/three/jsm/utils/BufferGeometryUtils.js', '/vendor/three/jsm/webxr/VRButton.js', '/vendor/three/jsm/postprocessing/EffectComposer.js', '/vendor/three/jsm/postprocessing/RenderPass.js', '/vendor/three/jsm/postprocessing/UnrealBloomPass.js', '/vendor/three/jsm/postprocessing/OutputPass.js', '/vendor/three/jsm/postprocessing/ShaderPass.js', '/vendor/three/jsm/postprocessing/Pass.js', '/vendor/three/jsm/postprocessing/MaskPass.js', '/vendor/three/jsm/shaders/CopyShader.js', '/vendor/three/jsm/shaders/LuminosityHighPassShader.js', '/vendor/three/jsm/shaders/OutputShader.js', '/js/wvm-engine.js?v=59', '/js/wvm-bot.js?v=59', '/js/wvm-store.js?v=59'];

const q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();

export function bootShell(cfg) {
  ensureCSS();
  const st = document.createElement('style'); st.id = 'wvm-shell-css'; st.textContent = SHELL_CSS; document.head.appendChild(st);
  const page = cfg.page; // 'outside' | 'mall' | 'store'
  const xrsim = q.get('xrsim') === '1';
  const vr = q.get('vr') === '1' || xrsim;
  const qm = q.get('mode');
  if (vr) { try { for (const h of XR_PRELOADS) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = h; document.head.appendChild(l); } } catch (e) { } }
  if (qm === '3d') setMode('3d'); else if (qm === 'flat') setMode('flat');
  /* FLAT, 3D OR VR (Oct 21 2026), decided once per page load, in this order:
       1. ?mode=flat                         -> flat (and remembered for this tab only)
       2. no WebGL on this device            -> flat, nothing remembered (a capability, not a choice)
       3. ?vr=1 / ?xrsim=1 / ?mode=3d / a deep link (?to= ?ride= ?store= #mall #leasing) -> 3D
       4. a store page                       -> flat unless 3 applies (from a 3D page, app.go carries ?mode=3d, so you stay in 3D)
       5. a flat choice made earlier in THIS tab (rail Feed tab, ?mode=flat) -> flat, else 3D (the default)
     Immersive VR never starts by itself: ?vr=1 shows the one-tap door, and a page change from inside the headset carries ?vr=1 plus a
     one-shot hop flag (sessionStorage) so the door says "Tap once · back into VR"; the tap is the user gesture the browser requires.
     Nothing else is remembered: no localStorage mode flag (it went stale), the hop flag is dropped on any page without ?vr=1, and
     ?vr=1 is taken out of the address bar once you leave VR yourself, so a reload or Back does not ask for the headset again. */
  const deep = /[?&](to|ride|store)=/.test(location.search) || location.hash === '#mall' || location.hash === '#leasing';
  const hasGL = () => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return false; try { const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { } return true; } catch (e) { return false; } };
  if (!vr) { try { sessionStorage.removeItem('wvm_vr_hop'); } catch (e) { } }
  let want3d;
  if (qm === 'flat') want3d = false;
  else if (!hasGL()) want3d = false;
  else if (vr || qm === '3d' || deep) want3d = true;
  else if (page === 'store') want3d = false;
  else want3d = savedMode() !== 'flat';

  const rail = mountRail({ page: page === 'store' ? 'store' : page, vr: () => enterVR() });
  backChip();
  const S = { booted: false, app: null, rail };
  window.WVM_SHELL = S;

  /* the "Walk in · 3D" bar at the top of the flat content, and any [data-wvm-boot] button */
  const main = document.querySelector('main');
  if (main) {
    const bar = document.createElement('div'); bar.className = 'wvm-flatbar';
    const what = page === 'store' ? 'See this store in 3D: walk in, tap the shelves, meet the clerk.' : page === 'mall' ? 'Walk the mall in 3D: every wing, every store, the food court and the kids\' zone.' : 'Walk the island in 3D: the mall, three coasters, the lake, the zoo and the beach.';
    bar.innerHTML = `<b>${what}</b><button class="btn" data-wvm-boot>${I('🧊')}<span>${page === 'store' ? 'View in 3D' : 'Walk in · 3D'}</span></button><a class="btn alt" href="${page === 'outside' ? '/?vr=1' : location.pathname + '?vr=1'}">${I('🕶')}<span>VR</span></a>${page === 'store' ? '' : '<a class="btn alt" href="/feed/">' + I('📰') + '<span>Mall feed</span></a>'}`;
    main.prepend(bar);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-wvm-boot]'); if (!b) return; e.preventDefault(); setMode('3d'); if (S.booted) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } boot(); });

  const booting = document.createElement('div'); booting.className = 'wvm-booting'; booting.innerHTML = '<img src="/images/world-vr-mall-logo.png" alt="World VR Mall"><span>Teleport station · warming up</span>'; document.body.appendChild(booting);

  async function boot() {
    if (S.booted) return S.app; S.booted = true;
    document.body.classList.add('wvm-3d'); window.scrollTo(0, 0); booting.classList.add('on');
    for (const h of PRELOADS) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = h; document.head.appendChild(l); }
    try {
      const m = await import(cfg.module);
      if (page === 'store' && m.bootStore) m.bootStore(cfg.store || {});
      const app = window.WVM_APP; S.app = app;
      if (app) wireApp(app);
    } catch (e) { console.error('world module failed', e); booting.innerHTML = '<span>The 3D world could not load on this connection. The page below still works.</span>'; setTimeout(() => { booting.classList.remove('on'); document.body.classList.remove('wvm-3d'); S.booted = false; }, 2600); return null; }
    booting.remove();
    return S.app;
  }
  S.boot = boot;

  function wireApp(app) {
    /* rail into the HUD top bar (wide screens become part of the flex row; laptops a second row; phones the bottom bar) */
    try { const top = app.hud && app.hud.querySelector('.wvm-top'); const brand = top && top.querySelector('.wvm-brand'); if (brand) { rail._into = top; rail._mount = (r) => brand.after(r); rail._place(); } } catch (e) { }
    /* XR hooks (consumed by the VR layer; kept on the app so the port can read them) */
    app.arrivalCfg = app.arrivalCfg || { name: 'World VR Mall', tagline: 'Walk in. Every store is real.', accent: '#22d3ee' };
    const aouVR = () => app.go(aouUrl('/world/', { vr: '1' }), 'AllOfUs VR');
    const EXTRA = page === 'mall'
      ? [['🌳 Outside · the island', () => app.go('/', 'Heading outside…')], ['🌍 AllOfUs VR', aouVR]]
      : page === 'outside'
        ? [['🏬 Inside the mall', () => app.go('/mall/', 'Entering World VR Mall…')], ['🌍 AllOfUs VR', aouVR]]
        : [['🏬 Back to the mall', () => app.go('/mall/', 'Back to the mall…')], ['🌍 AllOfUs VR', aouVR]];
    /* a lost GL context in the headset: a 'Tap to continue' card that reloads the page straight back into VR where you stood */
    app.opts.onContextLost = () => ctxCard(app);
    app.opts.onContextRestored = () => { const c = document.getElementById('wvm-ctx'); if (c) c.remove(); app.toast && app.toast('Graphics came back.', 2000); };
    app.goMenuExtra = (app.goMenuExtra || []).concat(EXTRA.filter(r => !(app.goMenuExtra || []).some(x => x[0] === r[0])));
    /* the shared Go menu lists every place that has a url */
    if (app.addPlace) {
      if (page !== 'mall') app.addPlace({ id: 'go-inside', name: 'Inside the mall', icon: '🏬', url: '/mall/', keys: 'inside mall enter stores', cat: 'Worlds', top: true, rank: 4 });
      if (page !== 'outside') app.addPlace({ id: 'go-outside', name: 'Outside · the island', icon: '🌳', url: '/', keys: 'outside island park coasters lake beach zoo', cat: 'Worlds', top: true, rank: 4 });
      app.addPlace({ id: 'go-allofus-vr', name: 'AllOfUs VR', icon: '🌍', url: aouUrl('/world/', { vr: '1' }), keys: 'allofus home social world', cat: 'Worlds', top: true, rank: 4 });
      app.addPlace({ id: 'go-allofus', name: 'AllOfUs · home', icon: '🌍', url: aouUrl('/'), keys: 'allofus home feed social', cat: 'Worlds', rank: 5 });
    }
    /* VR body: pick it BEFORE the session starts so nothing rebuilds mid-arrival; default = your current character */
    app.vrBody = (id) => {
      try {
        const sv = app._load('wvm_avatar', {}) || {}; const cur = sv.character || 'hero';
        let want = id || localStorage.getItem('wvm_vr_body') || cur;
        if (id) localStorage.setItem('wvm_vr_body', id);
        if (want !== cur) { sv.character = want; delete sv._vrDefault; app._save('wvm_avatar', sv); app._buildAvatar(); }
        return want;
      } catch (e) { return null; }
    };
    document.addEventListener('click', (e) => { const v = e.target.closest('#wvm-vr'); if (v && app.renderer && !app.renderer.xr.isPresenting) app.vrBody(); }, true);
    /* the VR layer: arrival, laser, menu, body, ?xrsim=1 simulator */
    if (q.get('vr') !== 'basic') bootXR(app);
    /* stay in the mode you are in: from a desktop / phone 3D page a store page opens in 3D too (VR hops already carry ?vr=1) */
    try { const g0 = app.go.bind(app); app.go = (url, label) => { try { const pres = app.renderer && app.renderer.xr && app.renderer.xr.isPresenting; const u = new URL(url, location.href); if (!pres && u.origin === location.origin && /^\/stores\/[^/]+\/?$/.test(u.pathname) && !u.searchParams.has('mode') && !u.searchParams.has('vr')) { u.searchParams.set('mode', '3d'); url = u.pathname + u.search + u.hash; } } catch (e) { } return g0(url, label); }; } catch (e) { }
    /* leaving VR yourself: take ?vr=1 out of the address bar (a reload or Back then opens the 3D page, not the headset door); a page change from VR navigates away first */
    try { let leaving = false; addEventListener('beforeunload', () => { leaving = true; }); app.renderer.xr.addEventListener('sessionend', () => { setTimeout(() => { try { /* never while a page change is under way (a history edit could cancel it): app.go from VR sets the hop flag, every navigation fires beforeunload */ let hop = null; try { hop = sessionStorage.getItem('wvm_vr_hop'); } catch (e) { } if (leaving || hop) return; const u = new URL(location.href); if (u.searchParams.get('vr') === '1') { u.searchParams.delete('vr'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch (e) { } }, 900); }); } catch (e) { }
    /* the ?vr=1 door */
    if (vr && !xrsim) vrDoor(app);
    /* flat <main> below the stage keeps its scroll hint */
    const sh = document.getElementById('scrollhint'); const about = document.getElementById('about'); if (sh && about && !sh.onclick) sh.onclick = () => about.scrollIntoView({ behavior: 'smooth' });
  }

  /* the VR layer boots once the renderer exists (app.start is async); the options come from the page's hooks */
  async function bootXR(app) {
    for (let k = 0; k < 400 && !(app.renderer && app.renderer.xr); k++) await new Promise(r => setTimeout(r, 250));
    if (!app.renderer) return null;
    /* landing views on the island and inside the mall (wvm-landings.js): every Go / tour / ?to= destination faces something worth seeing */
    if (page === 'outside' || page === 'mall') { try { import('/js/wvm-landings.js').then((m) => m.applyLandings(app, page === 'mall' ? m.LANDINGS_INSIDE : m.LANDINGS)).catch((e) => console.warn('landings', e)); } catch (e) { } }
    try {
      const x = await import('/js/wvm-xr.js');
      window.WVM_XR = x;
      import('/js/wvm-orbit3d.js').then(o => o.spawnOrbit(app, { hidden: () => !!(app.ride && !app.ride.stand) || !!(app._xr && app._xr._arrival && (app._xr._arrival.active || app._xr._arrival.card)) })).catch(e => console.warn('orbit3d', e));
      /* a GL context loss in the headset reloads the page; come back to the same spot */
      try { const rs = JSON.parse(localStorage.getItem('wvm_resume') || 'null'); if (rs && Date.now() - rs.t < 120000) { localStorage.removeItem('wvm_resume'); app.player.position.set(rs.x, app.player.position.y, rs.z); if (rs.yaw !== undefined) app.yaw = rs.yaw; app.toast && app.toast('Back where you were.'); } } catch (e) { }
      const A = app.arrivalCfg || {};
      /* the mall's own cinematic arrival (wvm-arrival.js); the layer's built-in Dawn is the fallback if it fails to load */
      let arr = null; try { arr = await import('/js/wvm-arrival.js'); } catch (e) { console.warn('arrival module', e); }
      /* the seed arrival (wvm-seed.js): the alien plants a seed and the real mall grows from it. Island page only; built and compiled here on the 2D page when a headset is likely */
      let seedMod = null; if (page === 'outside') { try { seedMod = await import('/js/wvm-seed.js'); if (/[?&](vr=1|xrsim=1)/.test(location.search) || /OculusBrowser|Quest|Pico/i.test(navigator.userAgent || '')) setTimeout(() => { try { seedMod.prepareSeed(app); } catch (e) { console.warn('seed prepare', e); } }, 1500); } catch (e) { console.warn('seed module', e); } }
      const quietArrival = (cfg) => { const H = { active: false, card: false, parts: null, k: () => 0, skip: () => { }, dismiss: () => { }, done: () => { if (H._d) return; H._d = true; try { cfg.onDone && cfg.onDone(); } catch (e) { } } }; setTimeout(() => H.done(), 0); return H; };
      const pickArrival = (a, cfg) => { let seen = false, hopped = false; try { seen = sessionStorage.getItem('wvm_arrival_seen') === '1'; hopped = sessionStorage.getItem('wvm_vr_hopped') === '1'; sessionStorage.removeItem('wvm_vr_hopped'); } catch (e) { } /* Oct 22: 'seen' is written only once an arrival has actually played for 6 s. It used to be written the moment one was picked, so a session that dropped in its first seconds made every retry in that tab silent ('no intro at all'). */ const t0 = performance.now(); const od = cfg.onDone; cfg.onDone = () => { try { if (performance.now() - t0 > 6000) sessionStorage.setItem('wvm_arrival_seen', '1'); } catch (e) { } od && od(); }; if ((seen || hopped) && !cfg.replay) { try { setTimeout(() => a.toast && a.toast(hopped ? '🕶️ Welcome back. Help → Replay the arrival plays the intro.' : '🕶️ Help → Replay the arrival plays the intro again.', 4500), 1200); } catch (e) { } return quietArrival(cfg); } let H = null; if (seedMod) { try { H = seedMod.seedArrival(a, cfg); } catch (e) { console.warn('seed arrival', e); } } if (!H && arr && arr.mallArrival) { try { H = arr.mallArrival(a, cfg); } catch (e) { console.warn('mall arrival', e); } } return H || quietArrival(cfg); };
      const AOU_WORLDS = [['🌍 AllOfUs · the 3D world (VR)', aouUrl('/world/', { vr: '1' })], ['📰 AllOfUs · the feed', aouUrl('/')], ['🪐 The VR Galaxy', 'https://thevrgalaxy.com/'], ['🌀 Another Dimension', 'https://anotherdimensionvr.com/'], ['🧭 VR Adventure', 'https://virtualrealityadventure.com/'], ['✈️ Flight Simulator', 'https://vrflyingsimulator.com/'], ['💥 Comics Come Alive', 'https://comicscomealive.com/'], ['🍔 Sparkle Diner', 'https://advertisingforrestaurant.com/']];
      const WORLDS = (page === 'mall' ? [['🏝️ World VR Mall · the island', '/']] : page === 'outside' ? [['🏬 World VR Mall · inside', '/mall/']] : [['🏬 World VR Mall · inside', '/mall/'], ['🏝️ World VR Mall · the island', '/']]).concat(AOU_WORLDS);
      /* links to allofus.one carry the signed-in session (same Supabase project) in the fragment, never to a server */
      const signAou = (u) => { try { const x2 = new URL(u, location.href); if (/(^|\.)allofus\.one$/i.test(x2.hostname) && !x2.hash) { const params = {}; x2.searchParams.forEach((v2, k2) => { params[k2] = v2; }); return aouUrl(x2.pathname, params); } } catch (e) { } return u; };
      const bugPost = (row) => { try { import('/js/wvm-config.js?v=59').then(m => { const C = m.CONFIG || {}; if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return; return fetch(C.SUPABASE_URL + '/rest/v1/bugs', { method: 'POST', headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }); }).catch(() => { }); } catch (e) { } };
      const api = x.initXR(app, {
        name: A.name || 'World VR Mall', tagline: A.tagline || '', accent: A.accent || '#22d3ee', logoTexture: A.logoTexture || null, logoUrl: '/images/world-vr-mall-logo-600.png', chrome: !!A.chrome,
        mallUrl: null, worlds: WORLDS, lifeboard: !!(window.WVM && window.WVM.UI && window.WVM.UI.LB), arrival: pickArrival, side: 'mall', tour: [["mall","The mall entrance. Every store inside is a real business."],["chiller","The Chiller roller coaster. Walk onto the pad and press A to ride."],["wheel","The Sky Wheel. The view from the top takes in the whole island."],["park","The amusement park: rides, games and the coasters."],["beach","Beach Cove. Sit on the pier and watch the waves."],["zoo-gate","The World Zoo. Visiting helps real animals."],["lake","Crystal Lake."],["market","The Old World Market."],["observatory","The Observatory. Look up at the real sky."],["pavilion","The Pavilion: a 360 showroom."],["wilds","Lakeside Wilds: campfire and pines."]],
        ssoHref: (u) => Promise.resolve(signAou(u)), bugPost,
        welcome: '🕶️ Left stick walks · right stick turns · point + trigger = click it or go there · grip pulls you there · Y, your wrist or the MENU pad on the floor = menu (Mall lists every store and place · All of Us = allofus.one · Guide = a guided tour) · X = view · A = nearest · B = bug.', welcomeAt: 26000,
        hint: 'Y, your wrist or the MENU pad on the floor = menu · left stick walks · trigger = go there',
        onDrop: () => { try { app.toast && app.toast('VR closed by itself. One tap puts you back where you were.', 5000); } catch (e) { } vrDoor(app, { hop: true, text: 'Tap once · back into VR', sub: 'VR closed by itself (we logged it). Tapping puts you right back where you were.' }); },
        onStall: () => { try { app.toast && app.toast('The headset stopped drawing frames; logged for the bug report.', 3000); } catch (e) { } },
        me: () => me(),
        extra: (app.goMenuExtra || []).filter(r => !/allofus/i.test(String(r[0]))).concat((window.WVM_PLUS && window.WVM_PLUS.vrExtra) || []),
        onBugs: (list) => {
          const last = list.slice(-5).reverse();
          const html = '<p>Logged in VR. Add a line about what went wrong and send.</p>' + last.map((b, i) => `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:8px;margin:6px 0"><b>#${list.length - i}</b> · ${b.near || 'unknown spot'} · (${b.x}, ${b.y}, ${b.z})${b.act ? ' · near: ' + b.act : ''}${b.ride ? ' · on a ride' : ''}<br><input data-bug="${list.length - 1 - i}" placeholder="What happened?" style="width:100%;margin-top:6px;border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font:600 13px Poppins,Arial"></div>`).join('') + '<button class="mp-btn holo" id="bug-send">📤 Send bug reports</button>';
          const m = (window.WVM_PLUS && window.WVM_PLUS.modal) ? window.WVM_PLUS.modal('🐞 VR bug reports', html) : null; if (!m) return;
          m.querySelector('#bug-send').onclick = async () => { const notes = {}; m.querySelectorAll('[data-bug]').forEach(i => notes[i.dataset.bug] = i.value); const body = list.map((b, i) => `#${i + 1} ${b.t} ${b.page} at (${b.x},${b.y},${b.z}) yaw ${b.yaw} near "${b.near}" act "${b.act}" ride ${b.ride} :: ${notes[i] || ''}`).join('\n'); try { await navigator.clipboard.writeText(body); } catch (e) { } const mail = 'mailto:' + atob('emFjaA==') + String.fromCharCode(64) + atob('ZXlldG9hZC5jb20=') + '?subject=' + encodeURIComponent('VR bug reports · ' + location.host) + '&body=' + encodeURIComponent(body); window.open(mail, '_blank'); localStorage.setItem('vr_bugs', '[]'); window.WVM_PLUS.close && window.WVM_PLUS.close(); app.toast('📤 Copied + opened in your mail app.', 3000); };
        },
      });
      S.xr = api;
      /* frozen matrices: 6 s after the world is up (and every 30 s for lazy zones) every leaf mesh that has not moved stops recomposing its matrix each frame; the engine's sweep unfreezes anything that moves */
      if (app.freezeStatic) { setTimeout(() => { try { app.freezeStatic(); } catch (e) { } }, 6000); setInterval(() => { try { app.freezeStatic(); } catch (e) { } }, 30000); }
      return api;
    } catch (e) { console.error('VR layer failed', e); return null; }
  }

  function enterVR() {
    setMode('3d');
    if (!S.booted) { boot().then(() => { const w = setInterval(() => { const v = document.getElementById('wvm-vr'); if (!v) return; clearInterval(w); v.click(); }, 300); setTimeout(() => clearInterval(w), 20000); }); return; }
    const v = document.getElementById('wvm-vr'); if (v) v.click(); else if (S.app && S.app.toast) S.app.toast('Open this page in a headset browser (Quest) to enter VR.', 3500);
  }

  async function vrDoor(app, o = {}) {
    let hop = !!o.hop; try { if (sessionStorage.getItem('wvm_vr_hop') === '1') hop = true; sessionStorage.removeItem('wvm_vr_hop'); } catch (e) { }
    try { const old = document.getElementById('wvm-door'); if (old) old.remove(); } catch (e) { }
    let chars = []; try { chars = (await import('/js/wvm-engine.js?v=59')).CHARACTERS || []; } catch (e) { }
    const sv = app._load('wvm_avatar', {}) || {}; let pref = null; try { pref = localStorage.getItem('wvm_vr_body'); } catch (e) { }
    const cur = pref || sv.character || 'hero';
    try { if (hop) sessionStorage.setItem('wvm_vr_hopped', '1'); } catch (e) { }
    let tries = 0; const wait = setInterval(() => {
      const v = document.getElementById('wvm-vr'); if (!v) { if (++tries > 60) { clearInterval(wait); if (app.toast) app.toast('VR needs a headset browser (Quest). On this device the 3D mode is the whole show.', 5000); } return; }
      clearInterval(wait);
      const o = document.createElement('div'); o.id = 'wvm-door'; o.setAttribute('style', 'position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:radial-gradient(ellipse at center,rgba(10,30,60,.8),rgba(2,6,16,.94));color:#fff;text-align:center;cursor:pointer;padding:24px;font-family:Poppins,Arial,sans-serif');
      o.innerHTML = `<button type="button">${I('🕶')}<span>${o.text || (hop ? 'Tap once · back into VR' : 'Tap to enter VR')}</span></button>${o.sub ? '<small>' + o.sub + '</small>' : hop ? '<small>the headset needs one tap after a page change</small>' : ''}` +
        (chars.length ? `<label>Body in VR <select>${chars.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>` : '');
      const sel = o.querySelector('select'); if (sel) sel.onchange = () => app.vrBody(sel.value);
      const btn = o.querySelector('button'); btn.style.cssText = 'border:0;border-radius:16px;background:linear-gradient(135deg,#22d3ee,#7c3aed);color:#fff;font:900 26px Poppins,Arial;padding:20px 34px;display:flex;gap:10px;align-items:center;cursor:pointer'; const lab = o.querySelector('label'); if (lab) { lab.style.cssText = 'font:600 14px Poppins,Arial;color:#cfe9ff;display:flex;gap:8px;align-items:center'; lab.addEventListener('click', (e) => e.stopPropagation()); }
      const tip = document.createElement('div'); tip.style.cssText = 'font:700 16px Poppins,Arial;color:#9fefff'; tip.textContent = 'tap anywhere'; o.insertBefore(tip, btn.nextSibling);
      const go = (e) => { if (e && e.target && e.target.closest && e.target.closest('label,select')) return; app.vrBody(sel ? sel.value : null); v.click(); tip.textContent = 'Starting VR… tap again if it does not start'; };
      o.onclick = go; btn.onclick = (e) => { e.stopPropagation(); go(); };
      document.body.appendChild(o); const live = setInterval(() => { if (app.renderer && app.renderer.xr && app.renderer.xr.isPresenting) { clearInterval(live); o.remove(); } }, 300); setTimeout(() => { clearInterval(live); o.remove(); }, 120000);
    }, 250);
  }
  S.vrDoor = (o) => S.app && vrDoor(S.app, o || {});

  /* the graphics context was lost (memory pressure in the headset): a card that reloads this page straight back into VR, where you stood (the engine saved wvm_resume) */
  function ctxCard(app) {
    try { const old = document.getElementById('wvm-ctx'); if (old) old.remove(); } catch (e) { }
    const o = document.createElement('div'); o.id = 'wvm-ctx'; o.setAttribute('style', 'position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:rgba(5,11,28,.92);color:#fff;font-family:Poppins,Arial;text-align:center;padding:24px');
    o.innerHTML = '<div><p style="font:800 22px Poppins,Arial;margin:0 0 8px">The graphics stopped for a moment.</p><p style="font:600 14px Poppins,Arial;margin:0 0 18px;color:#cfe9ff">The headset ran out of memory. One tap reloads the mall right where you were.</p><button type="button" style="border:0;border-radius:12px;background:#38f0ff;color:#04122a;font:900 20px Poppins,Arial;padding:14px 26px;cursor:pointer">Tap to continue</button></div>';
    o.querySelector('button').onclick = () => { try { sessionStorage.setItem('wvm_vr_hop', '1'); } catch (e) { } const u = new URL(location.href); if (app.renderer && app.renderer.xr && (app.renderer.xr.isPresenting || /vr=1/.test(location.search))) u.searchParams.set('vr', '1'); location.replace(u.href); };
    document.body.appendChild(o);
  }

  if (want3d) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    const start = () => requestAnimationFrame(() => requestAnimationFrame(() => idle(() => boot(), { timeout: vr || deep ? 300 : 1200 })));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
  return S;
}
