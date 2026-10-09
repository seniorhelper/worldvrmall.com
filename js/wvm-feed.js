/* ============================================================
   World VR Mall · the Mall feed (flat mode, no engine) v9
   New & featured stores, real offers (data/offers.json), the prize
   hunt (live status from the shared Supabase project when reachable,
   demo status otherwise), directory search, SSO-aware user chip,
   and "walk in" deep links into 3D / VR.
   ============================================================ */
import { mountRail, backChip, setMode, userChipHTML, aouUrl, me } from '/js/wvm-rail.js?v=58';
import { HICON } from '/js/wvm-icons.js?v=58';
import { CONFIG } from '/js/wvm-config.js?v=58';

const I = (k) => HICON[k] || '';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
setMode('flat');
mountRail({ page: 'feed', into: $('#railslot') });
backChip();
$('#userchip').innerHTML = userChipHTML();
{ const a = $('#aou-home'); if (a) a.onclick = (e) => { e.preventDefault(); location.href = aouUrl('/'); }; }

const PRIZES = [
  { id: 'wholefoods20', icon: '🛒', title: '$20 Whole Foods Market gift card', value: 20, where: 'the island' },
  { id: 'painting', icon: '🎨', title: 'Original abstract painting by Zachary Wennstedt', value: 1500, where: 'the island' },
  { id: 'gas50', icon: '⛽', title: '$50 gas card', value: 50, where: 'the island or the mall' },
  { id: 'funnel5000', icon: '🚀', title: 'Optimized sales funnel landing page ($5,000 value)', value: 5000, where: 'inside the mall' },
];
const grads = ['linear-gradient(135deg,#0ea5e9,#6366f1)', 'linear-gradient(135deg,#f97316,#ef4444)', 'linear-gradient(135deg,#10b981,#0ea5e9)', 'linear-gradient(135deg,#8b5cf6,#ec4899)', 'linear-gradient(135deg,#f59e0b,#10b981)', 'linear-gradient(135deg,#14b8a6,#0b1a3a)'];
const WING = { lobby: 'Grand Lobby', americas: 'Americas Wing', europe: 'Europe Wing', asia: 'Asia · Africa · Islands Wing', food: 'Global Food Court', kids: 'Kids Zone', market: 'Old World Market', booths: 'Atrium booths' };
const walk = (s) => `<a class="btn p sm" href="/mall/?store=${encodeURIComponent(s.slug)}&mode=3d">${I('🧊')}Walk in</a><a class="btn dark sm" href="/mall/?store=${encodeURIComponent(s.slug)}&vr=1">${I('🕶')}VR</a>`;
const site = (s) => (s.url && /^https?:/.test(s.url)) ? `<a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cta && s.cta.length < 26 ? s.cta : 'Visit ' + s.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))}</a>` : '';
const page = (s) => s.page ? `<a class="btn sm" href="${esc(s.page)}">Store page</a>` : '';
const card = (s, i, badge) => `<article class="card"><div class="cv" style="background:${s.colors && s.colors.trim ? esc(s.colors.trim) : grads[i % grads.length]}">${esc(s.name)}<span class="flag" aria-hidden="true">${esc(s.flag || '')}</span></div><div class="b">${badge ? `<span class="pill ${badge.cls}">${badge.text}</span>` : ''}<div class="tag">${esc(s.tag || '')}</div><div class="city">${esc(s.city || '')}${s.wing ? ' · ' + esc(WING[s.wing] || s.wing) : ''}</div><p>${esc(String(s.about || '').slice(0, 150))}${String(s.about || '').length > 150 ? '…' : ''}</p><div class="acts">${walk(s)}${site(s)}${page(s)}</div></div></article>`;

let stores = [], offers = [];
async function loadJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }
const STORE_PAGES = ['eye-to-ad-media', 'showers4less', 'buyweburl', 'aging-safely-baths', 'a-nu-do-salon', 'gnomad-promotions', 'bear-creek-auto-glass', 'bighorn-painting', 'my-sales-help', 'search-converts', 'link-restaurants', 'hawaii-snorkeling', 'belize-adventures', 'costa-rica-escapes', 'puerto-plata-getaways'];

