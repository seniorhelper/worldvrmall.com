# Content pass: SEO pages, sound, Orbit's voice, video screens (Oct 25 2026)

Branch `claude/wvm-content-ada6e1`. Not pushed. Everything below is committed on this branch.

## Zach: what you need to do (about 10 minutes)

1. **Copy the ElevenLabs key.** I created a restricted key named `worldvrmall-orbit-proxy` in your ElevenLabs dashboard (Developers → API Keys). It can only use **Text to Speech** and **Speech to Text**, with a limit of **100,000 credits per refresh period**. The dialog showing the key was left open in your Chrome. I did not read it, copy it, or store it anywhere. If that dialog is gone, delete the key and create a new one with the same settings, because ElevenLabs only shows a key once.
2. **Store it as a Supabase secret.** Supabase dashboard → project `izfccjaznlcffvjxawya` → Edge Functions → **Secrets** → Add secret: name `ELEVENLABS_API_KEY`, value = the key. Never put the key in `js/` or anywhere else in the repo.
   - Or from a terminal with the Supabase CLI: `supabase secrets set ELEVENLABS_API_KEY=<paste> --project-ref izfccjaznlcffvjxawya`
3. **Run the SQL.** In the Supabase SQL editor, run `supabase/wvm-orbit-voice.sql`. It adds the rate-limit counter. It needs `public.safety_is_adult(uid)`, which allofus already has.
4. **Deploy the function.** Either:
   - CLI: `supabase functions deploy orbit-voice --project-ref izfccjaznlcffvjxawya` from the repo root, or
   - Dashboard: Edge Functions → Deploy a new function → name it `orbit-voice` → paste `supabase/functions/orbit-voice/index.ts` → Deploy. Keep "Verify JWT" on.
5. **Optional:** the voice is ElevenLabs "Liam" (the same voice as the mall promo video). The function's default voice ID is `TX3LPaxmHKxFdv7VOQHJ`. If that turns out not to be Liam, set a secret `ORBIT_VOICE_ID` with the ID from Voices → Liam → copy voice ID.
6. **ElevenLabs setting worth knowing:** the Sound Effects page says "Generations may be shared to Explore page for other users to download", and gives a Disable link. I left your setting as it was.

Until steps 2 to 4 are done, everything still works except **🎙️ Ask out loud**. Orbit's topic answers play from static files and need no key.

## 1. SEO landing pages + press kit

| URL | Target term | Notes |
|---|---|---|
| `/virtual-shopping-mall/` | virtual shopping mall | what the mall is, the 15 real stores, how to visit, video |
| `/vr-shopping-mall/` | VR shopping mall | WebXR in the headset browser, controls table, comfort, an honest note on VR shopping |
| `/3d-virtual-mall/` | 3D virtual mall | phones/laptops, the layout, flat fallbacks |
| `/metaverse-mall/` | metaverse mall | what we kept vs dropped (no crypto, wallets or land sales) |
| `/virtual-store-for-small-business/` | virtual store for small business | plans and prices (same as /lease/), setup steps, who it suits and who it doesn't |
| `/press/` | (press kit) | boilerplate, fact sheet, screenshots, video download, logos, story angles |

- **Screenshots** in `images/shots/` are real frames of the live engine at night, taken from the promo-video capture: aerial, wing, store, coaster, portal, wheel. Each is a 1280×720 WebP of 37 to 110 KB, plus two 1200×630 JPGs for og:image.
- **JSON-LD on every page:** WebPage, Organization (`#org`, with address and phone), WebSite (`#site`), BreadcrumbList and FAQPage. Pages that need more also get a Service with two Offers ($99 and $199, matching /lease/) on the small-business page, and a VideoObject on /press/. There is no Store, Product or ShoppingCenter markup: the mall has no physical address and sells nothing itself, so that markup would not be true.
- **Honesty:** no visitor numbers, no conversion stats, no reviews. Storefronts marked "available" are described as samples. The press page says plainly that we don't publish visitor counts yet. Safety claims are left to wvm-shield; these pages make none beyond "live features follow the mall's safety rules".
- `sitemap.xml`: 6 new URLs with image entries. `llms.txt`: 6 new lines under "## Pages" (I didn't touch the Key facts or safety sections).
- **No existing page shells were edited.** New pages reuse the About page's header and styles and mount the rail with `mountRail({ page: "flat" })`.

**Shell changes I'd like QA to make (I didn't make them):**
- Add links to the new pages in the footer of `/about/` and `/lease/` (for example "Press · Virtual store for small business"). Right now only the new pages link to each other, plus the sitemap.
- Optionally register `/press/` in WVM_NAV's More sheet.

