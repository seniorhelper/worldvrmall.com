/* ============================================================
   World VR Mall · the nav (v10, launch)
   One nav on every page, shaped like allofus.one's: Feed — 3D — VR,
   Directory, items other modules add (WVM_NAV.register), More, and
   the allofus.one jump that keeps your mode and your sign-in
   (#aou_sso= rides along) and carries from=mall.
   Wide screens: a top bar. Phones: one bottom bar, five slots.
   No engine, no emoji: icons come from wvm-icons.js.
   ============================================================ */
import { HICON, ICON_CSS, NICON } from '/js/wvm-icons.js?v=59';

export const AOU = 'https://allofus.one';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- the Supabase session that supabase-js keeps in localStorage (same project on both sites) ---- */
export function session() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) || 'null'); const s = v && (v.access_token ? v : (v.currentSession || v.session));
      if (s && s.access_token && s.refresh_token) return s;
    }
  } catch (e) { }
  return null;
}
export function me() {
  const s = session(); if (!s || !s.user) return null; const u = s.user, md = u.user_metadata || {};
  return { id: u.id, email: u.email || '', name: md.display_name || md.name || md.username || md.full_name || String(u.email || 'Friend').split('@')[0] };
}
/* SSO-aware link to allofus.one: from=mall + the session blob in the fragment (never sent to a server) */
export function aouUrl(path = '/', params = {}) {
  const u = new URL(path, AOU); u.searchParams.set('from', 'mall'); for (const k in params) u.searchParams.set(k, params[k]);
  const s = session(); if (s) { try { u.hash = 'aou_sso=' + encodeURIComponent(btoa(JSON.stringify({ a: s.access_token, r: s.refresh_token, t: Date.now() }))); } catch (e) { } }
  return u.href;
}
/* Navigate: through the engine when it is running (fade, ends a VR session and carries ?vr=1), else plainly */
export function go(url, label) {
  const app = window.WVM_APP;
  if (app && app.go && app.renderer) { app.go(url, label || 'On the way…'); return; }
  location.href = url;
}
/* the flat / 3D choice lives for this tab's visit only (sessionStorage) and only an explicit choice writes it (?mode=, the rail's Feed / 3D / VR,
   "Walk in · 3D"). It used to sit in localStorage forever and the Mall feed wrote "flat" on every visit, so one look at the feed sent every
   later visit to / or /mall/ to the flat feed for no visible reason. The old localStorage value is cleared whenever it is read. */
export function savedMode() { try { localStorage.removeItem('wvm_mode'); } catch (e) { } try { return sessionStorage.getItem('wvm_mode') || ''; } catch (e) { return ''; } }
export function setMode(m) { try { localStorage.removeItem('wvm_mode'); } catch (e) { } try { sessionStorage.setItem('wvm_mode', m); } catch (e) { } }
export const isPhone = () => matchMedia('(max-width:820px)').matches;

const I = (k) => HICON[k] || '';
/* ---- the nav (launch, Oct 25 2026): one bar on every mall page, built like allofus.one's so the two sites read as one place.
   Wide screens: the Feed — 3D — VR switch (coloured tiles joined by a line, like allofus.one's), Directory, items other modules
   registered, More, and the allofus.one jump. Phones: a five-slot bottom bar (Feed · 3D · VR · More · allofus.one).
   The allofus.one jump keeps your mode: from the feed you land on its feed, from 3D in its 3D world, from VR in its VR, signed in.
   WVM_NAV.register(item) adds entries from other modules (see the comment on register below). ---- */
export const isHeadsetUA = () => /OculusBrowser|Quest|Pico|Wolvic|VR\b|XR\b|Vision Pro|Galaxy XR/i.test(navigator.userAgent || '');
/* a phone or tablet that is not a headset: immersive VR there means Google Cardboard (split screen, gaze pointer), which nobody wants */
/* (a desktop-mode iPad and Apple Vision Pro both say 'Macintosh' with touch points; iPads have no WebXR anyway, so that case is left alone and Vision Pro keeps VR) */
export const isHandheld = () => !isHeadsetUA() && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

