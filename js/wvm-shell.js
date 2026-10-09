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
   ============================================================ */
import { mountRail, backChip, setMode, savedMode, aouUrl, ensureCSS, go } from '/js/wvm-rail.js?v=58';
import { HICON } from '/js/wvm-icons.js?v=58';

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
/* the one-tap VR door */
#wvm-door{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;display:flex;flex-direction:column;gap:10px;align-items:center;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border-radius:16px;padding:20px 28px;box-shadow:0 16px 40px rgba(2,8,30,.5);font-family:Poppins,Arial;max-width:92vw}
#wvm-door button{border:0;border-radius:12px;background:#fff;color:#0b1a3a;font:900 22px Poppins,Arial;padding:14px 26px;cursor:pointer;display:flex;align-items:center;gap:10px}
#wvm-door button .hic{width:26px;height:26px}
#wvm-door small{font:700 13px Poppins,Arial;opacity:.9;text-align:center}
#wvm-door label{display:flex;gap:8px;align-items:center;font:700 12px Poppins,Arial}
#wvm-door select{border:0;border-radius:9px;padding:6px 8px;font:700 12px Poppins,Arial;color:#0b1a3a}
`;

const PRELOADS = ['/vendor/three/three.module.min.js', '/vendor/three/jsm/loaders/GLTFLoader.js', '/vendor/three/jsm/utils/BufferGeometryUtils.js', '/vendor/three/jsm/webxr/VRButton.js', '/vendor/three/jsm/postprocessing/EffectComposer.js', '/vendor/three/jsm/postprocessing/RenderPass.js', '/vendor/three/jsm/postprocessing/UnrealBloomPass.js', '/vendor/three/jsm/postprocessing/OutputPass.js', '/vendor/three/jsm/postprocessing/ShaderPass.js', '/vendor/three/jsm/postprocessing/Pass.js', '/vendor/three/jsm/postprocessing/MaskPass.js', '/vendor/three/jsm/shaders/CopyShader.js', '/vendor/three/jsm/shaders/LuminosityHighPassShader.js', '/vendor/three/jsm/shaders/OutputShader.js', '/js/wvm-engine.js?v=58', '/js/wvm-bot.js?v=58', '/js/wvm-store.js?v=58'];

const q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();

export function bootShell(cfg) {
  ensureCSS();
  const st = document.createElement('style'); st.id = 'wvm-shell-css'; st.textContent = SHELL_CSS; document.head.appendChild(st);
  const page = cfg.page; // 'outside' | 'mall' | 'store'
  const vr = q.get('vr') === '1';
  const qm = q.get('mode');
  if (qm === '3d') setMode('3d'); else if (qm === 'flat') setMode('flat');
  const deep = /[?&](to|ride|store)=/.test(location.search) || location.hash === '#mall' || location.hash === '#leasing';
  let want3d;
  if (qm === 'flat') want3d = false;
  else if (vr || qm === '3d' || deep) want3d = true;
  else if (page === 'store') want3d = false;
  else want3d = savedMode() !== 'flat';
  if (!want3d && page !== 'store') setMode('flat');

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
    /* the ?vr=1 door */
    if (vr) vrDoor(app);
    /* flat <main> below the stage keeps its scroll hint */
    const sh = document.getElementById('scrollhint'); const about = document.getElementById('about'); if (sh && about && !sh.onclick) sh.onclick = () => about.scrollIntoView({ behavior: 'smooth' });
  }

  function enterVR() {
    setMode('3d');
    if (!S.booted) { boot().then(() => { const w = setInterval(() => { const v = document.getElementById('wvm-vr'); if (!v) return; clearInterval(w); v.click(); }, 300); setTimeout(() => clearInterval(w), 20000); }); return; }
    const v = document.getElementById('wvm-vr'); if (v) v.click(); else if (S.app && S.app.toast) S.app.toast('Open this page in a headset browser (Quest) to enter VR.', 3500);
  }

  async function vrDoor(app) {
    let hop = false; try { hop = sessionStorage.getItem('wvm_vr_hop') === '1'; sessionStorage.removeItem('wvm_vr_hop'); } catch (e) { }
    let chars = []; try { chars = (await import('/js/wvm-engine.js?v=58')).CHARACTERS || []; } catch (e) { }
    const sv = app._load('wvm_avatar', {}) || {}; let pref = null; try { pref = localStorage.getItem('wvm_vr_body'); } catch (e) { }
    const cur = pref || sv.character || 'hero';
    let tries = 0; const wait = setInterval(() => {
      const v = document.getElementById('wvm-vr'); if (!v) { if (++tries > 60) { clearInterval(wait); if (app.toast) app.toast('VR needs a headset browser (Quest). On this device the 3D mode is the whole show.', 5000); } return; }
      clearInterval(wait);
      const o = document.createElement('div'); o.id = 'wvm-door';
      o.innerHTML = `<button type="button">${I('🕶')}<span>${hop ? 'Tap once · back into VR' : 'Tap to enter VR'}</span></button>${hop ? '<small>the headset needs one tap after a page change</small>' : ''}` +
        (chars.length ? `<label>Body in VR <select>${chars.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>` : '');
      const sel = o.querySelector('select'); if (sel) sel.onchange = () => app.vrBody(sel.value);
      o.querySelector('button').onclick = () => { app.vrBody(sel ? sel.value : null); v.click(); o.remove(); };
      document.body.appendChild(o); setTimeout(() => o.remove(), 90000);
    }, 250);
  }

  if (want3d) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    const start = () => requestAnimationFrame(() => requestAnimationFrame(() => idle(() => boot(), { timeout: vr || deep ? 300 : 1200 })));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
  return S;
}