## 2. Sound (ElevenLabs Sound Effects + Music)

All files are mono 44.1 kHz MP3s encoded with lamejs. Loops were normalized and the music was crossfade-looped. They live in `/audio/`:

| File | Size | Length | What | Where it plays |
|---|---|---|---|---|
| `world-fire-crackle.mp3` | 205 KB | 30 s loop | campfire crackle | **for wvm-gathering** (World Fire), loaded from `/audio/world-fire-crackle.mp3` |
| `mall-ambience.mp3` | 147 KB | 30 s loop | soft atrium murmur | mall page, a quiet bed indoors (paused on rides) |
| `fountain.mp3` | 117 KB | 20 s loop | fountain splash | spatial: the World Fountain (mall atrium, 0,0) and the Wishing Fountain (outside plaza, -26,100) |
| `lobby-music.mp3` | 438 KB | 56 s loop | retro-futuristic lounge, instrumental | spatial between the Grand Lobby and the Atrium (2,7,70), fades out by 85 m |
| `coaster-music.mp3` | 446 KB | 57 s loop | driving synthwave, instrumental | any ride that goes over 12 m/s (= a coaster) |
| `coaster-clack.mp3` | 88 KB | 15 s loop | lift-chain clack | on a ride, during a slow, steady climb that also moves forward (a lift hill) |
| `coaster-whoosh.mp3` | 24 KB | 3 s | train rushing past | on a coaster, at most every 5 s, above 17 m/s |
| `store-chime.mp3` | 24 KB | 3 s | shop door ding-dong | spatial at a store door, when you step within ~2 m (once per store per 30 s) |
| `orbit-*.mp3` (10 files) | 31 to 70 KB | 5 to 12 s | Orbit's lines, voice "Liam" | see section 3 |

Total: about 2.0 MB. Nothing loads until it is needed and the visitor has tapped or pressed a key.

**Gapless loops.** The MP3 decoder adds about 1,524 samples of padding at the start. `wvm-media.js` plays each loop over `[skip, skip + n]`, using the exact sample counts from encoding. **For wvm-gathering:** set your `AudioBufferSourceNode`'s `loopStart = 1524/44100` and `loopEnd = loopStart + 1322999/44100`. Otherwise you'll hear a ~60 ms gap each lap. It is barely audible under fire noise.