export const RAIL_CSS = `
${ICON_CSS}
.wvm-rail{--rbg:#0b1a3a;--rbg2:#0e2149;--rline:rgba(56,240,255,.32);--rfg:#b9c7dd;--ron:#fff;--rac:#38f0ff;--cut:7px;font-family:Poppins,"Segoe UI",Arial,sans-serif;display:flex;align-items:center;gap:8px;z-index:36;box-sizing:border-box;view-transition-name:wvm-nav}
.wvm-rail *{box-sizing:border-box}
.wvm-rail a,.wvm-rail button{color:var(--rfg);text-decoration:none;font:700 12px/1 Poppins,Arial,sans-serif;display:flex;align-items:center;gap:7px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;background:none;border:0;padding:0;margin:0}
.wvm-rail .wr-box{display:flex;align-items:center;gap:2px;background:linear-gradient(180deg,var(--rbg2),var(--rbg));border:1px solid var(--rline);padding:4px;clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut));box-shadow:0 6px 20px rgba(2,8,30,.35)}
/* the mode switch: Feed — 3D — VR */
.wvm-rail .wr-modes{gap:0;padding:4px 8px 4px 4px}
.wvm-rail .wr-m{padding:3px 6px 3px 3px;color:var(--rfg)}
.wvm-rail .wr-m i{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex:0 0 26px;color:#06122b;clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);opacity:.78;transition:opacity .15s,transform .15s}
.wvm-rail .wr-m i .hic{width:17px;height:17px;--hic-ac:#06122b}
.wvm-rail .wr-m[data-m="feed"] i{background:#c6ff3d}.wvm-rail .wr-m[data-m="3d"] i{background:#19e3b1}.wvm-rail .wr-m[data-m="vr"] i{background:#5fb2ff}
.wvm-rail .wr-m span{letter-spacing:.02em}
.wvm-rail .wr-m:hover{color:#fff}.wvm-rail .wr-m:hover i{opacity:1;transform:translateY(-1px)}
.wvm-rail .wr-m.on{color:#fff}.wvm-rail .wr-m.on i{opacity:1;box-shadow:0 0 0 2px #fff inset}
.wvm-rail .wr-m.on span{text-shadow:0 0 12px rgba(56,240,255,.7)}
.wvm-rail .wr-link{width:22px;height:2px;margin:0 2px;background:linear-gradient(90deg,rgba(56,240,255,.15),rgba(56,240,255,.55),rgba(56,240,255,.15));position:relative;flex:0 0 22px}
.wvm-rail .wr-link::after{content:"";position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;background:var(--rac);transform:rotate(45deg);box-shadow:0 0 8px var(--rac)}
/* plain items: Directory, registered items, More */
.wvm-rail .wr-i{position:relative;padding:8px 10px;color:var(--rfg)}
.wvm-rail .wr-i .hic{width:17px;height:17px}
.wvm-rail .wr-i:hover,.wvm-rail .wr-i.on,.wvm-rail .wr-i[aria-expanded="true"]{color:#fff;background:rgba(56,240,255,.12)}
.wvm-rail .wr-i.on{box-shadow:inset 0 -2px 0 var(--rac)}
.wvm-rail .wr-badge{position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 4px;background:#ff3d7f;color:#fff;font:800 10px/16px Poppins,Arial;text-align:center;clip-path:polygon(3px 0,100% 0,100% calc(100% - 3px),calc(100% - 3px) 100%,0 100%,0 3px)}
.wvm-rail .wr-badge:empty{display:none}
/* the allofus.one jump */
.wvm-rail .wr-aou{gap:8px;padding:5px 12px 5px 6px;background:linear-gradient(135deg,#1b1046,#0b1a3a 60%);border:1px solid rgba(255,138,0,.55);clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut));color:#fff}
.wvm-rail .wr-aou img{width:26px;height:26px;flex:0 0 26px}
.wvm-rail .wr-aou b{font:800 13px/1 Poppins,Arial;letter-spacing:-.01em;color:#fff}.wvm-rail .wr-aou b em{font-style:normal;color:#ff9a1f}
.wvm-rail .wr-aou .hic{width:14px;height:14px;color:#ff9a1f}
.wvm-rail .wr-aou:hover{border-color:#ff9a1f;box-shadow:0 0 18px rgba(255,138,0,.35)}
.wvm-rail .wr-aou small{display:none}
/* the More sheet */
.wvm-navsheet{position:fixed;z-index:90;min-width:260px;max-width:min(360px,calc(100vw - 16px));max-height:min(70vh,560px);overflow:auto;background:linear-gradient(180deg,#0e2149,#081536);border:1px solid rgba(56,240,255,.4);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:0 22px 50px rgba(2,8,30,.6);padding:8px;font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#eaf4ff;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .16s,transform .16s}
.wvm-navsheet.open{opacity:1;transform:none;pointer-events:auto}
.wvm-navsheet h4{margin:8px 8px 4px;font:800 10.5px Poppins,Arial;letter-spacing:.12em;text-transform:uppercase;color:#7cf8ff;display:flex;align-items:center;gap:6px}
.wvm-navsheet h4 img{width:14px;height:14px}
.wvm-navsheet a,.wvm-navsheet button{display:flex;width:100%;align-items:center;gap:10px;padding:10px 10px;color:#dce8ff;text-decoration:none;font:700 14px Poppins,Arial;background:none;border:0;cursor:pointer;text-align:left}
.wvm-navsheet a:hover,.wvm-navsheet button:hover,.wvm-navsheet a:focus-visible,.wvm-navsheet button:focus-visible{background:rgba(56,240,255,.12);color:#fff;outline:none}
.wvm-navsheet .hic{width:18px;height:18px;flex:0 0 18px}
.wvm-navsheet .wr-badge{margin-left:auto;position:static}
.wvm-navsheet .sub{display:block;font:600 11.5px Poppins,Arial;color:#8fa6c8;margin-top:2px}
.wvm-navsheet hr{border:0;border-top:1px solid rgba(124,248,255,.18);margin:6px 4px}
.wvm-navsheet p{margin:6px 10px 10px;font:600 13.5px/1.5 Poppins,Arial;color:#cfe0ff}
.wvm-navsheet .row{display:flex;gap:8px;padding:0 6px 6px}
.wvm-navsheet .row a{justify-content:center;background:#38f0ff;color:#04122a;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}
.wvm-navsheet .row a.alt{background:transparent;color:#7cf8ff;box-shadow:inset 0 0 0 1px #38f0ff}
.wvm-navscrim{position:fixed;inset:0;z-index:89;background:rgba(2,8,30,.45);opacity:0;pointer-events:none;transition:opacity .16s}
.wvm-navscrim.open{opacity:1;pointer-events:auto}
@media (min-width:821px){.wvm-navscrim{background:transparent}}
.wvm-rail.fixed{position:fixed;top:8px;left:50%;transform:translateX(-50%)}
.wvm-rail.inline{position:static;transform:none}
/* inside the 3D HUD top bar: part of the flex row on wide screens (Directory and More icon-only), a second row on laptops */
.wvm-top .wvm-rail{position:static;transform:none;margin:0 4px 0 6px;flex:0 0 auto}
.wvm-top .wvm-rail .wr-i span:not(.wr-badge){display:none}
@media (min-width:821px) and (max-width:1180px){.wvm-top .wvm-rail{position:fixed;top:54px;left:10px;margin:0}}
@media (min-width:821px) and (max-width:1060px){.wvm-rail .wr-aou b{display:none}}
/* phones: one bottom bar, five slots */
@media (max-width:820px){
  .wvm-rail.inline,.wvm-rail.fixed,.wvm-top .wvm-rail{position:fixed;left:0;right:0;bottom:0;top:auto;transform:none;margin:0;gap:0;padding:0 0 env(safe-area-inset-bottom);background:#0b1a3a;border-top:1px solid var(--rline);box-shadow:0 -8px 24px rgba(2,8,30,.45);display:grid;grid-template-columns:3fr 1fr 1fr}
  .wvm-rail .wr-box{clip-path:none;border:0;box-shadow:none;background:none;padding:0}
  .wvm-rail .wr-modes{display:grid;grid-template-columns:repeat(3,1fr);padding:0}
  .wvm-rail .wr-link,.wvm-rail .wr-dir,.wvm-rail .wr-bar{display:none!important}
  .wvm-rail .wr-tail{display:contents}
  .wvm-rail a,.wvm-rail button{flex-direction:column;gap:4px;padding:7px 2px 7px;font-size:10.5px;justify-content:center;min-height:56px}
  .wvm-rail .wr-m i{width:24px;height:24px;flex-basis:24px}
  .wvm-rail .wr-m.on{box-shadow:inset 0 2px 0 var(--rac)}
  .wvm-rail .wr-i .hic{width:22px;height:22px}
  .wvm-rail .wr-i.on{box-shadow:inset 0 2px 0 var(--rac)}
  .wvm-top .wvm-rail .wr-i span:not(.wr-badge){display:inline}
  .wvm-rail .wr-aou{clip-path:none;border:0;background:none;padding:7px 2px}
  .wvm-rail .wr-aou img{width:24px;height:24px}
  .wvm-rail .wr-aou b,.wvm-rail .wr-aou>.hic{display:none}
  .wvm-rail .wr-aou small{display:block;font:700 10.5px/1 Poppins,Arial;color:#ffb04d}
  .wvm-rail .wr-badge{top:4px;right:calc(50% - 22px)}
  .wvm-navsheet{left:8px!important;right:8px!important;top:auto!important;bottom:calc(64px + env(safe-area-inset-bottom))!important;max-width:none;transform:translateY(12px)}
  body.wvm-railpad{padding-bottom:calc(64px + env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion:reduce){.wvm-navsheet,.wvm-navscrim,.wvm-rail .wr-m i{transition:none}}
/* the house shape on every page (3D HUD included): squared corners, no pills */
.wvm-ico,.wvm-btn,.wvm-panel,.wvm-panel input,#wvm-act,#wvm-skip,#scrollhint,.wvm-scrollhint,.wvm-vrbadge,#wvm-toast,.wvm-flatbar,.wvm-flatbar .btn,.wvm-look.txt,.wvm-where,main .btn,.wvm-content .btn,.cta .btn{border-radius:3px!important}
main .card,.wvm-content .card,main details,.wvm-content details,.hero-img{border-radius:6px!important}
#wvm-pop .wvm-card{border-radius:6px!important}
.wvm-backchip{position:fixed;z-index:37;top:112px;left:10px;display:flex;align-items:center;gap:8px;background:#0b1a3a;color:#fff;border:1px solid rgba(255,138,0,.6);clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);padding:8px 12px;font:700 13px Poppins,Arial;text-decoration:none;box-shadow:0 10px 26px rgba(2,8,30,.3);transition:opacity .4s}
.wvm-backchip img{width:18px;height:18px}.wvm-backchip.bye{opacity:0;pointer-events:none}
@media (max-width:820px){.wvm-backchip{top:auto;bottom:74px;left:10px}}
@media (min-width:821px) and (max-width:1180px){body.wvm-3d .wvm-backchip{top:150px}}
`;

