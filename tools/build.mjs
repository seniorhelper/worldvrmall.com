/* ============================================================
   World VR Mall · production build
   node tools/build.mjs [--api-origin=https://api.worldvrmall.com] [--keep-console]
   Reads the repo as it is (the source stays readable and editable) and writes the published site to dist/:
   - only files that belong on the website (EXCLUDE below keeps notes, SQL, .md, tools, supabase/ out)
   - every JS file minified + mangled, comments and console.log/info/debug/warn/trace stripped (console.error stays),
     no source maps, sourceMappingURL lines removed
   - the app modules in js/ renamed to content-hashed names (/js/<hash>.js) and every reference rewritten
   - supabase-js self-hosted from node_modules (pinned in package.json) instead of the public CDN
   - inline scripts and styles in every HTML page minified, HTML comments removed
   - a strict Content-Security-Policy + referrer policy <meta> on every page, with sha256 hashes of its inline scripts
   - sw.js cache version tied to the build, so a new deploy replaces the old caches
   One dependency: esbuild (a single native binary, light on RAM). Run `npm install` once.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));

/* the backend address the client talks to; --api-origin swaps it for a proxy on our own domain (see LOCKDOWN.md §Cloudflare) */
const SB_ORIGIN = 'https://izfccjaznlcffvjxawya.supabase.co';
const API_ORIGIN = String(args['api-origin'] || process.env.WVM_API_ORIGIN || SB_ORIGIN).replace(/\/+$/, '');
const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* Google Analytics 4 (property 560610016), injected into every built page; --ga=off or WVM_GA_ID=off leaves it out.
   Key events: phone_click on any tel: link, generate_lead when a form confirms delivery (pages fire a 'wvm-lead' window event) */
const GA_ID = String(args.ga || process.env.WVM_GA_ID || 'G-YPQJVKDPLQ');
const GA_ON = /^G-[A-Z0-9]+$/.test(GA_ID);
const GA_TAG = GA_ON ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script><script>window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', '${GA_ID}');
document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"]'); if (a) gtag('event', 'phone_click', { phone_number: a.getAttribute('href').slice(4), link_text: (a.textContent || '').trim().slice(0, 60), page_path: location.pathname }); }, true);
window.addEventListener('wvm-lead', function (e) { gtag('event', 'generate_lead', { form_name: (e.detail && e.detail.form) || 'form', page_path: location.pathname }); });</script>` : '';

/* never published: anything matching is skipped (paths are repo-relative, forward slashes) */
export const EXCLUDE = [
  /^\.git(\/|$)/, /^\.github\//, /^\.claude\//, /^\.vscode\//, /^node_modules\//, /^dist\//, /^tools\//, /^supabase\//,
  /^_[^/]*\//, /(^|\/)\.[^/]+$/,                                   // _drafts/, dotfiles (.gitignore, .gitkeep, .DS_Store…)
  /\.(md|sql|map|log|bak|tmp|psd|ts|mjs|cjs|zip)$/i, /(^|\/)(package(-lock)?\.json|Thumbs\.db|desktop\.ini)$/i,
  /(^|\/)(notes?|handoff|internal|private|secrets?)[^/]*$/i,
];
const isExcluded = (rel) => EXCLUDE.some((re) => re.test(rel));

const log = (...a) => console.log('[build]', ...a);
const sha = (buf, enc = 'hex') => crypto.createHash('sha256').update(buf).digest(enc);
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const rel = base ? base + '/' + d.name : d.name;
  if (isExcluded(rel) || isExcluded(rel + '/')) return [];
  return d.isDirectory() ? walk(path.join(dir, d.name), rel) : [rel];
});

const files = walk(ROOT).sort();
const BUILD = sha(files.map((f) => f + '\0' + sha(fs.readFileSync(path.join(ROOT, f)))).join('\n')).slice(0, 10);

/* app modules get hashed names; the name changes whenever anything in the build changes (no stale chains) */
const MODS = new Map(files.filter((f) => /^js\/[^/]+\.js$/.test(f)).map((f) => [path.basename(f, '.js'), '/js/' + sha(BUILD + f).slice(0, 12) + '.js']));
const OUTNAME = (rel) => (MODS.has(path.basename(rel, '.js')) && /^js\/[^/]+\.js$/.test(rel) ? MODS.get(path.basename(rel, '.js')).slice(1) : rel);

/* any quoted '/js/wvm-x.js?v=59', 'https://worldvrmall.com/js/wvm-x.js' (cross-site prefetch) or (inside js/) './wvm-x.js'
   becomes '/js/<hash>.js' (keeping the site prefix) */
const rewriteRefs = (text, inJsDir) => text.replace(/(["'`])(https:\/\/(?:www\.)?worldvrmall\.com)?(\/js\/|\.\/)([A-Za-z0-9_-]+)\.js(?:\?v=[^"'`]*)?\1/g, (all, q, site, pre, name) => {
  if (!MODS.has(name) || (pre === './' && (!inJsDir || site))) return all;
  return q + (site || '') + MODS.get(name) + q;
});

