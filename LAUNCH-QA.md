# World VR Mall · launch integration QA (Oct 25 2026)

Branch **`wvm-launch-2026-10-25`**, cut from `main` @ 3d0df6d. **Not pushed, not merged into `main`.** Zach approves pushes.
All six upgrade branches are in. The content branch was merged last, in a second round.

## 1. What merged (in this order, `--no-ff`)

| # | Branch | What it brings | Result |
|---|---|---|---|
| 1 | `claude/wvm-lockdown-da3f5e` | `tools/build.mjs` → minified, hashed `dist/` with a per-page CSP; `tools/serve.mjs`; dormant Pages workflow; `LOCKDOWN.md` | clean |
| 2 | `claude/wvm-social-7f3001` | `js/wvm-social.js` (`WVM_SOCIAL`: your allofus people in the mall, DMs, connect, hop to allofus and back), SQL `wvm-social-v31.sql`, `SOCIAL.md`, `ALLOFUS-SIDE.md` | clean |
| 3 | `claude/wvm-shield-30fba1` | `js/wvm-shield.js` (`WVM_SHIELD`: age levels, report / block / mute, server-stamped events, rooms), age-check Edge Function, SQL v31 age assurance + v40, `SHIELD.md`, Terms / Prize rules / About text | **1 conflicting file**, see §2 |
| 4 | `claude/wvm-ux-e0f426` | One dark load with no flash, `WVM_NAV` shared nav, icon set, VR laser / tour / NaN fixes, Cardboard guard, sw v97, `UX-REPORT.md`, `BUGS-2026-10-25.md` | clean (sw.js, about, terms, prize-rules auto-merged) |
| 5 | `claude/wvm-gathering-a7fae8` | The World Fire: `js/wvm-gather.js`, `-net.js`, `-rtc.js`, 2-line hook in `wvm-inside.js`, `WORLD-FIRE.md` | clean |
| 6 | `claude/wvm-content-ada6e1` (b2b2a31, 8cd386f) | Six SEO pages (`/virtual-shopping-mall/`, `/vr-shopping-mall/`, `/3d-virtual-mall/`, `/metaverse-mall/`, `/virtual-store-for-small-business/`, `/press/`), ElevenLabs sound (`js/wvm-media.js`, `WVM_SOUND`), Orbit's voice (`js/wvm-orbit-voice.js`, `orbit-voice` Edge Function + SQL), voice box (`js/wvm-voicebox.js`), video screens, `/audio/` (incl. `world-fire-crackle.mp3`), `CONTENT.md` | clean |

## 2. Conflicts, and the changes I made on top

**`js/wvm-plus.js` (social × shield), 3 hunks.** Both branches rewrote the live-players block.
- **Live players / positions:** took the **shield** version (private, age-walled `SHIELD.topic()` channels, `SHIELD.canSee` in `upsertRemote`, personal-space bubble, safe names). It already contains the social bridge's rule: when `window.WVM_SOCIAL` exists, nothing is sent on the area `pos` topic, and every area receive is filtered by `WVM_SOCIAL.visible(id)`. So strangers stay hidden.
- **Player card:** the shield's card uses `app.popup` (works flat and in VR), so social's `decorateCard(modal)` no longer had a modal to decorate. I added `WVM_SOCIAL.cardActions(r)` to `js/wvm-social.js`. It returns the same buttons (💬 Message / 🤝 Connect on allofus / ⏳ Request sent) as `{ label, fn }`, and the shield card shows them before the 🛡️ actions. `decorateCard` is still exported.
- **Hugs:** the shield replaced broadcast hugs (`onFx`) with consent hugs (`hug_req` / `hug_ok`). Social's gate moved with it: a `hug_req` from someone `WVM_SOCIAL.visible()` says you can't see is ignored.
- **Voice:** took the shield's push-to-talk voice (private `:voice` topic, server-stamped signaling, 15 m range). Social's old "volume 0 for hidden people" hook was on the replaced voice code. Shield voice only connects to people in `remote`, and with social on that holds only visible people, so the rule still holds.
- **Module tail:** kept both lines: social's `import('./wvm-social.js?v=59')` and the shield's `window.WVM_PLUS = { …, ptt, shield: SHIELD, … }`.

