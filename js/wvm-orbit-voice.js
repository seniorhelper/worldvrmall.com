/* ============================================================
   ORBIT'S VOICE · Oct 25 2026
   · Orbit says his fixed answers out loud for everyone: /audio/orbit-<line>.mp3 (ElevenLabs, voice "Liam",
     made once in the dashboard, no API call at run time)
   · "Ask out loud" (signed-in adults only, WVM_SHIELD.ageLevel() !== 'guest'): push-to-talk, at most 7 s,
     the mic is opened only while the Listening card is up and closed right after; the clip goes to our
     Supabase edge function orbit-voice (ElevenLabs speech-to-text + Orbit's fixed answers + text-to-speech,
     the key lives only in Supabase secrets), nothing is stored. The server picks the answer, never says
     the visitor's words back, and rate-limits per person and per day.
   · a neon voice box under Orbit lights up with his voice (wvm-voicebox.js)
   window.WVM_ORBIT_VOICE = { speaking, say(line), talk() }
   ============================================================ */
import * as THREE from 'three';
import { makeVoiceBox } from './wvm-voicebox.js';
import { CONFIG } from './wvm-config.js';
const T = THREE;
export const LINES = ['greet', 'mall', 'vr', 'rides', 'join', 'brand', 'bug', 'signin', 'busy', 'sorry'];
const MAX_REC = 7000;

export function installOrbitVoice(app, orbit) {
  if (app._orbitVoice) return app._orbitVoice;
  const box = makeVoiceBox({ w: 0.46, bars: 9 }); box.mesh.visible = false; app.scene.add(box.mesh);
  const cam = new T.Vector3(); let until = 0, cur = null, an = null, busy = false;
  const snd = () => window.WVM_SOUND;
  const analyser = (ctx) => { if (an && an.context === ctx) return an; an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.55; an.connect(ctx.destination); return an; };
  /* play an ArrayBuffer (mp3) through the shared context, into the voice box */
  async function playBuf(ab) {
    const S = snd(); const ctx = S && S.context(); if (!ctx || !S.on) return false;
    try { await ctx.resume(); } catch (e) { }
    const buf = await ctx.decodeAudioData(ab); if (cur) { try { cur.stop(); } catch (e) { } }
    const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.95; src.connect(g); g.connect(analyser(ctx));
    box.setSource(an); api.speaking = true; until = Infinity; cur = src;
    src.onended = () => { if (cur === src) { cur = null; api.speaking = false; until = performance.now() + 900; box.setSource(null); } };
    src.start(); return true;
  }
  const cache = new Map();
  async function say(line) {
    if (!LINES.includes(line)) return false; const S = snd(); if (!S || !S.on) return false;
    try { let ab = cache.get(line); if (!ab) { ab = await (await fetch('/audio/orbit-' + line + '.mp3')).arrayBuffer(); cache.set(line, ab); } return await playBuf(ab.slice(0)); } catch (e) { return false; }
  }
  const token = () => { try { const ref = new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0]; const s = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null'); return s && s.access_token && s.expires_at * 1000 > Date.now() ? s.access_token : null; } catch (e) { return null; } };
  const adult = () => { const SH = window.WVM_SHIELD; try { return !!(SH && SH.ageLevel && SH.ageLevel() !== 'guest'); } catch (e) { return false; } };

  /* push-to-talk: one card, Done / Cancel; the mic is live only while the card is up */
  async function talk() {
    if (busy) return; const tk = token();
    if (!adult() || !tk) { say('signin'); app.toast && app.toast('🎙️ Talking to Orbit out loud is for signed-in adults. Tap a topic instead, and Orbit answers out loud.', 6000); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { app.toast && app.toast('🎙️ This browser cannot record. Tap a topic instead.', 4000); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (e) { app.toast && app.toast('🎙️ No microphone access. Tap a topic instead.', 4000); return; }
    busy = true; const S = snd(); const ctx = S && S.context();
    if (ctx) { try { const ms = ctx.createMediaStreamSource(stream); const a = ctx.createAnalyser(); a.fftSize = 512; ms.connect(a); box.setSource(a); until = Infinity; } catch (e) { } }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined); const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    let cancelled = false; const stopT = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, MAX_REC);
    const done = new Promise((r) => { rec.onstop = r; }); rec.start();
    app.popup && app.popup('🎙️ Orbit is listening', '<p>Ask about a store, a ride, VR controls or renting a store. Up to 7 seconds. Your voice is turned into text to answer you, then thrown away.</p>', [{ label: '✅ Done', fn: () => { if (rec.state === 'recording') rec.stop(); } }, { label: 'Cancel', fn: () => { cancelled = true; if (rec.state === 'recording') rec.stop(); } }]);
    await done; clearTimeout(stopT); stream.getTracks().forEach((t) => t.stop()); box.setSource(null); until = performance.now() + 400;
    try { app.closePopup ? app.closePopup() : (app.pop && app.pop.classList && app.pop.classList.remove('on')); } catch (e) { }
    if (cancelled || !parts.length) { busy = false; return; }
    const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
    try {
      const r = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/orbit-voice', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': blob.type }, body: blob });
      if (r.status === 429 || r.status === 503) { say('busy'); app.toast && app.toast('🪐 Orbit is busy. Try again in a minute.', 4000); return; }
      if (r.status === 403) { say('signin'); return; }
      const j = await r.json(); if (!r.ok) throw new Error('orbit-voice ' + r.status);
      if (j.heard) app.toast && app.toast('🎙️ "' + String(j.heard).slice(0, 120) + '"', 3500);
      setTimeout(() => app.toast && app.toast('🪐 ' + j.reply, 7000), 600);
      if (j.line) say(j.line); else if (j.audio) { const bin = atob(j.audio); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); playBuf(u8.buffer); }
      if (j.place && app.places && app.travel) { const p = app.places.find((q) => q.id === j.place); if (p) setTimeout(() => app.travel(p), 1800); }
    } catch (e) { say('sorry'); }
    finally { busy = false; }
  }

  /* the box floats just under Orbit, always facing you */
  app.onUpdate((dt, t) => {
    const show = api.speaking || performance.now() < until; box.mesh.visible = show && orbit.group.visible; if (!box.mesh.visible) return;
    orbit.group.getWorldPosition(box.mesh.position); box.mesh.position.y -= 0.55;
    (app.renderer.xr.isPresenting ? app.renderer.xr.getCamera() : app.camera).getWorldPosition(cam); box.mesh.lookAt(cam); box.update(t);
  });
  const api = { speaking: false, say, talk, box };
  app._orbitVoice = api; window.WVM_ORBIT_VOICE = api; return api;
}
