# World VR Mall · the Shield (shield-2, Oct 25 2026)

**The rule (Zach, Oct 25):** the mall is open to everyone, with no account and no gate at the door. **Live social is 18+ only**, the
same as allofus.one. Seeing live people, hugs, messages, voice, live video, the gathering room and The World Fire are for
signed-in adult allofus.one accounts only. Guests, under-18s, accounts without a date of birth and held or banned accounts explore
the stores, rides, park, lake and games solo. They never see or hear live people, have no voice, no free text and no selfie upload.
Nobody is booted. One account: the shared allofus.one login ("Sign in with allofus") is the mall login.

Both sites share one Supabase project, so the shield **reuses** allofus's safety tables: `member_safety` (private DOB, held / banned),
`reports` + hash-chained `audit_log`, `profiles.blocked`, `media_items` + the Hive `media-scan` function, `mod_evidence`, `safety_settings`.

| File | What |
|---|---|
| `js/wvm-shield.js` | client API (`window.WVM_SHIELD`), link guard, kids safe mode |
| `js/wvm-plus.js` | live layer wired to it (players, hugs, voice, faces, sign-in) |
| `supabase/v31-age-assurance.sql` | **shared** with allofus: age levels, vendor check results, may-be-a-minor holds |
| `supabase/wvm-shield-v40.sql` | mall: realtime gates, `wvm_send`, evidence, rooms, faces, names, prizes, RLS |
| `supabase/functions/age-check/index.ts` | age-check Edge Function: Yoti (primary), Persona (fallback), founder-only test adapter |
| `supabase/test/wvm-shield-test.mjs` | 128 SQL checks (PGlite) over the whole allofus chain + v31 + v40 |
| `terms/`, `about/`, `prize-rules/`, `llms.txt` | public wording that matches exactly what is enforced |

---

## 0 · API (`window.WVM_SHIELD`)

```js
import SHIELD from './wvm-shield.js';   // wvm-plus.js calls initShield({ sb, app, toast, url }) at boot
await SHIELD.ready;
```

**Age levels** (decided by the database, never on the device): `guest` → `adult_self` (allofus account, DOB 18+) → `adult_verified`
(also passed the one-time vendor check). Feature policy: `text` (messages, friends, hugs, rooms) needs `adult_self`. `voice`, `video`
and `fire` need `adult_verified` once a provider is configured, and `adult_self` until then.

| Call | Returns | Notes |
|---|---|---|
| `ageLevel()` | `'guest'\|'adult_self'\|'adult_verified'` | from `wvm_shield_status()` / `safety_age_level()` |
| `can(feature)` / `requires(feature)` | bool / level | feature: `text` `voice` `video` `fire` (aliases: `msg` `friend(s)` `hug` `room` `wave` `emote` → text, `call` `audio` → voice, `camera` → video) |
| `startAgeCheck({ reason })` | Promise<`{ ok, state }`> | `state`: `not_configured` (shows "coming soon"), `redirect` (off to Yoti / Persona), `already`, `cancelled`, `signed_out`, `error`. On return the server re-fetches the result. |
| `status()` | `{ signedIn, uid, band:'adult'\|null, level, can{}, needs{}, provider, dobSet, minor, held, recheck, banned, muted, admin, canUpload, kid }` | |
| `canSee(id)` | bool | needs `adult_self`; false for blocked either way |
| `canTalk(id?, dist?, kind='voice')` (or `canTalk({ id, dist, kind })`) | `{ ok, why, needsCheck }` | kind `text`/`voice`/`video`/`fire`. `needsCheck: true` = `startAgeCheck()` would unlock it. Voice is proximity only (15 m). |
| `canJoinRoom(slug)` | Promise<`{ ok, why, needsCheck, info }`> | asks the server: level, cap, lock, kicked |
| `openRoom(slug, { name, cap, feature })` | room info | creates a room (you host) or takes over an empty one. `feature` = level needed to join. Cap ≤ `wvm_room_cap` (16). |
| `joinRoom(slug)` / `leaveRoom(slug)` | room info + `topic`, `voiceTopic` | 30 s heartbeat; members who stop pinging drop out after 90 s. Room topics `wvm:a:room-<slug>[:voice]` admit current members only. |
| `kick(slug, userId)` / `lockRoom(slug, on)` / `setRoomCap(slug, n)` | `{ ok }` | host (or admin) only. Kicked = out for 24 h, realtime access ends at once, they get `room_kick`. |
| `roomInfo(slug)` | `{ host, i_am_host, locked, cap, count, member, kicked, feature, needs }` | |
| `report({ id, name, kind, context })` | Promise<bool> | reasons: child safety, **may be under 18** (forces a re-check, hides them meanwhile), sexual, harassment, threat, scam, spam, other |
| `block(id)` / `isBlocked(id)` / `mute(id)` / `isMuted(id)` | | block = account-wide, both ways; mute = this device |
| `filterText(s)` | `{ ok, text, hits, why }` | phone numbers (also spelled out), emails, links, @handles, payment asks, off-platform asks, profanity |
| `send(toId, event, payload)` / `on(event, fn)` | server-stamped events | `hug_req hug_ok hug_no wave emote sig msg friend_req friend_ok`; `sig` with `payload.kind:'video'` is checked at the video level. Incoming: `payload.from/name` verified (`v:'srv'`), plus `room_kick` and `change`. |
| `topic(kind, page, extra)` / `channel(topic)` | private channel names | kinds `main pos voice room room_voice inbox`. `null` = do not join. |
| `safeName`, `reservedName`, `safeUrl`, `verifiedStore`, `playerActions`, `rate`, `inbound`, `askDob`, `dobCheck`, `kidMode` | | |

