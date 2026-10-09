/* ============================================================
   World VR Mall · the mode rail (v9)
   One rail on every page: Mall feed · Mall 3D · Mall VR · Directory,
   plus the AllOfUs group (Feed · 3D · VR) that arrives signed in
   (#aou_sso= rides along when a session is in this browser) and
   carries from=mall. Desktop: top bar. Phones: one bottom bar.
   No engine, no emoji: icons come from wvm-icons.js.
   ============================================================ */
import { HICON, ICON_CSS } from '/js/wvm-icons.js?v=58';

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
export function savedMode() { try { return localStorage.getItem('wvm_mode') || ''; } catch (e) { return ''; } }
export function setMode(m) { try { localStorage.setItem('wvm_mode', m); } catch (e) { } }
export const isPhone = () => matchMedia('(max-width:820px)').matches;

const I = (k) => HICON[k] || '';
export const RAIL_CSS = `
${ICON_CSS}
.wvm-rail{--rbg:#0b1a3a;--rline:rgba(56,240,255,.35);--rfg:#cbd5e1;--ron:#fff;--rdot:#38f0ff;font-family:Poppins,"Segoe UI",Arial,sans-serif;display:flex;align-items:center;gap:8px;z-index:36;box-sizing:border-box}
.wvm-rail a{color:var(--rfg);text-decoration:none;font:800 11.5px/1 Poppins,Arial,sans-serif;display:flex;align-items:center;gap:5px;padding:7px 9px;border-radius:9px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wvm-rail a .hic{width:15px;height:15px;vertical-align:0}
.wvm-rail a:hover{color:#fff;background:rgba(56,240,255,.12)}
.wvm-rail a.on{color:var(--ron);background:rgba(56,240,255,.18);box-shadow:inset 0 0 0 1px rgba(56,240,255,.55)}
.wvm-rail .wr-main,.wvm-rail .wr-aou{display:flex;align-items:center;gap:2px;background:var(--rbg);border:1px solid var(--rline);border-radius:12px;padding:3px;box-shadow:0 6px 20px rgba(2,8,30,.35)}
.wvm-rail .wr-aou{padding-left:8px}
.wvm-rail .wr-aou b{font:800 10px Poppins,Arial;letter-spacing:.08em;color:#7cf8ff;text-transform:uppercase;margin-right:4px;display:flex;align-items:center;gap:4px}
.wvm-rail .wr-aou b .hic{width:13px;height:13px}
.wvm-rail .wr-aou a{padding:7px 8px}
.wvm-rail .wr-tab{display:none}
.wvm-rail.fixed{position:fixed;top:8px;left:50%;transform:translateX(-50%)}
.wvm-rail.inline{position:static;transform:none}
/* inside the 3D HUD top bar: part of the flex row on wide screens, a second row on laptops */
.wvm-top .wvm-rail{position:static;transform:none;margin:0 4px 0 6px;flex:0 0 auto}
@media (min-width:821px) and (max-width:1180px){.wvm-top .wvm-rail{position:fixed;top:54px;left:10px;margin:0}}
/* phones: one bottom bar */
@media (max-width:820px){
  .wvm-rail.inline,.wvm-rail.fixed,.wvm-top .wvm-rail{position:fixed;left:0;right:0;bottom:0;top:auto;transform:none;margin:0;gap:0;padding:0 0 env(safe-area-inset-bottom);background:#0b1a3a;border-top:1px solid var(--rline);box-shadow:0 -8px 24px rgba(2,8,30,.45)}
  .wvm-rail .wr-main{flex:1;border:0;border-radius:0;box-shadow:none;padding:0;background:transparent;display:grid;grid-template-columns:repeat(5,1fr)}
  .wvm-rail a{flex-direction:column;gap:3px;padding:7px 2px 6px;border-radius:0;font-size:10px;justify-content:center}
  .wvm-rail a .hic{width:20px;height:20px}
  .wvm-rail a.on{background:transparent;box-shadow:inset 0 2px 0 var(--rdot)}
  .wvm-rail .wr-tab{display:flex}
  .wvm-rail .wr-aou{display:none;position:absolute;right:8px;bottom:calc(100% + 8px);flex-direction:column;align-items:stretch;padding:8px;gap:4px}
  .wvm-rail .wr-aou.open{display:flex}
  .wvm-rail .wr-aou a{flex-direction:row;justify-content:flex-start;gap:8px;padding:9px 10px;border-radius:9px;font-size:12px}
  .wvm-rail .wr-aou a .hic{width:16px;height:16px}
  .wvm-rail .wr-aou b{margin:0 0 4px 2px}
  body.wvm-railpad{padding-bottom:70px}
}
.wvm-backchip{position:fixed;z-index:37;top:112px;left:10px;display:flex;align-items:center;gap:8px;background:#fff;color:#0b1a3a;border:1px solid #cbd5e1;border-radius:12px;padding:8px 12px;font:700 13px Poppins,Arial;text-decoration:none;box-shadow:0 10px 26px rgba(2,8,30,.3);transition:opacity .4s}
.wvm-backchip .hic{width:16px;height:16px;color:#2563eb}.wvm-backchip.bye{opacity:0;pointer-events:none}
@media (max-width:820px){.wvm-backchip{top:auto;bottom:74px;left:10px}}
@media (min-width:821px) and (max-width:1180px){body.wvm-3d .wvm-backchip{top:150px}}
`;

