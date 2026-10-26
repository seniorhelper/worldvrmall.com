# World VR Mall launch UX pass, Oct 25 2026

Branch `claude/wvm-ux-e0f426`, service worker **v97**. Not pushed. Bug list: `BUGS-2026-10-25.md`.

Screenshots: `side-session-notes\local_c2fa259f-db19-4d26-abb7-b75df5d89a0c\wvm-ux-shots\` (the shared notes folder; kept out of the repo so they don't get deployed). The file names are listed under each section.

## 1. No flash between pages

**Before.** A 3D page painted the flat text page first, waited up to 1.2 s for an idle slot, covered it with a white "Teleport station · warming up" screen, then the engine's white teleport loader (cartoon machine), then the world. Going to another page from 3D faded to white, and the next page started the whole chain again.
Shots: `before-load-1-flat-page.png` (the first frame of `/` is the flat page), `before-desk-feed.png`, `before-phone-*.png`.

**After.**
- Each 3D page (`/`, `/mall/`, the 16 store pages when opened in 3D) decides flat or 3D in an inline head script, **before the first paint**, using the same rules as `bootShell`. A flat choice on `/` or `/mall/` still goes to `/feed/` before anything draws. A page that will boot 3D paints a dark stage at once (`html.wvm-pre3d`): a navy glow, the WORLD VR MALL wordmark and a hairline progress bar.
- The engine's loader and its page-change fade are restyled (from `wvm-shell.js`, no engine edit) to **the same picture in the same spot**, so you see one dark loading screen from tap to first frame. The white "warming up" overlay is gone, and 3D starts one frame after paint instead of after an idle wait.
- Cross-document **view transitions** (a short root crossfade; the nav keeps its place through `view-transition-name`) on every page, plus **hover prefetch** (speculation rules, never for `?vr=` / `?xrsim=` links), so going between flat pages feels like one app.
- Google Fonts no longer blocks the first paint (preload + swap).
- Service worker: a page that gets no answer from the network within 3 s is served from the cache (when it has one) instead of leaving a blank tab; the fresh copy still lands in the cache.
- A device without WebGL drops the dark stage as soon as the shell runs and shows the flat page (checked by blocking WebGL in headless Edge).

Shots: `before-load-1-flat-page.png` → `after-load-1b-dark-stage.png` (the first state the page reaches, before and after), `after-load-4-world.png` / `home-3-world.png` (the world after the loader), `after-desk-home-content.png` (no-WebGL fallback). Polling the page state every 150 ms from navigation to first frame: before = flat page → white overlay → white loader → world; after = dark stage → world. No other state was seen.

## 2. Navigation shared with allofus.one

`js/wvm-rail.js` was rewritten on the same `mountRail()` call every page already makes, so all 30 pages and the 3D HUD get it:
- **Wide screens:** the **Feed — 3D — VR** switch built like allofus.one's (coloured square tiles joined by a glowing line), Directory, items registered by other modules, **More**, and the **allofus.one** jump (their real emblem).
- **The allofus.one jump keeps your mode and sign-in:** from the feed you land on allofus.one's feed, from 3D in its 3D world, from VR in its VR (session carried in `#aou_sso=` as before). The "Back to allofus.one" chip uses the same jump.
- **More sheet:** Directory, the island, inside the mall, guided tour, get your store, about, report a bug (it carries the page you came from), registered items, and the three allofus.one destinations.
- **Phones:** one five-slot bottom bar (Feed · 3D · VR · More · allofus), like allofus.one's tab bar; registered items live in More and their badges add up on it.
- **VR on a phone** explains where VR runs ("Walk in · 3D" / "Copy link") instead of starting Google Cardboard (see bug #1).
- **`WVM_NAV.register(item)`** for other modules (the social bridge). The full API is in the notes folder (`NAV-API.md`): `id, label, icon, href|onClick, badge, where: 'bar'|'more', order, sub, vr`. `vr: true` items also appear in the VR menu. There's a pre-load queue: `window.WVM_NAV_Q.push(item)`.
- The feed page's header is now allofus-style (dark bar over the light page, the logo on its own white plate per the logo rule).

Shots: `navA-desk-feed.png`, `navB-desk-feed.png`, `navB-desk-stores_aging_safely_baths.png`, `navA-phone-about.png`, `after-phone-more.png`, `after-desk-more.png`, `after-phone-vrnote.png`, `aou-desk-flat.png` / `aou-phone-.png` (allofus.one for comparison).

## 3. Icons and shapes

- `js/wvm-icons.js`: the whole set (187 glyphs) is drawn **sharp**: mitered joins, square ends, no rounded rectangles. The glyphs you see most (feed, 3D cube, VR visor, directory, globe, search, walk, view, character, radio, map, full screen, list, bag, coin, help, close, turbo, key, lock, cart, chat, mall, island, heart, coaster, star, menu, bell, bug, send) are redrawn as faceted shapes with **one cyan accent stroke**. VR canvas buttons use the same SVGs.
- Emoji with no house icon are **dropped from buttons, links, headings and menus** (desktop, phone and the VR menu) instead of showing the system's cartoon glyph. Text people wrote, and in-world signs, are untouched.
- Feed store-card corners: a flag emoji becomes a chamfered country badge ("US"); other emoji are dropped.
- **No pills:** squared corners on buttons, chips, cards, HUD buttons, popups, the dock, the prize banner and the VR door; chamfered corners on the nav and sheets. VR panels and menu rows went from 40-70 px rounded ends to 10 px.

Shots: `icons-after.png` (the whole set on one sheet), `home-3-world.png` (HUD).

## 4. VR (Quest 3 / WebXR)

Tested with the `?xrsim=1` simulator in headless Edge with software WebGL (SwiftShader), driving `app._xrSim` by hand. Fixes:
- **Close and More ▶ were unreachable:** the floating MENU button hangs between the right hand and the menu's bottom-right corner, so the beam hit MENU, which toggles the menu. An open menu / popup / panel now takes the beam first (`castPanels` in `wvm-xr.js`).
- Hidden hand-held buttons (MENU, floor pad) were still ray-tested, because three.js raycasting ignores `visible`. Only visible ones are tested now.
- VR menu emoji with no icon are dropped; panels are squared.
- Phones / tablets: Enter VR (Cardboard) is hidden; a `?vr=1` link opened on a phone explains instead of showing the door. Headsets are detected by UA (Quest, Pico, Wolvic, "VR", "XR", Vision Pro, Galaxy XR).
- The nav's Feed/3D/VR tile follows the headset on and off.

**Results (laser sweep: for every button on every tab, aim the laser at it, check the beam lands on it, pull the trigger, check the action ran):**

| Island page `/?xrsim=1` | rows | laser on it | fired |
|---|---|---|---|
| Go | 14 | 14 | 14 |
| Guide | 20 | 20 | 20 |
| The other side (allofus.one) | 23 | 23 | 23 |
| Worlds (2 pages) | 32 | 32 | 32 |
| Me | 26 | 22 of 23 tested* | 22 |
| Help | 11 | 8 of 8 tested | 8 |

\* Exit VR, Report a bug and Replay the arrival are tested separately or skipped on purpose. The one Me miss was "Body check" right after "View" switched to Follow cam, while the camera was still moving. Re-tested in Follow cam: every row, Body check included, takes the laser.

Before the fix the same sweep missed exactly one button per tab: Close or More ▶, the bottom-right slot.

Also on the island: Y opens the menu ✔ · both controllers connect ✔ · teleport to the ground 5 m ✔ · left stick walks (15.7 m in 25 frames) ✔ · right stick turns ✔ · wrist button in the scene ✔ · coaster: the ride picker popup appears in VR, the laser picks "Full Send" and the ride starts ✔ · a popup's buttons take the laser and fire ✔ · a `WVM_NAV.register({vr:true})` row shows in the VR menu and fires ✔ · Exit VR row ends the session ✔ · 0 page errors.

| Mall page `/mall/?xrsim=1` | rows | laser on it | fired |
|---|---|---|---|
| Go | 15 | 15 | 15 |
| Guide | 18 | 18 | 18 |
| The other side (allofus.one) | 23 | 23 | 23 |
| Worlds (2 pages) | 32 | 32 | 32 |
| Me | 25 | 22 of 22 tested | 22 |
| Help | 11 | 8 of 8 tested | 8 |

Also on the mall: Y opens the menu ✔ · teleport 6.7 m ✔ · stick walk 12 m ✔ · turn ✔ · popup buttons take the laser ✔ · `WVM_NAV` VR row ✔ · Exit VR ✔. "Ride the coaster" on the mall correctly hops to the island (`/?ride=chiller`).

**Bug found and fixed on the mall:** the Guide tab passed the *island's* tour to every page. On `/mall/` its first stop (The Chiller) is only a link to the island, with no position, and starting the tour set your position to **NaN**. From then on the laser, the sticks and teleport were dead until you left VR. Before the fix the mall sweep got 1 of 10 Guide rows and nothing after it. Now link-only places take the normal page hop, the tour skips stops that aren't on this map, and the mall builds its own tour from its groups.

One error is still logged on the mall: `Cannot read properties of undefined (reading 'isReady')` from three.js's `compileAsync` (a material lost its shader program while the VR prepare step was compiling). It's thrown inside three's own timer, so it can't be caught there; the layer's 6 s race lets VR start anyway. It will show up as `errs: 1` in VR bug reports and is harmless.

## 5. Phones, first impression

- On phones the prize-hunt banner used to stack on top of the welcome card. It now waits until the card is closed, and it's one column on phones so the text gets the full width.
- The phone bottom bar reserves its height (`env(safe-area-inset-bottom)` included), so content doesn't jump under it.
- Shots: `after-phone-mall3d.png`, `after-phone-mall3d-b.png`.

Search Console "Duplicate unique property": fixed (`/about/`, `/mall/`); every page's JSON-LD now parses with no duplicate keys.

## Headset checklist for Zach (Quest 3, about 10 minutes)

Open `worldvrmall.com/?vr=1&vrdebug=1` after this branch is live.
1. **Loading:** from the 2D page, tap the nav's VR tile. You should see only the dark WORLD VR MALL screen, then the door, never a white or flat flash.
2. **Mall Guide tour:** inside the mall (`/mall/?vr=1`), Menu → Guide → Start the guided tour. You move to the first stop and the laser still works afterwards. *(It used to break the session.)*
3. **Menu:** press Y. Point at **Close** (bottom-right) and pull the trigger: the menu closes. Open the Worlds tab and use **More ▶**: it pages instead of closing the menu. *(This was broken; the fix is verified only in the simulator.)*
4. **Laser:** sweep the beam across a few menu rows. Each one lights up under the beam; nothing behind the menu reacts.
5. **The floating MENU button** (bottom right of your view, when it's showing) still opens the menu when the menu is closed.
6. **Teleport and walking:** point at the ground and pull the trigger (you hop there); left stick walks; right stick turns.
7. **A ride:** Go tab → Ride the coaster → pick a mode → it rides; B or the menu gets you off.
8. **Crossing:** Menu → All of Us → any spot. VR pauses, one tap, and you're in allofus.one VR, signed in. Then come back.
9. **Exit:** Help → Exit VR. You're back on the 2D page and the nav shows 3D again.
10. **Comfort / frame rate:** only a headset can tell. If anything drops, press B; the report email now carries `sess`, `longFrames` and `ctxLost`.
11. **Phone:** on an Android phone, tap VR in the nav. You should get the "VR runs in a headset browser" note, not a split-screen.

## Not done / for the QA session

- **allofus.one** needs the same Cardboard guard and the `castPanels` laser fix in `js/aou-xr.js` (the shared layer). This branch changed only the mall copy, so the two layers now differ in those two places; re-sync when allofus is next touched.
- `?v=59` cache-busting on module URLs was left alone: other sessions share those URLs, so bumping them here would cause merge conflicts. The service worker bump (v97) clears the caches.
- **Headless timings aren't phone timings.** Software WebGL needs 30-90 s to reach the first frame, so the speed claims here are about order (what paints first), not seconds. Run Lighthouse on the deployed site once.
- The Supabase `bugs` table can't be read with the public key (see the bug file).
- Feed / store pages: the store emoji in `data/stores.json` still show inside the 3D world signs (in-world content, left as is).