`initMallPlus` exports `ptt(on)` (push-to-talk) for VR controllers.

**Merge rules for the other branches:**
- **social bridge** (`claude/wvm-social-7f3001`): when `window.WVM_SOCIAL` exists, wvm-plus sends no area positions and only shows
  area payloads that pass `WVM_SOCIAL.visible(id)`. This is already in this branch. Its realtime policies are named "wvm social rt
  read/write"; mine are "wvm rt read/write".
- **gathering room**: use `canJoinRoom` → `joinRoom` → join `info.topic` / `info.voiceTopic` as private channels, and call
  `canTalk({ kind: 'video' })` before showing video tiles. Host UI calls `kick` / `lockRoom`.

---

## 1 · What each protection does, and how to test it

Accounts for testing after the SQL is run: **A** and **B** adults (DOB 18+, accounts 3+ days old), **M** an account whose DOB says 16
(created in the SQL editor, since sign-up refuses it), plus a logged-out browser. Open `/?mode=3d`.

1. **Adults-only live social.** Topics are `wvm:a:*` only. `wvm_rt_allowed()` admits adults (`safety_is_adult`); voice topics need
   `safety_can(uid,'voice')`; room topics need current membership. *Test:* A and B see each other; M and the logged-out browser see no
   one, and 🎙️ says live people are for signed-in adults.
2. **Age levels + age check.** `v31`: `safety_age_level()`, `safety_is_adult(uid, level)` (the one-argument gate allofus uses is
   unchanged), `safety_required_level()`, `profiles.age_level` (a public mirror the database sets; members cannot). *Test:* with
   `age_provider = 'none'`, A can talk. Set it to `'test'` with `AGE_TEST_MODE=1` (founder only): voice asks for the check, the check
   passes, and `profiles.age_level` becomes `adult_verified`.
3. **May be a minor.** A report with that reason holds the account (gone from live social on both sites) and sets `age_recheck`.
   Passing the age check releases a hold that exists only for that reason. Anti-griefing: the reporter must be an adult with an account
   72 h+ old, max 3 such reports a day, and an account verified in the last 90 days is only flagged.
4. **Faces.** Upload to `posts/<uid>/wvm-face-*` → `media_items` pending → Hive → only a cleared picture reaches `profiles.avatar.face`
   (`wvm_face_guard` / `wvm_face_media`). Adults with 72 h+ accounts only. Section 6c of v40 strips old unscanned `data:` faces.
5. **Report / block / mute** on every player card (tap, or the VR laser). Server-side evidence snapshot into `mod_evidence`
   (between-them log, 14 days, plus their last 24 h), legal hold for child safety / sexual / threat / may-be-minor.
6. **Anti-harassment.** 1.2 m personal-space bubble, hugs only with consent, server rate limits, auto-mute at 2 reporters / 24 h, hold
   at 3 or one child-safety report, text filter on names, halos and messages.
7. **Anti-scam.** Buy links only to verified tenant domains (others get a "you are leaving" warning; `javascript:` links never run).
   Reserved staff names refused. Prize claims: one per account, email (gmail dot/+ variants), phone and household address; per-IP
   limits; minors and kids safe mode refused.
8. **Kids safe mode (COPPA).** A DOB under 13 typed on a device turns it on until the 13th birthday. It sends nothing; the camera and
   mic are blocked (`getUserMedia` refused), sign-in shows a friendly message, prize claim and bug-report e-mail are off.
   *Test:* in the console, `WVM_SHIELD.dobCheck('2018-06-01')`, then `navigator.mediaDevices.getUserMedia({video:true})` → NotAllowedError.
   Clear it with `localStorage.removeItem('wvm_kid_until')`.
9. **Rooms.** `wvm_rooms`, `wvm_room_members`, plus `open` / `join` / `ping` / `leave` / `kick` / `set`. The cap is enforced on join,
   and kicked or locked-out people are refused on join and in realtime.
10. **RLS audit.** prizes: `claimed_by` hidden. claims / leads: writes only through functions, admin reads. New tables
    (`wvm_events`, `wvm_rate`, `wvm_faces`, `wvm_rooms`, `wvm_room_members`, `age_checks`): RLS on, own or admin read only.
    Audit queries are at the end of v40.

