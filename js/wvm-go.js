/* "Go anywhere" — one grouped list of every place, store, world and mode on World VR Mall, shared by the screen HUD
   (map button → modal) and the VR menu (Go tab). Items resolve against app.places at call time, so places that register
   lazily (fun modules, wings, store booths) show up; cross-site items go to allofus.one through wvm-rail's aouUrl()
   (from=mall + the signed-in session) and hop through app.go() (ends VR, carries ?vr=1). Oct 2026 (port of aou-go.js).
   Grouping is data-driven: a place lands in the first group that names its id, else the first group that names its cat,
   else the catch-all "Places" group. Stores (cat "Store…" / "Space available") get their own paged, letter-indexed group. */
import { aouUrl, AOU } from '/js/wvm-rail.js?v=58';

const OUTSIDE = location.pathname === '/' || /^\/index\.html$/.test(location.pathname);
const STORE_PAGE = /^\/stores\//.test(location.pathname);
/* order matters: the first match wins. ids are the engine place ids (js/wvm-outside.js, js/wvm-inside.js, wvm-plus/fun modules). */
export const GO_GROUPS = [
  { key: 'rides', label: 'Rides & thrills', icon: '🎢', ids: ['chiller', 'aurora', 'blaster', 'wheel', 'wheelin', 'gondola', 'balloon', 'ski', 'skytour', 'bubble', 'train', 'raincloud', 'lanterns', 'elevator', 'sunroof'] },
  { key: 'park', label: 'The park & the lake', icon: '🌳', ids: ['park', 'kids', 'ponds', 'lake', 'pier', 'lagoon', 'harmony', 'garden', 'beach', 'zoo', 'zoo-gate', 'wilds', 'spider-world', 'sculpture', 'fireworks', 'rink', 'volleyball', 'cruise'] },
  { key: 'town', label: 'Market, station & more', icon: '🏘️', ids: ['mall', 'market', 'airport', 'teleport', 'observatory', 'showroom', 'eta-showroom', 'pavilion', 'fame', 'light-tunnel', 'portal-hall', 'gallery-wing', 'code-room', 'deals'] },
  { key: 'wings', label: 'Lobby & wings', icon: '🏬', ids: ['lobby', 'atrium', 'concourse', 'americas', 'europe', 'asia', 'mainst', 'village', 'chinatown', 'row', 'alien', 'future', 'down', 'leasing', 'botty'] },
  { key: 'fun', label: 'Food, kids & fun', icon: '🎡', ids: ['food', 'kidsin', 'gardens', 'scoops', 'arcade', 'lab', 'cinema', 'nasa', 'gameroom', 'cathedral', 'tesla', 'gallery', 'ideabox'], cats: ['Restaurant Row', 'Upper Level', 'Fun'] },
  { key: 'good', label: 'Do some good', icon: '💚', cats: ['Do some good'] },
  { key: 'stores', label: 'Stores', icon: '🛍', stores: true },
  { key: 'inside', label: OUTSIDE ? 'Inside the mall' : 'Elsewhere inside', icon: '🏬', cats: ['Inside the mall'] },
  { key: 'outside', label: 'Outside · the island', icon: '🌳', cats: ['Outside · the island'] },
  { key: 'places', label: 'Places', icon: '📍', cats: ['Places'], rest: true },
  { key: 'worlds', label: 'Other worlds', icon: '🌐', urls: () => [
    ['AllOfUs · feed', aouUrl('/'), '📰'], ['AllOfUs · 3D world', aouUrl('/world/'), '🧊'], ['AllOfUs · VR', aouUrl('/world/', { vr: '1' }), '🕶'],
    ['The VR Galaxy', 'https://thevrgalaxy.com/', '🪐'], ['Another Dimension', 'https://anotherdimensionvr.com/', '🌀'], ['VR Adventure', 'https://virtualrealityadventure.com/', '🧭'], ['Flying Sim', 'https://vrflyingsimulator.com/', '✈️'], ['Comics Come Alive', 'https://comicscomealive.com/', '💥'], ['Sparkle Diner', 'https://advertisingforrestaurant.com/', '🍔']] },
  { key: 'modes', label: 'Modes', icon: '🕶', urls: () => [
    ['Mall feed', '/feed/', '📰'], ['Mall 3D', OUTSIDE ? '/?mode=3d' : '/mall/?mode=3d', '🧊'], ['Mall VR', OUTSIDE ? '/?vr=1' : '/mall/?vr=1', '🕶'], ['Directory', '/directory/', '📒'],
    ['AllOfUs · Feed', aouUrl('/'), '📰'], ['AllOfUs · 3D', aouUrl('/world/'), '🧊'], ['AllOfUs · VR', aouUrl('/world/', { vr: '1' }), '🕶']] },
];
const STORE_CAT = /^(Store\b|Space available)/i;
const SKIP_ID = /^(path-|earth-|photo-|pano-|pond-|st-\d)/;
const strip = (s) => String(s || '').replace(/[\p{Extended_Pictographic}️‍]+/gu, '').replace(/·.*$/, '').trim();
const iconOf = (p) => p.icon || (String(p.name || '').match(/^\p{Extended_Pictographic}/u) || ['📍'])[0];
const item = (p) => ({ label: strip(p.name) || p.id, icon: iconOf(p), place: p, cat: p.cat || '' });
const letterOf = (s) => { const c = strip(s).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

/* every place once; stores get a letter index; places that belong to no group land in "Places" */
export function goGroups(app) {
  const places = (app.places || []).filter(p => p && (p.x !== undefined || p.fn || p.url) && p.pin !== false && !SKIP_ID.test(p.id));
  const byId = new Map(places.map(p => [p.id, p])); const used = new Set();
  const out = GO_GROUPS.map(g => ({ key: g.key, label: g.label, icon: g.icon, items: [], rest: !!g.rest, stores: !!g.stores, _g: g }));
  const self = (u) => { try { const a = new URL(u, location.href); return a.origin === location.origin && a.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '') && !a.search; } catch (e) { return false; } };
  /* 1. by id */
  for (const g of out) for (const id of (g._g.ids || [])) { const p = byId.get(id); if (p && !used.has(id)) { used.add(id); g.items.push(item(p)); } }
  /* 2. stores, then by cat, then the rest */
  const storesG = out.find(g => g.stores);
  for (const p of places) {
    if (used.has(p.id)) continue;
    if (STORE_CAT.test(p.cat || '')) { used.add(p.id); const it = item(p); it.letter = letterOf(p.name); it.open = !/space available/i.test(p.cat); storesG.items.push(it); continue; }
    const g = out.find(x => (x._g.cats || []).includes(p.cat || '')); if (g) { used.add(p.id); g.items.push(item(p)); }
  }
  const rest = out.find(g => g.rest);
  for (const p of places) { if (used.has(p.id)) continue; used.add(p.id); if (p.url) out.find(g => g.key === 'worlds').items.push({ label: strip(p.name), icon: p.icon || '🌐', url: p.url }); else rest.items.push(item(p)); }
  storesG.items.sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0) || a.label.localeCompare(b.label));
  storesG.letters = [...new Set(storesG.items.map(it => it.letter))].sort();
  /* 3. the url groups (worlds, modes), never the page we are on */
  for (const g of out) for (const [label, url, icon] of (typeof g._g.urls === 'function' ? g._g.urls() : (g._g.urls || []))) { if (self(url)) continue; if (g.items.some(it => it.url === url)) continue; g.items.push({ label, url, icon }); }
  for (const g of out) delete g._g;
  return out.filter(g => g.items.length);
}
/* the stores group filtered by first letter (null = all) */
export function storesByLetter(group, letter) { return letter ? group.items.filter(it => it.letter === letter) : group.items; }
/* travel to an item: places keep the instant "port" dash, fn items run, urls hop through app.go (ends VR, carries ?vr=1 + from=mall) */
export function goItem(app, it, mode = 'port') {
  if (!it) return;
  if (it.fn) { try { it.fn(app); } catch (e) { console.error(e); } return; }
  if (it.url) { const u = /^https?:/i.test(it.url) ? it.url : new URL(it.url, location.href).href; if (app.go) app.go(u, it.label); else location.href = u; return; }
  if (it.place) { const pl = it.place; if (pl.url) { goItem(app, { url: pl.url, label: it.label }); return; } if (pl.fn && pl.x === undefined) { try { pl.fn(app); } catch (e) { console.error(e); } return; } app.travel(pl, mode); }
}
export { aouUrl, AOU, STORE_PAGE };
