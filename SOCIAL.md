# World VR Mall · social layer (v1, Oct 25 2026)

Your allofus.one people, inside the mall. You see who is here and where, can join them, message them (flat and VR), send connect requests, and hop to allofus.one and back to the same spot.

## The rules

**18+ only (Zach, Oct 25).** All live social in the mall is for verified-adult allofus accounts. Guests and under-18s browse solo: no live people, no messaging, no plaza.

| | Who | Enforced by |
|---|---|---|
| **See** someone in the mall (avatar, spot, live position) | Your allofus **connections** and **Circle** people (you're in a Circle they own, or they're in one of yours). Strangers are **hidden by default**. **Public plaza** (opt-in): other verified adults who also turned the plaza on. Both sides must opt in. | `wvm_can_see()` in SQL: both confirmed adults, neither blocked the other, and one of the three relations. Then `WVM_SHIELD.canSee()`. |
| **Message** someone | Connections only. Circle and plaza people get "🤝 Connect" instead. | allofus `messages` policies (connected + adults both sides + not blocked), then `WVM_SHIELD.canTalk()` + `filterText()`. |
| **Connect** | Anyone you can see. The request is `pending` until **they** accept. If they already asked you, tapping Connect accepts theirs. | allofus `connections` policies (adults both sides, not blocked). The opt-in consent guard (see below) makes "only the other person can accept" server-side. |
| **Text** | Words only. Links, emails, `www.`, `data:`, markdown images and HTML are refused on send; links in received messages show as "🔗 (link hidden)". There are no images or uploads at all. | `wvm-social.js` (`hasLink`/`hideLinks`) + `WVM_SHIELD.filterText()` (it also masks phone numbers, handles and the like). |
| **Minors** | allofus is 18+ only. In the social layer a minor (or anyone without a confirmed DOB) sees no one and can't be messaged or connected. "Minors only with minors" can't arise. | `safety_is_adult()` on both sides everywhere. |

Live positions travel on **private Realtime topics** `wvm-u:<user id>`. Only you can broadcast on yours, and only people `wvm_can_see()` allows can subscribe. The old public `mpos-*` position channel is no longer sent on: when `window.WVM_SOCIAL` exists, `wvm-plus.js` skips it and ignores anyone the social layer doesn't list. Hugs from hidden people are dropped, and their voices are set to volume 0.

**Why `messages` and not `hub_messages`.** In allofus, `hub_messages` is the public **Rooms** chat (`/chat/`): every row is readable by everyone and keyed by room name. Private person-to-person messages are `public.messages`, the table allofus's own Messages page and Comm Hub use (`aou-dm.js`, `aou-comm.js`). Putting DMs there keeps one conversation across both sites and inherits allofus's adults-only and not-blocked policies.

**Presence API for other mall layers** (The World Fire etc.): `WVM_SOCIAL.presence()`, `onPresence(cb)`, `joinUser(id)`, `myPeople()`, `here()`, `send(id, text)`. They're documented in the session notes as `SOCIAL-API.md` (folder local_3054921b-…).

## Files

| File | What |
|---|---|
| `js/wvm-social.js` (new) | The layer. Exposes `window.WVM_SOCIAL` (`open`, `openVR`, `visible`, `connect`, `send`, `join`, `goAllofus`, `handoffUrl`, `setPlaza`, `decorateCard`, `state`) and `registerMenuEntry()` (writes `window.WVM_MENU_EXTRA`). |
| `js/wvm-plus.js` | Small hooks: boots the layer; 👥 **People** dock button (red badge = unread + requests); the 🌍 AllOfUs dock button uses the hand-off; player card gets 💬 Message / 🤝 Connect; public position send off and receive gated; hugs and voice gated. |
| `supabase/wvm-social-v31.sql` (new) | **Run this.** `wvm_presence`, `wvm_can_see`, `wvm_people`, `wvm_my_people`, `wvm_social_me`, Realtime policies `"wvm social rt read/write"`. |
| `supabase/wvm-social-consent-guard.sql` (new) | **Proposed for allofus, not in the run order.** See `ALLOFUS-SIDE.md` §4. |
| `ALLOFUS-SIDE.md` (new) | What allofus.one must add: the "Back to the mall" chip, "Join them in the mall", "Reply in the mall", the consent guard. |
| `sw.js` | `V` → `v97`; `wvm-social.js` precached. |

## SQL, in run order

Supabase → SQL Editor, same project as allofus.one (`izfccjaznlcffvjxawya`):

1. *(already on production)* allofus through **v30** (v26–v27 ran Oct 23, v29/v30 ran Oct 25). Mall SQL uses allofus numbering and runs **after v30**, which is why the file is named v31. The mall layer needs only the v26/v27 objects: The mall layer needs `safety_is_adult`, `safety_blocked`, `safety_connected`, `is_admin`, `circles`/`circle_members` and `presence`.
2. *(shield branch, if merged)* `supabase/wvm-shield-v40.sql`. Order relative to step 3 doesn't matter: object and policy names don't overlap. Both were checked; the policy names were made distinct on purpose.
3. **`supabase/wvm-social-v31.sql`**. It's idempotent, so running it twice is fine.
4. *(later, by the allofus owner)* `supabase/wvm-social-consent-guard.sql`.

Dashboard: Realtime → Settings → **Private channels** must be allowed. allofus v27 already uses private channels, so it should be on. Until step 3 has run, the mall shows "People in the mall is switching on soon" and draws **no** live players, because strangers stay hidden.

**Tested** in PGlite (Postgres 16) against allofus's real policies and helpers. Ran the file twice, then 47 behaviour checks, all passing: who sees whom (connection, circle, plaza both or one side, minor, blocker), raw `wvm_presence` reads, writes to someone else's row, topic read and write rights, no widening of allofus topics, the unread count, DMs to strangers and blockers refused, and the consent guard. The test kit (`test.mjs`, `aou-fixture.sql`) is in the session notes folder under `wvm-social-qa/`.