**Global sound toggle (`js/wvm-media.js`).**
- `window.WVM_SOUND = { on, set(on), toggle(), onChange(fn), context(), play(name, { at, vol }) }`, plus a `wvm-sound` window event with `{ detail: { on } }`.
- The setting persists in `localStorage.wvm_sound`.
- **Autoplay:** nothing plays before the first pointerdown, keydown, touchend, or entering VR. The AudioContext is suspended while the tab is hidden.
- If `WVM_NAV` exists (the wvm-ux branch), the toggle registers as nav item `sound` (bar, order 90, `vr: true` so it's also a row in the VR menu). Otherwise a small 44 px round button appears at the bottom left.
- **Ducking:** music goes silent and ambience drops while the YouTube radio panel is open. Both dip while Orbit talks or a screen has sound.
- At most 8 spatial sources are alive at once (HRTF panning, linear fade to silence at maxDistance).
- **Other branches:** wvm-gathering's crackle and the engine's own synth beeps (train cord, musical tile) don't follow WVM_SOUND yet. They can check `window.WVM_SOUND?.on` or listen for `wvm-sound`.

**Sources and licence.** All sounds and music were generated on 2026-10-25 in Zach's ElevenLabs account (Pro plan, which includes a commercial licence) with ElevenLabs Sound Effects (SFX v3) and ElevenLabs Music (v2.5, instrumental). The Orbit lines come from ElevenLabs Text to Speech (Eleven v3, voice "Liam"). Each prompt asked for no voices or vocals. The music generation history shows the tracks as "Mall Lounge Loop" (used), "Mall Atrium Lounge" (spare), "Roller Coaster Rise" (used) and "Coaster Run" (spare). Credits used: about 4,000 of 606,802.

## 3. Orbit's voice + the voice box

- **Topic answers out loud, for everyone.** The Orbit popup (`js/wvm-orbit3d.js`) now speaks Join, The mall, VR controls, Rides, and the new "🏬 Rent a store" button from `/audio/orbit-*.mp3`. He says a greeting the first time you open him. No API is called.
- **🎙️ Ask out loud** (`js/wvm-orbit-voice.js`) is for **signed-in adults only**: `WVM_SHIELD.ageLevel() !== 'guest'` on the client, and `safety_is_adult(uid)` on the server.
  - Push-to-talk, at most 7 seconds. The mic opens only while the "Orbit is listening" card is up and is closed straight after.
  - No recording of anyone else, ever, and nothing for guests or under-18s: they hear "Talking to me with your voice is for signed-in adults…" and can still tap topics.
- **Server** (`supabase/functions/orbit-voice/index.ts`):
  1. Checks the JWT, then that the user is an adult, then the rate limits.
  2. Runs ElevenLabs speech-to-text (Scribe).
  3. Picks one of Orbit's **fixed** answers by keyword, or a store-location answer for the 14 open storefronts in the mall. It never repeats the visitor's words and never free-generates text.
  4. A fixed answer returns `{ line }`, and the browser plays the static MP3. A store answer gets ElevenLabs TTS (flash v2.5, 22 kHz, 32 kbps, cached in memory) and `{ place }`, so Orbit walks you there.
  - Audio and transcripts are not stored or logged. Uploads are limited to `audio/*` up to 600 KB. CORS allows worldvrmall.com, allofus.one and localhost.
- **Rate limits** (`supabase/wvm-orbit-voice.sql`): 4 a minute and 40 a day per person, 2,000 a day for the whole mall, on top of the 100k-credit cap on the key itself.
- **Voice box** (`js/wvm-voicebox.js`): a small neon panel of mirrored LED-segment bars, cyan to magenta, tallest in the middle, with white peak caps. They pulse to the voice's speech bands through an AnalyserNode. When idle it shows three slow-breathing dots. It's inspired by 80s talking-dashboard displays, with no show names and no car styling. `makeVoiceBox()` is reusable: Orbit has one (it shows under him while he talks or listens), and each video screen gets one while its sound is on.

## 4. Video screens

- **Re-encodes** in `media/video/`, H.264 Main@3.1, 1280×720, 30 fps, ~650 kbps, mono AAC 96 kbps, faststart (moov at the front):
  - `wvm-promo-720.mp4`: 3.8 MB, 39.7 s, from "6 World VR Mall - HORIZONTAL"
  - `allofus-promo-720.mp4`: 3.9 MB, 40.9 s, from "5 allofus.one ANCHOR - HORIZONTAL"
  - Posters `*-poster.jpg`: 21 KB and 34 KB
  - These were made with Chrome WebCodecs and mp4-muxer, because this PC has no ffmpeg. The transcoder is outside the repo, in `%TEMP%\wvmc\tc.html`.
- **Screens** (in `js/wvm-media.js`; all built 5 s after load in an idle callback, so they never touch the first frame):
  - **Mall, the Big Screen** under the atrium dome, over the Asia wing corridor (0, 8.4, -31), 14 m wide, plays the World VR Mall film. Registered as place **`promo-screen`** ("📺 The Big Screen · World VR Mall in 40 seconds", category Fun). It registers about 5 s after load, so a `?to=promo-screen` deep link would arrive too early and does not work yet.
  - **Mall, Food Court** (100, 7.5, -82), 10 m, plays the allofus film.
  - **Outside, west lawn** by the Wishing Fountain (-58, 8.5, 104), facing the plaza, 12 m, plays the World VR Mall film.
- **How a screen behaves:**
  - It shows the poster until you are within 45 m. Then the video loads and plays **muted on loop**. Past 65 m, or when the tab is hidden, it stops and releases the decoder.
  - **Tap or laser the screen for sound.** That restarts the film from the beginning, with spatial sound and a voice box under the screen. Tap again to mute. Only one screen has sound at a time.
  - In VR the screens are ordinary hotspots, so the laser works. They don't use `wvm-screen.js` (that system is for canvas UIs).
- **The landing pages and /press/** embed the World VR Mall video with `preload="none"` and a poster.

## Files

- New:
  - `js/wvm-media.js`, `js/wvm-voicebox.js`, `js/wvm-orbit-voice.js`
  - `audio/*` (18 files)
  - `media/video/*` (4 files)
  - `images/shots/*` (8 files)
  - 6 page folders
  - `supabase/functions/orbit-voice/index.ts`, `supabase/wvm-orbit-voice.sql`
- Edited:
  - `js/wvm-orbit3d.js`: the popup speaks and has two new buttons. Two lazy imports at the end of `spawnOrbit` load the voice and `wvm-media.js`. No shell or engine edits were needed, because the shell already loads Orbit on both 3D pages.
  - `sitemap.xml`, `llms.txt`

## For final QA / merge

- **sw.js:** add `js/wvm-media.js`, `js/wvm-voicebox.js` and `js/wvm-orbit-voice.js` to PRECACHE_CODE, then bump V together with the other branches. Don't precache `/audio/` or `/media/`; let them load on demand.
- **Lockdown build:** my files have no `console` calls and no keys. The new modules import `three` and `./wvm-config.js` like their neighbours.
- **CSP (`tools/build.mjs`):**
  - `connect-src` must allow `https://izfccjaznlcffvjxawya.supabase.co` (for `/functions/v1/orbit-voice`); it likely already does.
  - `media-src` needs `'self' blob:`.
  - The landing pages load Google Fonts the same way About does.
- **Merge overlap:** `wvm-orbit3d.js` is only edited on this branch, as far as I know.
- **Store chime** relies on places whose `cat` contains "Store" (41 in the mall, including World Village and Main Street).

## How to test

1. Serve the repo root (any static server) and open `/mall/?mode=3d`. Tap once.
   - You should hear the lobby music and the atrium murmur, and the fountain as you near the dome.
   - The speaker button sits bottom-left (or a "Sound on" item if the wvm-ux nav is merged).
2. Places → "📺 The Big Screen". The film plays silently. Click the screen: sound, plus bars under the screen. Click again: muted.
3. Walk up to a storefront door: you hear a chime.
4. Click Orbit → "The mall": the toast appears, he speaks, and the neon box under him lights up.
   - "🎙️ Ask out loud" while signed out: he explains it's for signed-in adults.
   - Signed in as an adult (after Zach's steps 1 to 4): ask "where is Showers4Less?". He answers out loud and walks you there.
5. Outside: ride The Chiller. Expect the clack on the lift, the coaster track once it's fast, and whooshes on the drops.
6. Open the six new pages. Check the JSON-LD with Google's Rich Results Test after deploy.

**What I verified** (headless Chrome, software WebGL):
- Both pages build the screens, the place entry, WVM_SOUND and WVM_ORBIT_VOICE with no errors.
- The Big Screen plays video.
- Tap-for-sound unmutes, shows the voice box and mutes again.
- Orbit's line plays and lights his voice box.
- A synthetic coaster ride fetched and started the coaster music, clack and whoosh.
- The landing pages render and their JSON-LD parses.

**What I could not verify:**
- Listening to the generated audio myself (I picked the variants by loop-seam and level analysis). Have a listen.
- A real Quest session.
- The deployed edge function: it needs the secret and a deploy. Its code was not executed.
- The exact Liam voice ID (see step 5).