(async () => {
  try { const d = await loadJSON('/data/stores.json'); stores = (d.stores || []).map(s => ({ ...s, page: STORE_PAGES.includes(s.slug) ? '/stores/' + s.slug + '/' : null })); } catch (e) { console.warn('stores.json', e); }
  try { const n = await loadJSON('/data/new-stores.json'); (Array.isArray(n) ? n : (n.stores || [])).forEach(s => { if (!stores.some(x => x.slug === s.slug)) stores.push({ ...s, isNew: true }); }); } catch (e) { }
  renderFeatured(); draw();
  try { const o = await loadJSON('/data/offers.json'); offers = o.offers || []; $('#offers-when').textContent = o.updated ? 'as of ' + o.updated : ''; } catch (e) { console.warn('offers.json', e); }
  renderOffers();
  renderPrizes(null); livePrizes();
})();

function renderFeatured() {
  const real = stores.filter(s => !s.demo && (s.products || []).length);
  const list = [...real.filter(s => s.isNew), ...real.filter(s => !s.isNew)].slice(0, 12);
  $('#featured').innerHTML = list.length ? list.map((s, i) => card(s, i, s.isNew ? { cls: 'new', text: 'New' } : (['lobby'].includes(s.wing) ? { cls: 'real', text: 'Flagship' } : { cls: 'real', text: 'Real store' }))).join('') : '<p class="muted">The store list is offline right now. Walk in to the 3D mall instead.</p>';
}
function renderOffers() {
  if (!offers.length) { $('#offers').innerHTML = '<p class="muted">No offers listed right now.</p>'; return; }
  $('#offers').innerHTML = offers.map(o => `<article class="offer ${esc(o.kind || '')}"><b>${esc(o.title)}</b><span class="price">${esc(o.price || '')}</span><p>${esc(o.detail || '')}</p><small>${esc(o.name)} · ${esc(o.where || '')}</small><div class="acts" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><a class="btn sm" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.cta || 'See the offer')}</a><a class="btn p sm" href="/mall/?store=${encodeURIComponent(o.store)}&mode=3d">${I('🧊')}Walk in</a></div></article>`).join('');
}
function renderPrizes(live) {
  const rows = PRIZES.map(p => { const l = live && live.find(r => r.id === p.id); const gone = !!(l && l.claimed_at); return `<div class="pz">${I(p.icon)}<div><b>${esc(p.title)}</b><small>Hidden on ${esc(p.where)} · $${p.value.toLocaleString()} value</small><div class="st ${gone ? 'gone' : ''}">${live ? (gone ? 'Claimed' : 'Still hidden') : 'Status: demo (live status unavailable)'}</div></div></div>`; });
  $('#prizes').innerHTML = rows.join('');
  $('#prize-when').textContent = live ? 'live' : 'demo';
}
async function livePrizes() {
  if (!CONFIG.SUPABASE_URL || /YOUR-/.test(CONFIG.SUPABASE_URL)) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    const { data, error } = await sb.from('prizes').select('id,title,value,claimed_at');
    if (error || !data) return;
    renderPrizes(data);
  } catch (e) { /* demo mode: the CDN or Supabase is unreachable; the static list stays */ }
}

/* directory search */
let wing = 'all', q = '';
function draw() {
  const qq = q.trim().toLowerCase(); const res = $('#results');
  if (!qq && wing === 'all') { res.hidden = true; $('#count').textContent = stores.length ? stores.length + ' stores' : ''; return; }
  const list = stores.filter(s => (wing === 'all' || (s.wing || '') === wing) && (!qq || (s.name + ' ' + (s.tag || '') + ' ' + (s.city || '') + ' ' + (s.about || '') + ' ' + (s.products || []).map(p => p.title).join(' ')).toLowerCase().includes(qq)));
  res.hidden = false; $('#count').textContent = list.length + ' match' + (list.length === 1 ? '' : 'es');
  res.innerHTML = list.length ? list.map((s, i) => card(s, i, s.demo ? { cls: '', text: 'Demo store' } : { cls: 'real', text: 'Real store' })).join('') : '<p class="muted">Nothing matched. Try a product, a city or a wing.</p>';
}
$('#q').oninput = (e) => { q = e.target.value; draw(); };
document.querySelectorAll('#wings button').forEach(b => b.onclick = () => { wing = b.dataset.w; document.querySelectorAll('#wings button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
