# The World Fire

A gathering place inside World VR Mall: a round hall under a night-sky dome, full of identical fire circles. People from anywhere sit around a fire, on a phone, a laptop or a VR headset, with live video and voice like a small Zoom call. Branch `claude/wvm-gathering-a7fae8` (gather-1, Oct 25 2026).

## Files

| File | What it does |
|---|---|
| `js/wvm-gather.js` | The hall, the fires, the slots, the lobby, joining and leaving circles, seats and dragging, video panels, host controls, the flat control bar and grid, the VR control strip, the crackle audio. `installGather(app)`; debug handle `window.WVM_FIRE`. |
| `js/wvm-gather-net.js` | The realtime wrapper. Live: `WVM_SHIELD.topic()` + `WVM_SHIELD.channel()` (private Supabase channels). Dev: a BroadcastChannel between tabs (`?firetest=1`, localhost only). |
| `js/wvm-gather-rtc.js` | The WebRTC mesh (12 max), spatial voices, the camera, the mic, push to talk. |
| `js/wvm-inside.js` | **The only edits to existing code.** (1) 2 lines next to the Arcade Ring import, around line 1650: a comment and a dynamic `import('/js/wvm-gather.js')`. (2) One clause in the HUD area-name chain, around line 1671, so the top bar says "The World Fire" instead of "Chinatown" inside the hall. |

`js/wvm-outside.js` (the Lakeside Wilds campfire) is untouched. Its flame recipe (three flicker cones, the same colours and flicker maths, rising embers) is copied into `makeFire()`.

## Where it is and how you get there

- The hall: centre (1250, 0), radius 210 m, east of Chinatown, with a 26 m wall and a star dome. You arrive in the plaza beside the big decorative World Fire.
- The way in: a portal in the Grand Lobby. It is placed with `app._snap(-34, 62)` so it lands on clear floor near (-34, 62). The way out is a portal in the plaza.
- Places / map / search: `app.addPlace({ id: 'worldfire', … tile })`, so it shows in search, on the map (as an orange tile), and in `?to=worldfire`.
- Nav: `WVM_NAV.register({ id: 'worldfire', … })`, or `WVM_NAV_Q` if the rail module hasn't loaded yet. It goes in the More sheet with `vr: false`.
- VR Go menu: `app.goMenuExtra` row "🔥 The World Fire".
- Links: `/mall/?mode=3d&fire=public` opens the lobby. `/mall/?mode=3d&fire=<8-char code>` joins that private circle.

## How the circles work

- **Slots.** A hex grid with 26 m spacing gives about 180 fire circles on the floor, nearest the plaza first. The last 30 are reserved for private circles. Public circle *n* sits on slot *n−1* (it wraps after about 150).
- **One circle = one room.** Each circle has at most 12 people and one realtime channel: shield topic `wvm:a:fire-<n>` (public) or `wvm:a:fire-p<code>` (private). The database lets only adults into `wvm:a:*`.
- **The lobby channel** (`wvm:a:fire-lobby`) carries **counts only**. Each person's presence key there is a random per-visit id. The payload is `{ slot, public circle number, locked }`, with no name and no account id, so the band-wide channel never lists people. (Per the social session: no band-wide people data.)
- **Filling in order.** "Join a public circle" picks the lowest-numbered public circle with fewer than 12 people that isn't locked and that you weren't removed from in the last 10 minutes. Two people can race for the 12th seat. Every client sorts the circle by join time, and the 13th moves itself to the next circle.
- **Walking up to any fire** shows one green button: "Join this circle (n here)", "Full · find me the next circle", or, for guests, "Sit by the fire".
- **Private circles ("just my group").** "Start a private circle" makes an 8-character code and takes a free private slot. The bar's **💌 Invite** lists your allofus connections (`WVM_SOCIAL.myPeople()`, `canMessage`). Tapping one sends an allofus DM through `WVM_SOCIAL.send()` with the code as words; the text filter refuses links, so there are none. When social is live, "Only my people" is on by default: the host's client removes anyone who is neither a connection nor someone the host invited. Without social, anyone with the code (or the link from "Copy the link") can join.
- **Friends here now.** `WVM_SOCIAL.presence()` filtered to people on the mall page inside the hall's ring. Their circle is the slot they are standing at. A friend at a public circle gets a "👋 Join <name>" button. A friend just walking the hall goes through `WVM_SOCIAL.joinUser()`.

## Seats

