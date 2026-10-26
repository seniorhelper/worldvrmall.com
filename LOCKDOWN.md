# World VR Mall · code lockdown (Oct 25 2026)

> ## ⚠️ The GitHub repo is PUBLIC
> `github.com/seniorhelper/worldvrmall.com` is public. Anyone can read every file and every past commit there, so
> minifying the website does not hide the source while the repo stays public. Today the live site also serves the
> whole repo as-is, internal files included: `https://worldvrmall.com/SETUP-v39.md`,
> `/supabase/worldvrmall-v39.sql`, `/README.md` and `/ORIGINALITY.md` all return 200.
> Zach's steps to close both are in §6 (make the repo private, keep Pages working) and §3 (serve only `dist/`).

## Summary

| | Result |
|---|---|
| Secret keys in code (service role, `sb_secret_`, JWTs, OpenAI/AWS/GitHub/Slack/Google keys) | **None**, in the current files or in any of the 75 commits in history. No file was ever committed and later deleted. |
| AI or voice vendors (ElevenLabs, Vapi, Hive, Twilio, OpenAI) | **None** in the code or the history. "Gemini", "ChatGPT", "Claude" show up only in Eye To Ad marketing copy ("get cited by ChatGPT, Gemini…"), which is meant to be read. |
| Public anon key | `sb_publishable_…` in `js/wvm-config.js:12` and `report-bug/index.html:68`. It is meant to be public, and RLS is on for every table this site uses. One column leak in the shared allofus.one `profiles` table: see finding F1. |
| Internal files published | The live site serves `SETUP-v39.md`, the SQL file and the READMEs. The new build leaves them out. |
| Build | `tools/build.mjs` writes a minified, mangled `dist/` with hashed file names, no comments, no console calls except `console.error`, no source maps, and a CSP on every page. Tested: 15 pages with no console messages, and the 3D island, mall, store and VR simulator all boot (details in §7). |
| Live deploy | **Not changed.** Pages still publishes `main` as it is. The steps to switch are in §3. |

## 1. Findings (file · line · risk · fix)

