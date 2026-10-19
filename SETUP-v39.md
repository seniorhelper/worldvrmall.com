# World VR Mall v39 · setup
1. Upload this folder to the repo root (replace everything).
2. Supabase (the same allofus.one project) → SQL Editor → run `worldvrmall-v39.sql` (prizes, claims, leads).
3. Optional email alerts: Supabase → Database → Webhooks → INSERT on `prize_claims` and on `leads` → Zapier → Gmail.
4. Prize claims and leads show in Supabase → Table Editor → prize_claims / leads. If the claim system ever fails, players are shown 1-800-481-8638 and info@eyetoad.com with their claim code.

## v10.0 (Oct 19 2026) — the Quest 3 round
No SQL. `sw.js` is v91. Files: js/wvm-xr.js (the shared VR layer, identical to allofus.one `js/aou-xr.js` / `_mall/wvm-xr.js` except the module names at the top), js/wvm-arrival.js (new: the mall's cinematic arrival), js/wvm-engine.js, js/wvm-shell.js, js/wvm-inside.js, js/wvm-outside.js, js/wvm-orbit3d.js, js/wvm-bot.js, sw.js, llms.txt.
- **Test in the headset with** `https://worldvrmall.com/?vr=1&vrdebug=1` (island) and `https://worldvrmall.com/mall/?vr=1&vrdebug=1` (inside). The panel in your view shows the session, every input source, the menu's state, draw calls and the last errors; **B** sends it to Supabase → Table editor → `bugs` (kind `vr`). The flag follows you through every door.
- **Menu:** X or Y, a 1.5-s squeeze on either grip, a laser tap on the watch face on the left wrist, a long pinch (hand tracking), or the glowing MENU pad on the floor a step ahead (laser tap or pinch). Go = every store and place in this world (stores indexed by letter); Worlds = allofus.one, the island/inside, the rest of the network.
- **Doors:** a page hop ends the session cleanly and the next page shows "Tap once · back into VR". If VR ever closes by itself the same door comes back; if the GPU context is lost a "Tap to continue" card reloads the page where you stood.
- **Desktop QA harness:** `?xrsim=1` fakes the session (controllers connect 60 ms after start like a real headset; `app._xrSim.order = [1, 0]` swaps the slots, `app._xrSim.handsMode(true)` is hand tracking), `app._xrApi.snapshot()` is the diagnostics snapshot, `app._xr._arrival.k()` the arrival clock, `app.freezeStatic()` the matrix freeze, `app._xrApi.goPlace(place)` lands anywhere.