- There are 12 logs per circle. You are given the first free seat, and you sit facing the fire (`sitPerson`, avatar yaw toward the fire, camera turned to the fire).
- **Drag to regroup.** On flat screens, drag a log with the mouse or a finger. In VR, point the laser at a log, hold the trigger and move. Logs are `wvm-screen.js` screens (`screenOn`), so both pointers already work. Positions are clamped to 2.3–7.5 m from the fire, sent at 10 Hz while you drag and once on release, and the host sends the full layout to newcomers. If someone moves your log while you sit on it, you move with it.
- Avatars come from `wvm-plus.js` (your real position is your seat, so others see you there facing the fire). Plus currently draws remote people standing, not sitting. A "seated" flag in plus's position payload would fix that (follow-up for plus/social).

## Live video and voice

- **Mesh.** WebRTC with up to 11 connections each. Signalling uses the circle's channel (`sig` messages, `to` = the target). Non-trickle ICE means one offer and one answer per pair. For every pair the larger id calls, so the two sides never offer at once (no glare). A pair still not connected after 15 s is called again.
- **Off by default.** Camera and mic stay off until you press them. The connections open with empty audio and video transceivers, so turning either on is a `replaceTrack` with no renegotiation. Video is 320×240 at 15 fps, capped at 220 kbps per sender.
- **Panels.** Each seated person has a floating panel above their seat, turned toward you. It shows their camera, or a name card (initial, name, 🎤/🔇, 👑 for the host). The frame glows while they talk. Tap a panel to get "Mute for me" plus `WVM_SHIELD.playerActions()` (Mute / Block / Report), and Remove if you are the host.
- **Grid mode** (flat): ▦ Grid gives a Zoom-style tile grid of everyone in the circle.
- **Spatial voices.** Each remote track goes to a WebAudio PannerNode (HRTF) at the speaker's seat, and the listener follows the camera (the XR camera in VR).
- **Push to talk.** 🎙️ toggles it. Then hold Space, or the "Hold to talk" button on phones, or the **left grip** in VR.
- **VR control strip.** A lap panel in front of your seat, driven by the laser: Mic, PTT, Cam, Sit/Stand, Host (or Invite), Leave. A Quest has no face camera, so in VR the camera button reports that and voice still works.
- **Host.** The host is the person who has been in the circle longest (in a private circle, its creator). Host controls are 🔇 Mute everyone, 🔒 Close the circle to new people, and 🚪 Remove someone (that person can't rejoin the same circle for 10 min). These run through the circle channel and are also passed to `WVM_SHIELD.kick / muteAll / lockRoom` (or `lock`) **if the shield exposes them**. The shield branch doesn't have those calls yet, so today enforcement is client-side (see Limits).

## Who can do what (18+ only)

- **Eligibility** comes from `WVM_SHIELD.status()`: signed in, `band === 'adult'`, not held or banned. Then `WVM_SHIELD.canJoinRoom('fire:<key>')` is checked if it exists. With no shield on the page, nobody goes live (it fails closed).
- **Everyone else** (guests, under-18s, no date of birth) sees the hall and the fires and can **sit by any fire alone**. The lobby explains why live circles are closed to them and offers Sign in or Add date of birth.
- Blocked people (`canSee` false) and people you muted (`isMuted`) are left out of your mesh and your panels. Names go through `safeName` / `filterText`. The mic checks `WVM_SHIELD.canTalk()` first.

## Fire and sound

- **Every fire** uses the outdoor campfire technique. The fire nearest you (or your circle's fire) is the full detailed one, with cones, embers, a halo and a floor glow. All the others are drawn in 4 instanced draw calls (stone rings, 12 logs each, flame cones, glow), and the floor glow under each fire is baked into one floor texture.
- **Crackle.** It plays `/audio/world-fire-crackle.mp3` if that file exists (**drop the ElevenLabs file there**; a seamless loop of about 10–30 s works best). If not, it plays a generated 4-second crackle loop. The sound is positional at the nearest fire.

## Performance (Quest 3, 72 fps target)

- No lights are added. Everything in the hall is unlit (`MeshBasicMaterial`), so it looks the same day or night and adds no shader recompiles.
- There is one detailed fire at a time; the rest are instanced.
- **Video textures** are used only for the nearest panels in front of you: **5 on a headset or phone, 11 on a desktop**, re-picked every 0.4 s. Panels out of budget show the static name card.
- Canvases: the floor is 2048 px (1024 on phones), the sky is 4096×2048 (2048×1024 on phones), and the wall is 512×256 repeated.
- Moving things are flagged `noFreeze`, and the hall group is `noCull`.

## How to test

### Two browser windows, no accounts (dev mode)

1. Serve the repo locally, e.g. `npx serve .` or any static server, and open **`http://localhost:<port>/mall/?firetest=1`** in two windows of the same browser. The mall's 3D boot can reload the page without the query, so the switch is remembered on that device: `localStorage.wf_firetest = '1'`, cleared with `?firetest=0`. If the first load misses it, run `localStorage.wf_firetest='1'` in the console and reload. Test mode only works on localhost / 127.0.0.1 / `*.localhost` / `*.test`. Each tab gets its own test identity, and messages travel over a BroadcastChannel.
2. In each window, search "fire" (or use the portal in the Grand Lobby, or `?to=worldfire`), walk up to the lobby stone, then **Join a public circle**. Both land in circle 1 and sit.
3. Turn the camera on in one window and the mic on in the other. Check the panel above the seat, ▦ Grid, push to talk with Space, dragging a log (it moves in the other window too), and host controls (the first window is the host).
4. Console: `WVM_FIRE.st` shows state, `WVM_FIRE.st.circle.mesh.stats()` shows the peer states, and `WVM_FIRE.join('2')` jumps to circle 2.

The headless check (Edge `--use-fake-device-for-media-stream`, two tabs, one browser) is recorded in the commit message.

### Live, two accounts

You need two **adult** allofus accounts (DOB set) on two devices or two browser profiles, and the shield SQL (`wvm-shield-v40.sql`) run, because the realtime topics are private and checked by `wvm_rt_allowed`. Go to `/mall/?mode=3d&fire=public` on both.

### Quest 3

Open `/mall/?vr=1`, then pick 🔥 The World Fire from the Go menu. Join with the laser on the lobby stone. Check the lap strip (Mic, PTT), the left grip for push to talk, dragging a log with the trigger, and voices coming from the speaker's seat. Use `/mall/?xrsim=1&firetest=1` on localhost for the simulator.

## Limits and known gaps

- **12 per circle, mesh only.** Each person uploads to 11 others: about 1.6 Mbps up with all cameras on, less with audio only. More than about 12 would need an SFU (LiveKit, Cloudflare Calls, Daily); that isn't needed at 12.
- **Host controls are honour-system** until the shield has `kick` / `muteAll` / `lockRoom` with server checks. A modified client could ignore a kick, or claim to be host in a public circle, though it still only reaches verified adults on that circle's private topic. Reports and blocks *are* server-side (shield).
- **Sender ids in signalling are client-claimed** (broadcast `from`). `WVM_SHIELD.send('sig')` is server-stamped but caps payloads at 4 KB, and a video SDP is often larger. Raising that cap for `sig` would let signalling move there.
- **Plus-layer avatars** stand rather than sit, and at very large crowds everyone in the hall shares plus's 250 m position buckets. That is plus's scaling, not the circles'.
- **Slot wrap.** After about 150 busy public circles (about 1,800 people) circle *n+150* shares a floor slot with circle *n*. The rooms are still separate; only the avatars overlap.
- **Lobby presence size.** One presence entry per person in the hall. Fine for hundreds; at thousands it should be sharded (`fire-lobby-<k>`).
- The service worker doesn't precache `wvm-gather*.js` (they load from the network, then the browser cache). Final QA should add them to `PRECACHE_CODE` in `sw.js` and bump `V`, together with the other branches.
- Lockdown build: there are no new external hosts (STUN/TURN isn't governed by CSP `connect-src`). `/audio/world-fire-crackle.mp3` is same-origin.

## What Zach must provide

1. **TURN server (recommended for launch).** Without one, about 10–15% of people on strict corporate or mobile networks connect to no one. Put it in `js/wvm-config.js`:
   ```js
   TURN: { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: '…', credential: '…' },
   ```
   (or an array of such entries; `window.WVM_TURN` also works). Options: Cloudflare Calls TURN (short-lived credentials need a tiny server endpoint), Twilio or Xirsys (pay as you go), or your own coturn on a $5 VPS. Static credentials in a public JS file can be used by anyone, so prefer short-lived ones.
2. **The crackle sound**: `/audio/world-fire-crackle.mp3` (from the content session or ElevenLabs).
3. **Shield host calls**: `canJoinRoom`, `kick`, `muteAll`, `lockRoom` (server-enforced), when the shield session gets to them. The code already calls them if they exist.
