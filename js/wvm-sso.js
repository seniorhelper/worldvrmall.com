/* ============================================================
   allofus.one · one login across our worlds (v4)
   Both sites use the same Supabase project. When you travel from
   one world to another, your session rides along in the URL
   fragment (#aou_sso=…), which browsers never send to any server.
   The receiving world signs you in and wipes the fragment at once.
   Only our own domains are allowed.
   Drop-in for World VR Mall: copy this file, then
     import { ssoReceive, ssoWire } from '/js/aou-sso.js';
     await ssoReceive(sb); ssoWire(sb);
   © 2026 allofus.one
   ============================================================ */
export const SSO_DOMAINS = ['allofus.one', 'worldvrmall.com'];
const ok = (url) => { try { const u = new URL(url, location.href); const h = u.hostname.replace(/^www\./, ''); return u.protocol === 'https:' && !u.username && !u.password && SSO_DOMAINS.includes(h) && h !== location.hostname.replace(/^www\./, ''); } catch (e) { return false; } };
/* v26: a session hand-off is only accepted when the visitor really arrived from one of our other worlds (stops someone
   mailing a link that silently signs a person into the sender's account) */
const fromOurWorld = () => { try { if (!document.referrer) return false; const r = new URL(document.referrer); const h = r.hostname.replace(/^www\./, ''); return r.protocol === 'https:' && SSO_DOMAINS.includes(h) && h !== location.hostname.replace(/^www\./, ''); } catch (e) { return false; } };
export async function ssoHref(sb, url) { if (!sb || !ok(url)) return url; try { const { data } = await sb.auth.getSession(); const s = data && data.session; if (!s) return url; const blob = btoa(JSON.stringify({ a: s.access_token, r: s.refresh_token, t: Date.now() })); const u = new URL(url); u.hash = 'aou_sso=' + encodeURIComponent(blob); return u.toString(); } catch (e) { return url; } }
export async function ssoReceive(sb) { const m = location.hash.match(/aou_sso=([^&]+)/); if (!m || !sb) return false; history.replaceState(null, '', location.pathname + location.search); if (!fromOurWorld()) return false; try { const d = JSON.parse(atob(decodeURIComponent(m[1]))); if (!d.a || !d.r || Date.now() - d.t > 10 * 60 * 1000) return false; const { error } = await sb.auth.setSession({ access_token: d.a, refresh_token: d.r }); return !error; } catch (e) { return false; } }
/* rewrite clicks on links to our other worlds so you arrive signed in */
export function ssoWire(sb) { document.addEventListener('click', async (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (!a || !ok(a.href)) return; e.preventDefault(); const href = await ssoHref(sb, a.href); if (a.target === '_blank') window.open(href, '_blank', 'noopener'); else location.href = href; }, true); }