export function ensureCSS() { if (!document.getElementById('wvm-rail-css')) { const s = document.createElement('style'); s.id = 'wvm-rail-css'; s.textContent = RAIL_CSS; document.head.appendChild(s); } }

/* ---- WVM_NAV: other modules add nav entries here (the social bridge: messages, people, presence).
   WVM_NAV.register({
     id: 'messages',                 // unique; registering the same id again replaces it
     label: 'Messages',
     icon: '💬',                     // a HICON emoji key, a NICON name ('globe'), or SVG markup
     href: '/messages/',             // and/or onClick: (event, item) => {}; return false or call preventDefault to stop navigation
     badge: 3,                       // number or short text; 0 / '' hides it
     where: 'more',                  // 'bar' = visible in the wide nav bar (and in More on phones), 'more' = in the More sheet (default)
     order: 50,                      // lower first
     sub: 'From people you follow',  // optional second line in the More sheet
     vr: true,                       // also a row in the VR wrist menu (needs onClick or href)
   }) -> { update(patch), remove() }
   Calls made before this module loads can be queued: (window.WVM_NAV_Q = window.WVM_NAV_Q || []).push(item). ---- */
const NAV_ITEMS = new Map();
const NAV_RAILS = new Set();
/* the live array the VR layer reads every time it builds its menu (wvm-shell passes it as opts.extra) */
export const NAV_VR_ROWS = [];
const navIcon = (ic) => !ic ? NICON.dir : /^\s*</.test(ic) ? ic : (NICON[ic] || HICON[String(ic).replace(/️/g, '')] || HICON[ic] || '');
const navRefresh = () => {
  NAV_VR_ROWS.length = 0;
  for (const it of navList()) if (it.vr && (it.onClick || it.href)) NAV_VR_ROWS.push([(it.vrLabel || it.label), () => navActivate(it, null)]);
  NAV_RAILS.forEach((r) => { try { r._renderBar(); } catch (e) { } });
};
const navList = () => [...NAV_ITEMS.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
function navActivate(it, e) {
  try { if (it.onClick) { const r = it.onClick(e || new Event('click'), it); if (r === false || (e && e.defaultPrevented)) { if (e) e.preventDefault(); return; } } } catch (err) { console.warn('nav item', it.id, err); }
  if (it.href) { if (e) e.preventDefault(); go(it.href, it.label); }
}
export const WVM_NAV = {
  register(item) {
    if (!item || !item.id || !item.label) throw new Error('WVM_NAV.register needs { id, label }');
    NAV_ITEMS.set(item.id, Object.assign({ where: 'more', order: 50 }, item)); navRefresh();
    return { update: (patch) => WVM_NAV.update(item.id, patch), remove: () => WVM_NAV.remove(item.id) };
  },
  update(id, patch) { const it = NAV_ITEMS.get(id); if (it) { Object.assign(it, patch || {}); navRefresh(); } },
  remove(id) { if (NAV_ITEMS.delete(id)) navRefresh(); },
  items: () => navList().map((it) => Object.assign({}, it)),
  open: () => { const r = [...NAV_RAILS][0]; if (r) r._openMore(); },
  close: () => NAV_RAILS.forEach((r) => r._closeMore()),
  vrRows: NAV_VR_ROWS,
};
try { const q = window.WVM_NAV_Q; window.WVM_NAV = WVM_NAV; if (Array.isArray(q)) { q.forEach((it) => { try { WVM_NAV.register(it); } catch (e) { console.warn(e); } }); q.length = 0; } window.WVM_NAV_Q = { push: (it) => WVM_NAV.register(it) }; } catch (e) { }

/* the mode you are in now: 'feed' | '3d' | 'vr' | '' (flat content pages) */
function currentMode(page) {
  try { const app = window.WVM_APP; if (app && app.renderer && app.renderer.xr && app.renderer.xr.isPresenting) return 'vr'; } catch (e) { }
  if (page === 'feed') return 'feed';
  if (page === 'outside' || page === 'mall') return '3d';
  if ((page === 'store' || !page) && document.body.classList.contains('wvm-3d')) return '3d';
  return '';
}
/* allofus.one in the same mode, signed in */
export function aouJump(page) {
  const m = currentMode(page);
  if (m === 'vr') return { url: aouUrl('/world/', { vr: '1' }), label: 'allofus.one VR' };
  if (m === '3d') return { url: aouUrl('/world/'), label: 'allofus.one 3D' };
  return { url: aouUrl('/'), label: 'allofus.one' };
}

/* VR on a phone: explain instead of starting Google Cardboard */
function headsetNote(rail, here3d) {
  rail._sheetHTML(`<p><b style="color:#fff">VR mode runs in a headset browser.</b><br>Open <b style="color:#7cf8ff">worldvrmall.com</b> in the browser on a Meta Quest, Pico or any WebXR headset and tap VR. On this ${/iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'phone'}, 3D is the whole mall.</p><div class="row"><a href="${here3d}" data-go3d>${NICON.cube}<span>Walk in · 3D</span></a><a class="alt" href="#" data-copy>${HICON['🔗'] || ''}<span>Copy link</span></a></div>`);
}

/* Build the rail. opts.page: 'feed' | 'outside' | 'mall' | 'directory' | 'store' | 'flat'.
   opts.into: an element to render inline into (flat page headers); otherwise fixed to the viewport.
   opts.vr: a function that enters VR right here (3D pages); otherwise the VR link opens /mall/?vr=1. */
export function mountRail(opts = {}) {
  ensureCSS();
  const page = opts.page || 'flat';
  const here3d = page === 'outside' ? '/?mode=3d' : page === 'store' ? location.pathname + '?mode=3d' : '/mall/?mode=3d';
  const hereVr = page === 'outside' ? '/?vr=1' : page === 'store' ? location.pathname + '?vr=1' : '/mall/?vr=1';
  const rail = document.createElement('nav'); rail.id = 'wvm-modes'; rail.className = 'wvm-rail ' + (opts.into ? 'inline' : 'fixed'); rail.setAttribute('aria-label', 'World VR Mall');
  const mode = currentMode(page);
  rail.innerHTML = `<div class="wr-box wr-modes" role="group" aria-label="Feed, 3D or VR">
    <a class="wr-m${mode === 'feed' ? ' on' : ''}" data-m="feed" href="/feed/"${mode === 'feed' ? ' aria-current="page"' : ''}><i>${NICON.feed}</i><span>Feed</span></a><span class="wr-link" aria-hidden="true"></span>
    <a class="wr-m${mode === '3d' ? ' on' : ''}" data-m="3d" href="${here3d}"${mode === '3d' ? ' aria-current="page"' : ''}><i>${NICON.cube}</i><span>3D</span></a><span class="wr-link" aria-hidden="true"></span>
    <a class="wr-m${mode === 'vr' ? ' on' : ''}" data-m="vr" href="${hereVr}"><i>${NICON.vr}</i><span>VR</span></a>
  </div>
  <div class="wr-box wr-tail">
    <a class="wr-i wr-dir${page === 'directory' ? ' on' : ''}" data-m="dir" href="/directory/" title="Every store in the mall"${page === 'directory' ? ' aria-current="page"' : ''}>${NICON.dir}<span>Directory</span></a>
    <span class="wr-bar" style="display:contents"></span>
    <button class="wr-i wr-more" type="button" aria-haspopup="dialog" aria-expanded="false" title="More">${NICON.more}<span>More</span><span class="wr-badge"></span></button>
  </div>
  <a class="wr-aou" href="https://allofus.one/?from=mall" data-aou title="allofus.one, the social side: same sign-in, same mode"><img src="/images/allofus-emblem.svg" alt="" width="26" height="26"><b>allofus<em>.one</em></b>${NICON.out}<small>allofus</small></a>`;
  const bar = rail.querySelector('.wr-bar'), moreBtn = rail.querySelector('.wr-more'), moreBadge = moreBtn.querySelector('.wr-badge');
  const sheet = document.createElement('div'); sheet.className = 'wvm-navsheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'More'); sheet.tabIndex = -1;
  const scrim = document.createElement('div'); scrim.className = 'wvm-navscrim';
  const badge = (b) => (b === 0 || b === '' || b == null) ? '' : String(b).slice(0, 4);
  rail._renderBar = () => {
    const items = navList();
    bar.innerHTML = items.filter((it) => it.where === 'bar').map((it) => `<a class="wr-i" data-nav="${esc(it.id)}" href="${esc(it.href || '#')}" title="${esc(it.title || it.label)}">${navIcon(it.icon)}<span>${esc(it.label)}</span><span class="wr-badge">${esc(badge(it.badge))}</span></a>`).join('');
    /* phones show every registered item in More, so its badge sums them all; wide screens only the ones not on the bar */
    const phone = isPhone(); const n = items.filter((it) => phone || it.where !== 'bar').reduce((s, it) => s + (Number(it.badge) || 0), 0);
    moreBadge.textContent = n ? String(Math.min(n, 99)) : '';
    if (sheet.classList.contains('open') && rail._sheetMode === 'more') rail._fillMore();
  };
  const sso = (path, p) => aouUrl(path, p || {});
  rail._fillMore = () => {
    const items = navList(); const phone = isPhone();
    const extra = items.filter((it) => phone || it.where !== 'bar');
    const row = (href, ic, label, sub, attrs = '') => `<a href="${esc(href)}" ${attrs}>${ic}<span>${esc(label)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></a>`;
    sheet.innerHTML = `<h4>World VR Mall</h4>`
      + row('/directory/', NICON.dir, 'Directory', 'Every store, by wing')
      + (page !== 'outside' ? row('/?mode=3d', NICON.island, 'The island', 'Coasters, the lake, the zoo, the beach') : '')
      + (page !== 'mall' ? row('/mall/?mode=3d', NICON.mall, 'Inside the mall', 'Every wing and the food court') : '')
      + row('/tour/', HICON['🗺'], 'Guided tour') + row('/lease/', HICON['🔑'], 'Get your store', 'For businesses') + row('/about/', NICON.help, 'About the mall')
      + row('/report-bug/?from=' + encodeURIComponent(location.pathname + location.search), NICON.bug, 'Report a bug')
      + (extra.length ? '<hr>' + extra.map((it) => `<a href="${esc(it.href || '#')}" data-nav="${esc(it.id)}">${navIcon(it.icon)}<span>${esc(it.label)}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</span><span class="wr-badge">${esc(badge(it.badge))}</span></a>`).join('') : '')
      + `<hr><h4><img src="/images/allofus-emblem.svg" alt="">allofus.one · same sign-in</h4>`
      + row('https://allofus.one/', NICON.feed, 'allofus.one feed', '', 'data-aou-path="/"')
      + row('https://allofus.one/world/', NICON.cube, 'allofus.one 3D world', '', 'data-aou-path="/world/"')
      + row('https://allofus.one/world/?vr=1', NICON.vr, 'allofus.one in VR', '', 'data-aou-path="/world/" data-aou-vr="1"');
    rail._sheetMode = 'more';
  };
  rail._sheetHTML = (html) => { sheet.innerHTML = html; rail._sheetMode = 'note'; openSheet(moreBtn); };
  const openSheet = (anchor) => {
    if (!sheet.parentNode) { document.body.appendChild(scrim); document.body.appendChild(sheet); }
    if (!isPhone()) { const r = (anchor || moreBtn).getBoundingClientRect(); const w = Math.min(360, innerWidth - 16); sheet.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px'; const below = r.bottom + 8; sheet.style.top = (below + 200 < innerHeight ? below : Math.max(8, r.top - 8 - Math.min(560, innerHeight * 0.7))) + 'px'; sheet.style.bottom = 'auto'; }
    else { sheet.style.left = sheet.style.top = sheet.style.bottom = ''; }
    requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
    moreBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => { try { const f = sheet.querySelector('a,button'); if (f && !isPhone()) f.focus({ preventScroll: true }); } catch (e) { } }, 30);
  };
  rail._openMore = () => { rail._fillMore(); openSheet(moreBtn); };
  rail._closeMore = () => { sheet.classList.remove('open'); scrim.classList.remove('open'); moreBtn.setAttribute('aria-expanded', 'false'); };
  scrim.addEventListener('click', rail._closeMore);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('open')) { rail._closeMore(); moreBtn.focus(); } });
  const toAou = (e, path, vr) => { e.preventDefault(); rail._closeMore(); const j = path ? { url: sso(path, vr ? { vr: '1' } : {}), label: 'allofus.one' } : aouJump(page); go(j.url, j.label); };
  const onClick = (e) => {
    const a = e.target.closest('a,button'); if (!a) return;
    if (a === moreBtn) { e.preventDefault(); if (sheet.classList.contains('open')) rail._closeMore(); else rail._openMore(); return; }
    if (a.hasAttribute('data-aou')) return toAou(e);
    if (a.dataset.aouPath) return toAou(e, a.dataset.aouPath, a.dataset.aouVr === '1');
    if (a.dataset.nav) { const it = NAV_ITEMS.get(a.dataset.nav); rail._closeMore(); if (it) navActivate(it, e); return; }
    if (a.hasAttribute('data-copy')) { e.preventDefault(); const u = location.origin + (page === 'outside' ? '/' : location.pathname); try { navigator.clipboard.writeText(u).then(() => { a.querySelector('span').textContent = 'Copied'; }); } catch (x) { } return; }
    if (a.hasAttribute('data-go3d')) { setMode('3d'); rail._closeMore(); const S = window.WVM_SHELL; if (S && S.boot) { e.preventDefault(); S.boot(); } return; }
    const m = a.dataset.m;
    if (m === '3d') { setMode('3d'); const S = window.WVM_SHELL; if (S && S.boot && !S.booted && (page === 'outside' || page === 'mall' || page === 'store')) { e.preventDefault(); S.boot(); } return; }
    if (m === 'feed') { setMode('flat'); return; }
    if (m === 'vr') {
      setMode('3d');
      if (isHandheld()) { e.preventDefault(); headsetNote(rail, here3d); return; }
      if (opts.vr) { e.preventDefault(); opts.vr(); return; }
      const app = window.WVM_APP; const v = document.getElementById('wvm-vr');
      if (app && app.renderer) { e.preventDefault(); if (v) v.click(); else if (app.toast) app.toast('VR runs in a headset browser (Meta Quest, Pico). Open worldvrmall.com there.', 3500); }
      return;
    }
    if (sheet.contains(a)) rail._closeMore();
  };
  rail.addEventListener('click', onClick); sheet.addEventListener('click', onClick);
  /* phones: the bar is fixed to the viewport, so it lives on <body> (a sticky header with backdrop-filter would trap it);
     wide screens: inline in the header slot when one is given */
  const mq = matchMedia('(max-width:820px)');
  const place = () => {
    const into = opts.into || rail._into;
    if (into && !mq.matches) { if (rail.parentNode !== into) (rail._mount || ((r) => into.appendChild(r)))(rail); rail.classList.add('inline'); rail.classList.remove('fixed'); }
    else if (rail.parentNode !== document.body) { document.body.appendChild(rail); rail.classList.toggle('fixed', !into); rail.classList.toggle('inline', !!into); }
    rail._closeMore(); rail._renderBar();
  };
  place(); try { mq.addEventListener('change', place); } catch (e) { }
  rail._place = place;
  /* the active tile follows VR on and off */
  rail._sync = () => { const md = currentMode(page); rail.querySelectorAll('.wr-m').forEach((x) => { x.classList.toggle('on', x.dataset.m === md); if (x.dataset.m === md) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); }); };
  NAV_RAILS.add(rail);
  document.body.classList.add('wvm-railpad');
  return rail;
}

/* Arrived from allofus.one (?from=allofus): a way back, for 20 seconds */
export function backChip() {
  let from = ''; try { from = new URLSearchParams(location.search).get('from') || ''; } catch (e) { }
  if (from !== 'allofus') return null;
  ensureCSS();
  const a = document.createElement('a'); a.className = 'wvm-backchip'; a.href = AOU + '/?from=mall'; a.innerHTML = '<img src="/images/allofus-emblem.svg" alt="" width="18" height="18"><span>Back to allofus.one</span>';
  a.onclick = (e) => { if (e.defaultPrevented) return; e.preventDefault(); const j = aouJump(''); go(j.url, j.label); };
  document.body.appendChild(a);
  setTimeout(() => { a.classList.add('bye'); setTimeout(() => a.remove(), 500); }, 20000);
  return a;
}

/* A small "who am I" chip for flat pages */
export function userChipHTML() {
  const m = me();
  if (m) return `<span class="wvm-userchip on" title="${esc(m.email)}">${I('👤')}<span>${esc(m.name)}</span></span>`;
  return `<a class="wvm-userchip" href="/mall/?mode=3d#signin" title="One login for World VR Mall and allofus.one">${I('🔑')}<span>Sign in</span></a>`;
}