export function ensureCSS() { if (!document.getElementById('wvm-rail-css')) { const s = document.createElement('style'); s.id = 'wvm-rail-css'; s.textContent = RAIL_CSS; document.head.appendChild(s); } }

/* Build the rail. opts.page: 'feed' | 'outside' | 'mall' | 'directory' | 'store' | 'flat'.
   opts.into: an element to render inline into (flat page headers); otherwise fixed to the viewport.
   opts.vr: a function that enters VR right here (3D pages); otherwise the VR link opens /mall/?vr=1. */
export function mountRail(opts = {}) {
  ensureCSS();
  const page = opts.page || 'flat';
  const here3d = page === 'outside' ? '/?mode=3d' : '/mall/?mode=3d';
  const hereVr = page === 'outside' ? '/?vr=1' : '/mall/?vr=1';
  const rail = document.createElement('nav'); rail.id = 'wvm-modes'; rail.className = 'wvm-rail ' + (opts.into ? 'inline' : 'fixed'); rail.setAttribute('aria-label', 'Mall modes');
  rail.innerHTML = `<div class="wr-main">
    <a data-m="feed" href="/feed/" class="${page === 'feed' ? 'on' : ''}">${I('📰')}<span>Mall feed</span></a>
    <a data-m="3d" href="${here3d}" class="${page === 'outside' || page === 'mall' ? 'on' : ''}">${I('🧊')}<span>Mall 3D</span></a>
    <a data-m="vr" href="${hereVr}">${I('🕶')}<span>Mall VR</span></a>
    <a data-m="dir" href="/directory/" class="${page === 'directory' ? 'on' : ''}">${I('📒')}<span>Directory</span></a>
    <a data-m="aou" class="wr-tab" href="${AOU}/?from=mall" aria-haspopup="true">${I('🌍')}<span>AllOfUs</span></a>
  </div>
  <div class="wr-aou" role="group" aria-label="AllOfUs">
    <b>${I('🌍')}AllOfUs</b>
    <a data-a="feed" href="${AOU}/?from=mall">${I('📰')}<span>Feed</span></a>
    <a data-a="3d" href="${AOU}/world/?from=mall">${I('🧊')}<span>3D</span></a>
    <a data-a="vr" href="${AOU}/world/?vr=1&from=mall">${I('🕶')}<span>VR</span></a>
  </div>`;
  const aou = rail.querySelector('.wr-aou');
  rail.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    if (a.dataset.m === 'aou') { e.preventDefault(); aou.classList.toggle('open'); return; }
    if (a.dataset.a) { if (e.defaultPrevented) return; e.preventDefault(); const path = a.dataset.a === 'feed' ? '/' : '/world/'; go(aouUrl(path, a.dataset.a === 'vr' ? { vr: '1' } : {}), 'AllOfUs'); return; }
    if (a.dataset.m === '3d') setMode('3d');
    if (a.dataset.m === 'feed') setMode('flat');
    if (a.dataset.m === 'vr') {
      setMode('3d');
      if (opts.vr) { e.preventDefault(); opts.vr(); return; }
      const app = window.WVM_APP; const v = document.getElementById('wvm-vr');
      if (app && app.renderer) { e.preventDefault(); if (v) v.click(); else if (app.toast) app.toast('Open this page in a headset browser (Quest) to enter VR.', 3500); }
    }
  });
  document.addEventListener('click', (e) => { if (!rail.contains(e.target)) aou.classList.remove('open'); }, true);
  /* phones: the bar is fixed to the viewport, so it lives on <body> (a sticky header with backdrop-filter would trap it);
     wide screens: inline in the header slot when one is given */
  const mq = matchMedia('(max-width:820px)');
  const place = () => { if (opts.into && !mq.matches) { if (rail.parentNode !== opts.into) opts.into.appendChild(rail); } else if (rail.parentNode !== document.body && !(rail.parentNode && rail.parentNode.classList && rail.parentNode.classList.contains('wvm-top') && !mq.matches)) document.body.appendChild(rail); };
  place(); try { mq.addEventListener('change', place); } catch (e) { }
  rail._place = place;
  document.body.classList.add('wvm-railpad');
  return rail;
}

/* Arrived from allofus.one (?from=allofus): a way back, for 20 seconds */
export function backChip() {
  let from = ''; try { from = new URLSearchParams(location.search).get('from') || ''; } catch (e) { }
  if (from !== 'allofus') return null;
  ensureCSS();
  const a = document.createElement('a'); a.className = 'wvm-backchip'; a.href = AOU + '/?from=mall'; a.innerHTML = I('🌍') + '<span>Back to AllOfUs</span>';
  a.onclick = (e) => { if (e.defaultPrevented) return; e.preventDefault(); go(aouUrl('/'), 'AllOfUs'); };
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