| # | Where | What | Risk | Fix |
|---|---|---|---|---|
| F1 | Supabase `public.profiles` (the shared allofus.one project; the read happens in `js/wvm-plus.js` and `js/wvm-feed.js`) | Anyone holding the public key can read **every** column of every profile, including `blocked`, `adult`, `email_optin`, `email_optin_at`, `ad_pref`, `ad_filters`, `referred_by` and `home` (11 profiles today). | **Medium** privacy issue: who blocked whom, adult flags and marketing opt-ins are visible to anyone. | Fix it on the allofus.one side: give `anon` (and `authenticated`, for other people's rows) a column grant or a `profiles_public` view that leaves those fields out. Check that the allofus client does not `select('*')` as anon before revoking. The allofus v27 notes already list this as open ("profiles.blocked/home world-readable"). |
| F2 | `js/wvm-xr.js:401` (VR bug button), `scan/index.html:37` | Sends reports to the third-party form service `formsubmit.co`. The address is base64 so it can't be read at a glance. | **Low.** A third party (the vendor) sees bug reports and scans, and the vendor name is visible in the network tab and the CSP. | Post to the existing `bugs` table instead, the way `report-bug/` and `wvm-shell.js:209` already do. Left alone here because `wvm-xr.js` belongs to the VR/UX session this week. |
| F3 | `js/wvm-config.js:11`, every page's network traffic | The backend address `izfccjaznlcffvjxawya.supabase.co` shows the vendor. | **Low** (vendor visibility only). | Optional proxy on our own domain: build with `--api-origin=https://api.worldvrmall.com` behind Cloudflare (§4b). The library inside the bundle still reveals what it is to anyone reading code, which can't be avoided while the browser talks to Supabase directly. |
| F4 | `investors/`, `scan/`, `tour/`, `js/wvm-plus.js:58` | supabase-js was loaded at runtime from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` with no version pin. | **Medium supply-chain risk:** any new 2.x release ran on the site automatically. | **Fixed in the build:** supabase-js `2.117.3` (pinned in `package.json`) is bundled into `/vendor/<hash>.js`, and the CDN preconnects are removed. |
| F5 | `SETUP-v39.md`, `supabase/worldvrmall-v39.sql`, `README.md`, `ORIGINALITY.md` | Internal notes are published on the live site. SETUP lists debug switches (`?vrdebug=1`, `?xrsim=1`, `app._xrApi…`), the `bugs` table and the Zapier/webhook setup. | **Low/medium:** it's a map of the backend and the debug tools. | **Fixed in the build:** the EXCLUDE list in `tools/build.mjs` leaves out `*.md`, `*.sql`, `supabase/`, `tools/`, dotfiles, `_folders/` and anything named notes/handoff/internal/private/secret. Goes live with the §3 switch. |
| F6 | All JS (`js/*.js`) | Every file has long comments (release notes, internal reasoning, "© allofus.one") and readable names. | **Low** (readability for copycats). | **Fixed in the build:** comments stripped, local names mangled, files renamed to `/js/<hash>.js`, console calls dropped. |
| F7 | `?vrdebug=1`, `?xrsim=1` in `js/wvm-xr.js` / `js/wvm-shell.js` | The debug panel and the XR simulator ship to production. | **Low.** They show internal state, but nothing that isn't already in the code. | Fine to keep for headset QA. Gate them behind a build flag later if wanted. |
| F8 | `report-bug/index.html:68`, `js/wvm-shell.js:209` | The `bugs` table accepts anonymous inserts. | **Low:** spam is possible, and reads are blocked (an anon read returned `[]`). | Optional: add a rate limit or size check in the table's insert policy or trigger. |
| — | `prizes` | Readable by anyone, including `claimed_by` (a user uuid). | Info only. | Optional: leave `claimed_by` out of the anon grant. |
| — | `prize_claims`, `leads`, `lifeboards`, `store_scans`, `bugs` | An anon read returns `[]`, so RLS holds. Inserts go only through the `security definer` RPCs `claim_prize` / `submit_lead`, which check input and rate-limit. | OK | — |
| — | `1-800-481-8638`, `info@eyetoad.com`, `1001 Bannock St` | Public business contact details, shown on purpose. | OK | — |

How the scan was done: a regex sweep over every tracked file and every blob in all 75 commits (`git grep` over `git rev-list --all`) for key formats (sb_secret, service_role, JWT, sk-, sk_live, AKIA, ghp_, xox, AIza), vendor names and hostnames, plus a list of deleted files (none). RLS was checked with read-only anon `GET` requests against each table the client uses.

## 2. Secrets behind a proxy

Nothing secret was found, so there was nothing to move. The only key in the client is the publishable one, which is meant to be public. Keep it that way: any future AI, voice or moderation feature (ElevenLabs, Vapi, Hive…) gets a Supabase Edge Function that holds the key server-side, in the same shape as allofus.one's `supabase/functions/*` (`media-scan`, `match-ai`). The browser calls only `/functions/v1/<name>`, and the vendor name and key never reach the page.

## 3. The build: `tools/build.mjs`

```bash
npm install          # once: esbuild (one native binary) + supabase-js 2.117.3, ~21 MB in node_modules
npm run build        # = node tools/build.mjs  → dist/   (~3–5 s, low RAM)
npm run serve        # = node tools/serve.mjs dist 8480 → http://localhost:8480
```

What it does:
- **Publishes only website files.** Everything that matches `EXCLUDE` at the top of `tools/build.mjs` is left out (`.md`, `.sql`, `supabase/`, `tools/`, `.github/`, `.claude/`, `node_modules/`, dotfiles, `_drafts/`, `package*.json`, source maps…). Add patterns there.
- **JS:** esbuild minify + identifier mangling. Every `console.*` call is removed except `console.error`, along with `debugger`, all comments and every `sourceMappingURL`. three.js and its addons are minified the same way.
- **Hashed names:** `js/wvm-*.js` become `/js/<12-hex>.js`, and every quoted reference is rewritten: imports, `import()`, the `?v=59` URLs, sw.js precache lists, modulepreload links, HTML inline scripts, and the cross-site prefetch list (`https://worldvrmall.com/js/…`). The hashes change on every build that changes anything. The name map is written to `tools/.last-build.json`, which is gitignored and never published.
- **HTML:** inline scripts and styles are minified, HTML comments removed, and the JSON-LD and importmap compacted. The `google…html` verification file is left exactly as it is.
- **sw.js:** the cache version becomes `v96-<build>`, so each deploy replaces the old caches.
- **Safety checks.** The build fails if `dist/` contains a secret-key pattern, `service_role`, a JWT, a source-map link, an AI vendor name, a console call, or a module reference it didn't rewrite.
- Options: `--api-origin=https://api.worldvrmall.com` (§4b) and `--keep-console` (for debugging a build).

**Source stays as it is.** Keep editing the readable files and bumping `?v=` and `sw.js` V as before. The build is only the publishing step.

### Switching the live site to `dist/` (Zach)
The workflow `.github/workflows/pages-dist.yml` is already in the repo but **dormant**: it runs only when started by hand.
1. Merge this branch to `main` (the QA session does this).
2. GitHub → repo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"**. The custom domain `worldvrmall.com` and "Enforce HTTPS" stay as they are.
3. **Actions → "Deploy dist to Pages" → Run workflow** (branch `main`). It takes about 1 minute.
4. Check: `https://worldvrmall.com/SETUP-v39.md` → 404. View source on the home page → one-line minified scripts and `/js/<hash>.js`. Walk in and enter the mall.
5. To deploy on every push from then on, add `push: { branches: [main] }` under `on:` in the workflow.
- **Rollback:** Settings → Pages → Source: "Deploy from a branch" → `main` / root. That brings back the old behavior at once.
- Note for allofus.one: its copy of the VR layer prefetches `https://worldvrmall.com/js/wvm-*.js` by the old names. After the switch those prefetches return 404. That's silent and harmless, but allofus should drop or refresh that list.

## 4. Security headers

### 4a. Done with `<meta>` (in every built page)
- **Content-Security-Policy**, with a per-page `sha256` hash of every inline script. `'unsafe-inline'` is used only on pages that have inline `on…=` handlers (none today):
  `default-src 'self' https://allofus.one; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' <api> wss://<api> https://formsubmit.co data: blob:; frame-src https:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://formsubmit.co; upgrade-insecure-requests`
  - Scripts can load only from our own domain: there is no CDN script host any more.
  - `img-src https:` because store logos come from each brand's site. `frame-src https:` because LIFEboard tools, YouTube, Maps and NASA Eyes are framed.
  - When a new feature needs a new host, add it in `csp()` in `tools/build.mjs`.
- **Referrer-Policy:** `<meta name="referrer" content="strict-origin-when-cross-origin">`. The allofus.one SSO check reads only the hostname of the referrer, so it keeps working.

### 4b. Not possible on GitHub Pages: Cloudflare in front (recommended)
Browsers ignore these headers when they come as `<meta>`, and GitHub Pages can't send them: `frame-ancestors` (clickjacking), **Permissions-Policy**, HSTS, `X-Content-Type-Options`. Cloudflare's free plan in front of Pages adds them.
1. Add `worldvrmall.com` to Cloudflare and switch the nameservers at the registrar. Copy the existing DNS records: the four A records `185.199.108–111.153` and `www` CNAME → `seniorhelper.github.io`.
2. Leave the records **DNS only (grey cloud)** until GitHub shows the certificate as issued. Then switch them to **Proxied**, with SSL/TLS mode **Full (strict)**.
3. **Rules → Transform Rules → Modify Response Header → Set static** on all requests:
   - `Permissions-Policy: camera=(self), microphone=(self), xr-spatial-tracking=(self), fullscreen=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()`
     (camera = selfie avatar, microphone = voice, xr = headsets, motion sensors = phone look-around)
   - `Content-Security-Policy: frame-ancestors 'self' https://allofus.one` (or `'none'` if allofus never frames the mall)
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff`
   - `Cross-Origin-Opener-Policy: same-origin-allow-popups`
4. Optional, to hide the backend vendor (F3): a Cloudflare Worker on `api.worldvrmall.com`:
   ```js
   export default { async fetch(req) { const u = new URL(req.url); u.hostname = 'izfccjaznlcffvjxawya.supabase.co'; u.port = ''; return fetch(new Request(u, req)); } };
   ```
   Then build with `--api-origin=https://api.worldvrmall.com`: add it to the `node tools/build.mjs` line in the workflow.
   - Supabase's login storage key follows the hostname, so signed-in visitors are signed out once.
   - The cross-world SSO hand-off carries the tokens itself, so it keeps working.
   - Supabase's paid Custom Domain add-on does the same job without a Worker.

## 5. robots.txt / llms.txt / sitemap.xml
- `sitemap.xml` and `llms.txt` list only public pages (checked). `robots.txt` blocks nothing, which is correct: listing internal paths in robots.txt would advertise them.
- Internal files are kept off the site by the build's EXCLUDE list, not by robots. Until the §3 switch they stay reachable at their URLs.

## 6. Making the repo private while keeping Pages (Zach)
GitHub Pages on a **private** repo needs a paid plan (GitHub Pro, $4/mo, for a personal account). Two ways:
- **A. Pro + private (simplest):** upgrade to GitHub Pro → repo **Settings → General → Danger Zone → Change visibility → Private**. First do the §3 switch (Source = GitHub Actions). The site stays public, the code doesn't. Check that `worldvrmall.com` still loads afterwards: Pages keeps the custom domain.
- **B. Free:** make this repo private and publish only `dist/` to a second, public repo (for example `seniorhelper/worldvrmall-site`) through a workflow step that pushes `dist/` there. That needs a deploy token stored as a repo secret, which Zach adds himself. The custom domain moves to the site repo. The public repo then shows only minified output.
- Either way, the **history already on GitHub stays readable** by anyone who cloned or forked it earlier. It held no secrets (§1), so that's acceptable. Forks: Settings → check the "Forks" count. Public forks of a repo that goes private stay public.
- allofus.one is public too (`seniorhelper/allofus.one`), and the same steps apply there.

## 7. Test record (Oct 25 2026)
- `node tools/build.mjs`: 151 files → `dist/`, 24.9 → 24.2 MB (mostly images and models), about 3–5 s, all checks passed.
- Headless Edge with software WebGL (Chrome DevTools protocol): `/?mode=3d`, `/mall/?mode=3d`, `/mall/?xrsim=1&vr=1`, `/stores/showers4less/?mode=3d`, `/feed/`, `/directory/`, `/investors/`, `/scan/`, `/report-bug/`, `/tour/`, `/stores/`, `/countries/`, `/lease/`, `/prize-rules/`, `/terms/`.
  - **Zero console messages and zero CSP violations** on every page.
  - The 3D world booted (canvas, `WVM_APP`) on the island, the mall, the store and the VR simulator.
  - The feed loaded the self-hosted supabase-js and read live `prizes` under the CSP.
  - The XR layer and its lazy modules loaded by their hashed names.
- The same pages served from the source tree behave identically.