The automated proof is `node supabase/test/wvm-shield-test.mjs "<allofus>/supabase" "<this repo>/supabase"`. Last run: **128 passed,
0 failed**, with v31 and v40 each run twice in either order. It caught one real bug, which is fixed: a NULL from `wvm_pair_ok` let an
adult's hug through to a minor.

---

## 2 · SQL, in run order (Supabase → SQL Editor)

Production already has allofus v26 → v30 (v29, v29b and v30 ran Oct 25) and the prize tables from `worldvrmall-v39.sql`.

1. **`supabase/v31-age-assurance.sql`**: shared. Also copy it into the allofus repo as `supabase/_parts/v31-age-assurance.sql` so
   both repos keep the same numbering. If allofus already has its own v31, rename this one to the next free number; it only needs to
   run after v30.
2. The social bridge's `supabase/wvm-social-v31.sql` (branch `claude/wvm-social-7f3001`), if merged: after the shared v31.
3. **`supabase/wvm-shield-v40.sql`**: the mall. Needs v31. Don't re-run `worldvrmall-v39.sql`: its `submit_lead` clashes with
   allofus's, and v40 carries everything v39 had.

Both files are idempotent. v40 §6c is the only data change: it removes unscanned `data:` selfie faces. allofus faces disappear too
until allofus uploads faces the mall's way.

---

## 3 · What Zach must do

1. **Run the SQL** above (v31, then v40). Until then the live mall stays dark (fail-closed).
2. **Yoti** (account created). The keys go **only** into Supabase Edge Function secrets, never into the site's code:
   1. Yoti Hub → your Age Verification application (start with the **sandbox** one) → copy the **SDK ID** and generate an **API key**.
   2. Supabase dashboard → Edge Functions → **Deploy new function** named `age-check`, paste `supabase/functions/age-check/index.ts`,
      and turn **Verify JWT OFF** (the function checks the member's login itself).
   3. Edge Functions → **Secrets**: `YOTI_SDK_ID`, `YOTI_API_KEY`, `AGE_WEBHOOK_SECRET` (any long random string). If Yoti's sandbox
      gives you a different host, also set `YOTI_BASE`. Supabase already provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   4. SQL Editor:
      ```sql
      update public.safety_settings set value = '"https://izfccjaznlcffvjxawya.supabase.co/functions/v1/age-check"' where key = 'age_check_url';
      update public.safety_settings set value = '"yoti"' where key = 'age_provider';
      ```
      From that moment voice / video / fire need the check. To turn it off again, set `age_provider` back to `"none"`.
   5. Test with your own account in the sandbox. Then switch the secrets to the **live** SDK ID and key, and ask Yoti to enable the
      settings the adapter uses: age estimation (threshold 25, passive liveness) with doc-scan fallback (threshold 18).
   - Persona as a back-up: secrets `PERSONA_API_KEY` + `PERSONA_TEMPLATE_ID` (an inquiry template that requires 18+, selfie and
     government ID), then set `age_provider` to `"persona"`.
   - QA without a vendor: secret `AGE_TEST_MODE=1` and `age_provider = "test"`. It works for the founder account only. Remove it after QA.
3. **A lawyer should confirm** the COPPA approach (kids safe mode, no accounts or collection under 13, no live social under 18), the
   age-check vendor flow (biometric consent and state laws such as Illinois BIPA are handled on Yoti's screen; ask the lawyer to check
   it), and the Prize Hunt as a sweepstakes / no-purchase-necessary promotion. Minors can't claim (refused in the database).
4. **Realtime → Settings:** turn off public channel access once allofus is confirmed working with private channels.
5. **Hive** credit for selfie scans (about $0.003 each). **NCMEC ESP registration** (still open). A **TURN relay** in
   `CONFIG.TURN` so strangers in voice never see each other's IP address.
6. After merging: bump `sw.js` `V` and add `/js/wvm-shield.js` to its precache list.

---

## 4 · Known limits

- Until an age-check provider is on, "adult" means a self-declared DOB (same as allofus today). A lying minor could get an account,
  but would be hidden at once by a may-be-a-minor report, and no minor can ever make another minor's account visible.
- Position packets in the area channel are client-broadcast (not server-stamped). A modified client could draw a ghost avatar using
  another member's id. It cannot hug, talk or message as them, because those are server-stamped.
- Not yet tested end to end with real accounts in 3D or VR: the test browser has no WebGL, and the SQL is not on production. Verified
  so far: 128 SQL checks, module loads, guest-mode API checks and kids-mode camera blocking in a real browser.
- The Yoti adapter is written against Yoti's published Age Verification API (create session, user view, result). The webhook body
  format isn't specified there, so the function treats webhooks only as "go and fetch". Confirm the field names with a sandbox run.
- Store buy buttons in `wvm-store.js` still rely on the global link guard (the code-lockdown branch can switch them to `verifiedStore()`).