**Round 1 QA commit**
- `sw.js` → v98, with the shield + 3 gather files precached.
- `tools/build.mjs`, two CSP fixes the merged tree needed:
  1. UX's non-blocking Google Fonts link (`<link rel=preload as=style onload=…>`) made the build fall back to `'unsafe-inline'` on **24 pages**. The build now rewrites it to `media="print"` plus a tiny hashed inline script that switches it on after load. No page needs `'unsafe-inline'` any more. Source HTML is unchanged.
  2. UX's inline `<script type="speculationrules">` was blocked by the CSP on every page. The build now minifies and hashes it like `importmap`.

**Round 2 QA commit (content + GA4)**
- `sw.js` → **v99**. Precache adds `/js/wvm-media.js`, `/js/wvm-voicebox.js`, `/js/wvm-orbit-voice.js`. `/audio/` and `/media/` stay on demand, as CONTENT.md asks.
- **CSP for content:** nothing to add. The `orbit-voice` Edge Function lives on the Supabase origin, which is already in `connect-src`. Audio, video and shots are same-origin, and `media-src` already has `'self' data: blob: https:`.
- **Footer links** (CONTENT.md's suggestion): `/about/` and `/lease/` footers now link "Virtual store for small business" and "Press". `/press/` was not added to the WVM_NAV More sheet. That's optional, and the footer + sitemap cover it.
- **GA4 in the build**, measurement ID `G-YPQJVKDPLQ`, property 560610016:
  - `tools/build.mjs` injects the standard gtag loader plus one inline config script before `</head>` of **every built page**. The Search Console verification file stays byte-exact. The script is hashed like the other inline scripts. Source pages have no GA, so local source previews don't report.
  - Turn it off with `--ga=off` (or `WVM_GA_ID=off`). A different ID: `--ga=G-XXXX`.
  - CSP additions (only when GA is on): `script-src https://www.googletagmanager.com`; `connect-src https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://*.g.doubleclick.net`; `img-src` already allows `https:`.
  - **`www.google.com` was needed.** The first test run showed GA4 posting to `https://www.google.com/g/collect` and the CSP blocking it on every page. That's why it and `*.g.doubleclick.net` (Google's documented GA4 CSP set) are in.
  - **Key event `phone_click`:** one delegated click listener on every `a[href^="tel:"]` sends `phone_number`, `link_text` and `page_path`.
  - **Key event `generate_lead`:** fires on a `wvm-lead` window event (`form_name`, `page_path`). Each real lead form dispatches it **only after the send is confirmed**, so spam-blocked, bot-timed and failed sends don't count. Forms: `lease` (/lease/), `country` (/countries/), `investor` (/investors/), `store_sales_tool` (the in-mall ✨ Get a store form, `submit_lead` RPC), `pax_help` (Pax's "talk to a human" form, `wvm-bot.js`). Bug reports are not leads.

## 3. Test results