let SB_LOCAL = null;
async function bundleSupabase() {
  try {
    const r = await esbuild.build({ stdin: { contents: "export * from '@supabase/supabase-js';", resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true, legalComments: 'none', drop: KEEP_CONSOLE ? [] : ['console', 'debugger'], write: false, logLevel: 'silent', charset: 'utf8' });
    const code = r.outputFiles[0].text;
    SB_LOCAL = '/vendor/' + sha(code).slice(0, 12) + '.js';
    write(SB_LOCAL.slice(1), code);
  } catch (e) { log('supabase-js not installed (npm install): pages keep loading it from the CDN'); }
}

const swapUrls = (t) => {
  if (SB_LOCAL) t = t.split(SB_CDN).join(SB_LOCAL);
  if (API_ORIGIN !== SB_ORIGIN) t = t.split(SB_ORIGIN).join(API_ORIGIN);
  return t;
};

/* every console.* call is dropped except console.error, which is shielded as globalThis.console.error first */
const KEEP_CONSOLE = !!args['keep-console'];
const minJs = async (code, module) => (await esbuild.transform(KEEP_CONSOLE ? code : code.replace(/(?<![.\w$])console\.error\(/g, 'globalThis.console.error('), {
  loader: 'js', minify: true, legalComments: 'none', charset: 'utf8', target: 'esnext', drop: KEEP_CONSOLE ? ['debugger'] : ['console', 'debugger'], ...(module ? { format: 'esm' } : {}),
})).code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/gm, '').trim();
const minCss = async (code) => (await esbuild.transform(code, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' })).code.trim();

function write(rel, data) { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }

/* ---------- CSP ---------- */
function csp(hashes, inlineHandlers) {
  const CDN_SCRIPT = SB_LOCAL ? '' : ' https://cdn.jsdelivr.net';
  const api = API_ORIGIN, wss = API_ORIGIN.replace(/^https:/, 'wss:');
  const script = inlineHandlers ? "'self' 'unsafe-inline'" : "'self' " + hashes.map((h) => `'sha256-${h}'`).join(' ');
  const GA_SCRIPT = GA_ON ? ' https://www.googletagmanager.com' : '';
  const GA_CONNECT = GA_ON ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://*.g.doubleclick.net' : '';   // GA4 also posts to www.google.com/g/collect
  return [
    "default-src 'self' https://allofus.one",
    `script-src ${script}${CDN_SCRIPT}${GA_SCRIPT}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    'img-src \'self\' data: blob: https:',   // https: already covers the GA hosts
    'media-src \'self\' data: blob: https:',
    `connect-src 'self' ${api} ${wss} https://formsubmit.co${GA_CONNECT} data: blob:`,
    'frame-src https:',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://formsubmit.co",
    'upgrade-insecure-requests',
  ].join('; ');
}

/* ---------- HTML ---------- */
async function buildHtml(src) {
  const blocks = [];
  const hold = (s) => { blocks.push(s); return `\u0000${blocks.length - 1}\u0000`; };
  const hashes = [];
  /* the non-blocking font link (<link rel=preload as=style onload=…>) would force 'unsafe-inline': swap it for media=print
     plus a tiny inline script (hashed below) that turns it on once loaded */
  let html = src.replace(/<link\s+rel=["']preload["']\s+as=["']style["']\s+href=["']([^"']+)["']\s+onload=["']this\.onload=null;this\.rel='stylesheet'["']\s*\/?>/gi,
    (m, href) => `<link rel="stylesheet" href="${href}" media="print" data-late-css><script>document.querySelectorAll('link[data-late-css]').forEach(l => { const on = () => { l.media = 'all'; }; if (l.sheet) on(); else l.addEventListener('load', on); });</script>`);
  if (GA_TAG) html = html.replace(/<\/head>/i, () => GA_TAG + '</head>');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    let [all, attrs, body] = m;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    attrs = rewriteRefs(swapUrls(attrs), false);
    let out;
    if (/src\s*=/i.test(attrs)) out = `<script${attrs}></script>`;
    else if (/^(importmap|speculationrules|application\/(ld\+)?json)$/i.test(type)) {
      try { body = JSON.stringify(JSON.parse(body)); } catch (e) { body = body.trim(); }
      body = rewriteRefs(swapUrls(body), false).replace(/<\/(script)/gi, '<\\/$1');
      if (/^(importmap|speculationrules)$/i.test(type)) hashes.push(sha(body, 'base64'));
      out = `<script${attrs}>${body}</script>`;
    } else if (!type || /^(module|text\/javascript|application\/javascript)$/i.test(type)) {
      body = rewriteRefs(swapUrls(await minJs(body, /module/i.test(type))), false);
      hashes.push(sha(body, 'base64'));
      out = `<script${attrs}>${body}</script>`;
    } else out = all;
    html = html.replace(all, () => hold(out));
  }
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  for (const m of [...html.matchAll(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi)]) { const css = await minCss(m[2]).catch(() => m[2]); html = html.replace(m[0], () => m[1] + css + m[3]); }
  html = swapUrls(rewriteRefs(html, false));
  if (SB_LOCAL) html = html.replace(/<link[^>]+rel=["']?(preconnect|dns-prefetch)["']?[^>]+cdn\.jsdelivr\.net[^>]*>/gi, '').replace(/<link[^>]+href=["']https:\/\/cdn\.jsdelivr\.net["'][^>]*rel=["']?(preconnect|dns-prefetch)[^>]*>/gi, '');
  const handlers = /<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(html.replace(/\u0000\d+\u0000/g, ''));
  html = html.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');
  const metas = `<meta http-equiv="Content-Security-Policy" content="${csp(hashes, handlers)}"><meta name="referrer" content="strict-origin-when-cross-origin">`;
  html = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  if (/<meta[^>]+charset[^>]*>/i.test(html)) html = html.replace(/(<meta[^>]+charset[^>]*>)/i, (m) => m + metas);
  else html = html.replace(/<head[^>]*>/i, (m) => m + metas);
  html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
  return { html, handlers };
}

/* ---------- run ---------- */
const t0 = Date.now();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
await bundleSupabase();
const stats = { js: 0, html: 0, copied: 0, bytesIn: 0, bytesOut: 0 }, loosePages = [];
for (const rel of files) {
  const abs = path.join(ROOT, rel), raw = fs.readFileSync(abs);
  stats.bytesIn += raw.length;
  let out = raw;
  if (/\.js$/.test(rel)) {
    let code = raw.toString('utf8');
    if (rel === 'sw.js') code = code.replace(/const V = (['"])([^'"]+)\1/, (m, q, v) => `const V = ${q}${v}-${BUILD.slice(0, 6)}${q}`);
    const module = rel !== 'sw.js';
    code = await minJs(code, module);
    out = rewriteRefs(swapUrls(code), rel.startsWith('js/'));
    stats.js++;
  } else if (/\.html?$/.test(rel) && !/^google[0-9a-f]+\.html$/.test(rel)) {   // search-console verification files stay byte-exact
    const r = await buildHtml(raw.toString('utf8'));
    if (r.handlers) loosePages.push(rel);
    out = r.html; stats.html++;
  } else if (/\.(json|webmanifest)$/.test(rel)) {
    const t = raw.toString('utf8');
    try { out = rewriteRefs(swapUrls(JSON.stringify(JSON.parse(t))), false); } catch (e) { out = t; }
  } else if (/\.(txt|xml)$/.test(rel)) out = swapUrls(raw.toString('utf8'));
  else stats.copied++;
  const o = Buffer.isBuffer(out) ? out : Buffer.from(out, 'utf8');
  stats.bytesOut += o.length;
  write(OUTNAME(rel), o);
}
write('.nojekyll', '');

/* ---------- checks: the build fails rather than publish something it should not ---------- */
const problems = [];
const LEAKS = [
  [/sb_secret_[A-Za-z0-9_]+/, 'Supabase secret key'], [/service_role/i, 'service_role mention'], [/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/sk-[A-Za-z0-9_-]{24,}|sk_live_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}/, 'API key'],
  [/sourceMappingURL=/, 'source map link'],
  [/\b(elevenlabs|vapi\.ai|twilio|thehive|hivemoderation)\b/i, 'vendor name'],
];
for (const rel of walk(OUT)) {
  if (!/\.(js|html?|json|webmanifest|txt|xml)$/.test(rel)) continue;
  const t = fs.readFileSync(path.join(OUT, rel), 'utf8');
  for (const [re, what] of LEAKS) { const m = t.match(re); if (m) problems.push(`${rel}: ${what} (${m[0].slice(0, 24)}…)`); }
  const stale = t.match(/["'`](https:\/\/(www\.)?worldvrmall\.com)?(\/js\/|\.\/)(wvm|aou)-[a-z0-9-]+\.js/);
  const talk = !KEEP_CONSOLE && /\.js$/.test(rel) && t.match(/(?<![.\w$])console\.(log|info|debug|warn|trace)\(/);
  if (talk) problems.push(`${rel}: console call left (${talk[0]})`);
  if (stale) problems.push(`${rel}: module reference not rewritten (${stale[0]})`);
}
fs.writeFileSync(path.join(ROOT, 'tools', '.last-build.json'), JSON.stringify({ build: BUILD, apiOrigin: API_ORIGIN, supabaseJs: SB_LOCAL, modules: Object.fromEntries(MODS), csploosePages: loosePages }, null, 1));
const kb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
log(`${files.length} files → dist/ in ${Date.now() - t0} ms · ${stats.js} js, ${stats.html} html, ${stats.copied} copied · ${kb(stats.bytesIn)} → ${kb(stats.bytesOut)} · build ${BUILD}`);
if (loosePages.length) log('pages with inline on*= handlers (CSP keeps unsafe-inline there):', loosePages.join(', '));
if (problems.length) { console.error('[build] FAILED checks:\n  ' + problems.join('\n  ')); process.exit(1); }
log('checks passed');