## How to test: flat (phone or laptop)

You need two accounts that are allofus **connections**, both with a DOB set (18+). Use two browsers, or one normal and one private window.

1. Open `https://worldvrmall.com/mall/?mode=3d` in both and sign in (or arrive from allofus already signed in).
2. **See:** within about 15 s each of you sees the other walking. Tap the 👥 **People** dock button: "Here now" lists them with "Connection · <nearest place> · inside the mall".
3. **Join:** walk far away, then tap **Join them**. You teleport next to them, facing them. With one person on the island (`/`) and one in the mall, Join loads the other page and lands you next to them (`?with=`).
4. **Message:** tap 💬, send "hi". The other side gets a toast "💬 <name>: hi" and a red badge on 👥. Try `www.example.com` (refused: "Words only"). Try a quick reply. Open the same thread on allofus.one: the messages are there.
5. **Strangers hidden:** sign a third adult account in with no connection. Neither side sees the other. Turn **Public plaza** on in both People panels: within about 15 s they appear under "Plaza". Turn it off on one side: they vanish within about 15 s.
6. **Connect:** with the plaza on, tap a plaza person's avatar → "🤝 Connect on allofus" (or Connect in the People list). The other person sees it under 🤝 **Requests**, and Accept makes you connections (on allofus too).
7. **Hand-off:** tap 🌍 **Go to allofus.one** (People panel footer or the dock). The address bar shows `?from=mall&back=/mall/?mode=3d&at=x,z,floor`. Once allofus adds the chip (`ALLOFUS-SIDE.md` §1), tapping it lands you back on the same spot ("Back where you were in the mall"). Today you can test the return by opening that `back` path by hand.
8. **Blocks:** block the other account on allofus (or with 🛡️ when the shield is merged). Within about 15 s they disappear and can't message you.

## How to test: Meta Quest (Quest Browser)

1. Do the flat steps 1–2 on a laptop with account A. On the Quest, open `https://worldvrmall.com/mall/?vr=1`, sign in on the flat page first (the headset has no keyboard in VR), then tap the door into VR.
2. **Opening the People panel in VR:** the VR menu doesn't list it yet (see "Menu entry" below). For now:
   - point the laser at A's avatar and pull the trigger → the player popup → **💬 Message**. This opens the floating panel straight into the chat.
   - or wait for A to message you: a small "💬 A: … · tap" card floats in view for 10 s; tap it.
3. The panel floats about 1.25 m in front of you. Every button is a laser tap (trigger down and up on the same button): tabs (Here / Messages / Requests), **Join**, **💬 Chat**, **🤝 Connect**, **Accept / Not now**, **🔒 Plaza: off / 🌐 ON**, **🌍 Go to allofus.one**, ✕.
4. **Chat in VR:** eight quick replies (👋 Hi!, 📍 Come find me, 👍 On my way…). **🎤 Speak a message** appears only if the browser has speech recognition. It then shows "Send: '…'" with ✅ Send / ✕ Cancel, so nothing is sent unheard. Quest Browser may not have it; Chrome and Edge on desktop do. No text field ever takes focus in VR, so the system keyboard never opens.
5. **Join in VR:** Join on the same page teleports (fade). On another page it leaves VR cleanly and the next page offers "Tap once · back into VR" (the engine's `app.go`).
6. Taking the headset off closes the panel.

## Notes for the QA merge

- **Shield (`claude/wvm-shield-30fba1`).** `wvm-social.js` calls `WVM_SHIELD.canSee(id)`, `canTalk(id)` (shows its `why`), `filterText(s)` (refuses on `ok:false`, sends `text`), and `playerActions(id, name)` (🛡️ buttons in People rows, chats and the VR chat header). Without the shield it falls back to the server rules alone. If the shield throws, the answer is no.
- **Positions: one rule to keep when merging `wvm-plus.js`.** The shield's `topic('pos', page, area)` is an *adult-band-wide* area topic. Every confirmed adult can subscribe, strangers included. With the social layer present, positions must go **only** to `wvm-u:<id>`. So keep `|| window.WVM_SOCIAL` in the area-send guard, and the `WVM_SOCIAL.visible()` check on area receive, whichever channel names the shield puts there. The shield's main / voice / inbox topics are unaffected.
- **Menu entry (UX session).** The VR menu and the rail are not touched. `wvm-social.js` registers two entries in `window.WVM_MENU_EXTRA` and fires a `wvm-menu-extra` event: `{ id: 'people', icon: '👥', label: 'People & messages', fn, badge() }` and `{ id: 'allofus', icon: '🌍', label: 'Go to allofus.one', fn }`. To show them, `wvm-xr.js` `meRows()` (or the Guide tab) can append `(window.WVM_MENU_EXTRA || []).map(e => [e.icon + ' ' + e.label + (e.badge && e.badge() ? ' (' + e.badge() + ')' : ''), () => { menu.visible = false; e.fn(); }, 0x38f0ff])`. `fn()` opens the floating panel when presenting.
- **sw.js** `V = 'v97'`. Other branches may bump too; keep the highest and add one.
- **Voice is a follow-up.** Inbound voices of hidden people are muted (volume 0), but the voice room is still per page and age band, so a stranger in the same room can hear you. The shield's private `:voice` topic plus a per-person allow list (`visible()`) is the proper fix.
- **Realtime join check timing.** Realtime checks the topic policy when a channel joins. The layer re-reads `wvm_people` every 15 s and leaves channels for anyone who dropped off the list (a block, plaza off). So a block takes effect within about 15 s, not instantly.