**Build:** `node tools/build.mjs`: `196 files → dist/ · 56 js, 35 html, 97 copied · 35.2 MB → 34.5 MB · checks passed` (it was 24.4 MB before the content branch's audio, video and shots). UX's `wvm-pre3d` script stays inline and first in `<head>`.

**Headless Edge, SwiftShader WebGL** (`cdp-check.mjs` from the lockdown session, plus a copy that blocks GA's collect URLs, so **no test hits reached the real GA property**; gtag.js itself loaded, so its CSP was exercised). One browser at a time, closed after each run. `dist/` was served on :8480, the source on :8481.

| Page | dist (final run, 20 s/page) | source |
|---|---|---|
| `/?mode=3d` (island) | boots 3D, nav ✓, GA ✓, both key events ✓ | boots, no errors |
| `/mall/?mode=3d` | boots, GA ✓, events ✓ | boots, no errors |
| `/stores/search-converts/` | nav ✓, GA ✓, events ✓ | no errors |
| `/about/` | nav ✓, GA ✓, events ✓ | no errors |
| `/mall/?xrsim=1&vr=1` (VR sim) | boots, GA ✓, events ✓ | boots, no errors |
| `/mall/?mode=3d&firetest=1` | boots, GA ✓, events ✓ | boots, no errors |
| `/virtual-shopping-mall/` | nav ✓, JSON-LD parses, video ✓, GA ✓ | no errors |
| `/vr-shopping-mall/` | nav ✓, JSON-LD ✓, GA ✓ | no errors |
| `/3d-virtual-mall/` | nav ✓, JSON-LD ✓, video ✓, GA ✓ | no errors |
| `/metaverse-mall/` | nav ✓, JSON-LD ✓, GA ✓ | no errors |
| `/virtual-store-for-small-business/` | nav ✓, JSON-LD ✓, GA ✓ | no errors |
| `/press/` | nav ✓, JSON-LD ✓, video ✓, GA ✓ | no errors |
| `/lease/` | nav ✓, GA ✓, events ✓ | no errors |

- **Final dist run:** 0 console errors, 0 exceptions, 0 CSP violations on all 13 pages. The only failed requests are the GA collect calls the test blocked on purpose. The key-event check clicked a `tel:` link (navigation prevented) and dispatched a test `wvm-lead`. `dataLayer` showed `phone_click` and `generate_lead` on every page.
- **Long mall check** (dist, `/mall/?mode=3d&firetest=1`, 150 s): Orbit ✓, Orbit voice ✓, `WVM_SOUND` ✓, the 📺 Big Screen place ✓, social ✓, World Fire ✓, shield ✓, VR layer ✓, no errors.
  - Orbit (and so sound and the screens) loads only after the VR layer, which takes well over a minute in software WebGL. At 20 s and 75 s they weren't up yet. A direct import of all three content modules worked with no error.
- **Round 1** (before content) also caught the speculation-rules CSP violation and the 24 `'unsafe-inline'` pages. Both are fixed (§2).

**Not tested here:** real signed-in adult accounts (the SQL isn't on production), two-person World Fire WebRTC (the gathering session verified it with fake media), the Orbit voice Edge Function (not deployed), real GA reports (collect was blocked), Quest, phones, and listening to the audio.

## 4. Open notes

- **F2 (lockdown), now wider:** **formsubmit.co** (third-party vendor) is still used by `js/wvm-xr.js:401` (VR bug report), `scan/index.html:39`, and three lead forms: `/lease/`, `/countries/` and Pax's help form in `js/wvm-bot.js`. That's why it stays in the CSP `connect-src` / `form-action`. Move them to Supabase (`bugs` table / `submit_lead`), then drop formsubmit from `csp()`.
- **F1 (lockdown, allofus side):** anon can read every column of allofus `profiles` (blocked, adult, email_optin, ad_pref, referred_by…). Fix on allofus: column grant or a view.
- **GA4 and privacy:** GA now loads on every page with no consent banner and no Consent Mode. That's normal for a US-only audience, but EU/UK visitors would need consent first. The privacy page (allofus.one/privacy, linked from the mall) should mention Google Analytics. Kids safe mode doesn't switch GA off.
- **VR menu entries from social aren't drawn yet.** `wvm-social.js` registers `window.WVM_MENU_EXTRA` (👥 People & messages, 🌍 Go to allofus.one), but `wvm-xr.js` `meRows()` doesn't draw them (one-line snippet in SOCIAL.md). In VR, People is reached via a friend's player card (💬 Message) or the floating message card. Left out because only a headset can verify it.
- **Shield room API for the Fire:** the shield has `canJoinRoom`, `kick` and `lockRoom` but no `muteAll`, so that one host control is client-side only.
- **World Fire crackle:** the file now exists, and `wvm-gather.js` picks it up. It doesn't set the gapless `loopStart = 1524/44100`, `loopEnd = loopStart + 1322999/44100` (CONTENT.md), so there's a ~60 ms seam each lap, barely audible under fire noise. The crackle and the engine's synth beeps don't follow `WVM_SOUND` yet.
- **`?to=promo-screen` deep link** doesn't work yet: the place registers about 5 s after load (CONTENT.md).
- `wvm-xr.js` now differs from allofus `aou-xr.js` (castPanels, goPlace NaN guard, tour filter, Cardboard guard). Port these to allofus when it's next touched.
- `?v=59` module query strings are unchanged on purpose. The sw bump clears old caches.

## 5. What Zach must do

1. **Review and push this branch**, then merge to `main` when happy. (Nothing was pushed.)
2. **Run the SQL** in Supabase → SQL Editor, project `izfccjaznlcffvjxawya`:
   1. `supabase/v31-age-assurance.sql` (shared; also copy it to allofus `supabase/_parts/`).
   2. `supabase/wvm-social-v31.sql` and `supabase/wvm-shield-v40.sql`, in either order.
   3. `supabase/wvm-orbit-voice.sql`.
   - Don't re-run `worldvrmall-v39.sql`. Until these run, live social stays dark (fail-closed).
   - Later, the allofus owner runs `supabase/wvm-social-consent-guard.sql`.
3. **Yoti keys, per SHIELD.md §3:** deploy the `age-check` Edge Function (Verify JWT **off**). Put `YOTI_SDK_ID`, `YOTI_API_KEY` and `AGE_WEBHOOK_SECRET` **only** in Supabase Edge Function secrets. Then set `age_check_url` and `age_provider = "yoti"` in `safety_settings`. Sandbox first, then live keys.
4. **ElevenLabs, per CONTENT.md:**
   1. Put the restricted key `worldvrmall-orbit-proxy` in the Supabase secret `ELEVENLABS_API_KEY`, never in the repo. If its dialog is gone, recreate the key.
   2. Deploy `supabase/functions/orbit-voice` (Verify JWT **on**).
   3. Optionally set `ORBIT_VOICE_ID` if the default isn't "Liam".
   4. Listen to the audio once.
5. **Switch GitHub Pages to `dist/`, per LOCKDOWN.md §3**, soon after the merge: Settings → Pages → Source "GitHub Actions" → Actions → "Deploy dist to Pages" → Run workflow. Check that `/SETUP-v39.md` returns 404. Rollback: Source back to "Deploy from a branch". **GA4 only reports once the site is served from `dist/`.**
6. **GA4:**
   1. In GA Admin → Events, mark **`generate_lead`** and **`phone_click`** as key events once they first show up. Realtime or DebugView shows them a few minutes after a visit.
   2. Optionally register `form_name` as a custom dimension.
   3. Decide whether you need a consent banner (see §4).
7. **F1:** add a column grant or a view on allofus `profiles`.
8. **TURN server:** put a relay in `CONFIG.TURN` (`js/wvm-config.js`) so voice / World Fire peers don't see each other's IP addresses.
9. **Quest headset checklist** in `UX-REPORT.md` (11 steps, about 10 min). Also try 🔥 The World Fire from the Go menu and the 📺 Big Screen (tap for sound).
10. Realtime → Settings: keep **private channels** allowed; turn off public channel access once allofus is confirmed on private channels.
11. Still open from SHIELD.md: Hive credit for selfie scans, NCMEC ESP registration, and a lawyer's review (COPPA approach, age-check flow / BIPA, Prize Hunt as a sweepstakes).
12. After deploy: run Google's Rich Results Test on the six new pages and submit the sitemap in Search Console.
